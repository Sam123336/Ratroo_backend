import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Groq from 'groq-sdk';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { JourneyService } from '../../journey/services/journey.service';
import { SearchService } from '../../search/services/search.service';

/**
 * Natural-language front door to the journey planner.
 *
 * The model translates and explains. It never decides transit facts.
 *
 * Every route, time and fare in an answer comes from a tool call into the same
 * services the REST API uses. The model cannot answer without calling one, and
 * when a tool returns nothing the honest reply is "no route found" — not an
 * invented one. This is the rule in docs/14-ai.md, and it matters more here
 * than elsewhere: a fabricated departure time sends someone to an empty stop.
 *
 * Place names are resolved by the database, not the model. The model extracts
 * the string a user typed; `/v1/search` decides which of 5,700 real places it
 * is. That also sidesteps the model's weaker grasp of Bengali place names.
 */
const SYSTEM_PROMPT = `You are Ratroo's transit assistant for West Bengal, India.

You help people find buses, trams, ferries and trains. Users may write in
English, Bengali, or transliterated Bengali ("sealdah theke bongaon").

RULES — these are absolute:
- NEVER invent a route, departure time, fare, stop name or duration. Every fact
  you state must come from a tool result in this conversation.
- If a tool returns no result, say plainly that you could not find a route. Do
  not guess or offer a plausible-sounding alternative.
- Fares marked ESTIMATED_BY_DISTANCE are approximations, not official tariffs — say so. If fareIncomplete is true, the total covers only some legs.
- Times marked INTERPOLATED are estimates. Say so. Times marked SCRAPED or
  OFFICIAL come from the operator and can be stated plainly.
- Do not translate place names. Pass what the user typed to search_places and
  use the canonical name the tool returns.

Reply in the language the user wrote in.

STARTING POINT:
- If a "USER LOCATION" note appears below, that is where the user is standing.
  When they name only one place, treat it as the DESTINATION and plan from
  their nearest stop. Do not ask them where they are starting from.
- Only ask for a starting point when there is no USER LOCATION note.

FORMAT — the reply is shown in a chat bubble, not a web page:
- Plain text only. Never write ** or ## or markdown tables; asterisks appear
  literally on screen.
- Open with one line: 🚏 <origin> → <destination>, then total time and fare.
- Then one line per leg, in order, each starting with an emoji:
  🚌 bus, 🚶 walk, 🚇 metro, 🚉 train, ⛴️ ferry, 🚊 tram.
- Put the boarding time first when a time is known, then the service name, then
  where to get off, then the duration. Example:
  🚌 06:30  WBBus service 112 — Kolkata to Arambagh (3 h 11 m)
- Say "time not published" rather than leaving a leg without a time.
- Close with one short line for caveats (estimated fares, interpolated times).
- No more than 10 lines total.`;

const TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_places',
      description:
        'Find real stops and places by name. Use this to resolve any location a user mentions before planning. Returns canonical names and ids.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Place name as the user wrote it.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_journey',
      description:
        'Plan a journey between two places, including transfers and walking. Returns legs with real services and times, or an error if no route exists.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Origin place name.' },
          to: { type: 'string', description: 'Destination place name.' },
        },
        required: ['from', 'to'],
      },
    },
  },
];

/**
 * Qwen exposes a thinking mode and emits its scratchpad inline. Users must not
 * see the model reasoning about them, so the block is removed. An unterminated
 * <think> means the reply was cut off mid-thought — return nothing rather than
 * a half-finished thought presented as an answer.
 */
function stripReasoning(text: string): string {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (cleaned) return cleaned;
  return /<think>/i.test(text) ? '' : text.trim();
}

/** Bounded so a confused model cannot loop indefinitely on tool calls. */
const MAX_TOOL_ROUNDS = 5;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private readonly model = process.env.GROQ_MODEL || 'qwen/qwen3.6-27b';
  private client?: Groq;

  constructor(
    private readonly journeys: JourneyService,
    private readonly search: SearchService,
    private readonly sequelize: Sequelize,
  ) {}

  private groq(): Groq {
    if (!process.env.GROQ_API_KEY) {
      throw new ServiceUnavailableException('GROQ_API_KEY is not configured.');
    }
    this.client ??= new Groq({ apiKey: process.env.GROQ_API_KEY });
    return this.client;
  }

  async ask(
    question: string,
    origin?: { lat: number; lng: number },
  ): Promise<{ answer: string; toolCalls: string[]; model: string }> {
    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Resolved to real stop names here rather than handed to the model as raw
    // coordinates, which it cannot match against the network.
    const here = origin ? await this.describeLocation(origin.lat, origin.lng) : null;
    if (here) messages.push({ role: 'system', content: here });

    messages.push({ role: 'user', content: question });
    const toolCalls: string[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // On the final round, withhold the tools so the model must answer in
      // prose. Otherwise it can spend every round calling tools and never
      // produce a reply — which is what "I could not work that out" was.
      const isLastRound = round === MAX_TOOL_ROUNDS - 1;

      const completion = await this.groq().chat.completions.create({
        model: this.model,
        messages,
        ...(isLastRound ? {} : { tools: TOOLS }),
        temperature: 0.3, // Low: this is extraction and explanation, not creativity.
        // Qwen thinks by default and was spending its whole budget in <think>,
        // which truncated the answer away entirely and left the user watching
        // "Checking routes..." for a minute. Nothing here needs deliberation:
        // the routes come from tools, and the model only has to format them.
        reasoning_effort: 'none',
        max_completion_tokens: 900,
      });

      const choice = completion.choices[0]?.message;
      if (!choice) break;

      messages.push(choice as Groq.Chat.Completions.ChatCompletionMessageParam);

      if (!choice.tool_calls?.length) {
        const answer = stripReasoning(choice.content ?? '');

        // Blank means the reply was all reasoning and got cut off before the
        // answer. Returning it rendered an empty chat bubble with a "from live
        // route data" badge under it. Ask again instead: the tool results are
        // still in the conversation, so the retry is cheap.
        if (answer) return { answer, toolCalls, model: this.model };

        this.logger.warn('Assistant returned only reasoning; retrying for an answer.');
        messages.push({
          role: 'user',
          content: 'Give the answer only, in the format above. Do not think out loud.',
        });
        continue;
      }

      for (const call of choice.tool_calls) {
        const name = call.function.name;
        toolCalls.push(name);

        let result: unknown;
        try {
          result = await this.runTool(name, JSON.parse(call.function.arguments || '{}'));
        } catch (error) {
          // The model must see the failure, so it reports "not found" rather
          // than filling the silence with something plausible.
          result = { error: error instanceof Error ? error.message : String(error) };
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 6000),
        });
      }
    }

    this.logger.warn(`Assistant hit the tool-round limit for: ${question.slice(0, 80)}`);
    return {
      answer: 'I could not work that out. Try naming a specific stop, for example "Sealdah to Bongaon".',
      toolCalls,
      model: this.model,
    };
  }

  /**
   * The stops within walking reach of the user, named so plan_journey can use
   * them. Returns null when nothing is close enough to board — better that the
   * model asks for a starting point than plans from a stop 40 km away.
   */
  private async describeLocation(lat: number, lng: number): Promise<string | null> {
    const rows = await this.sequelize.query<{ name: string; metres: number }>(
      `SELECT name,
              ST_DistanceSphere(
                ST_MakePoint(longitude, latitude),
                ST_MakePoint(:lng, :lat)
              ) AS metres
       FROM stops
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
       ORDER BY metres
       LIMIT 5`,
      { replacements: { lat, lng }, type: QueryTypes.SELECT },
    );

    const walkable = rows.filter(row => Number(row.metres) <= 3000);
    if (!walkable.length) return null;

    const list = walkable
      .map(row => `${row.name} (${Math.round(Number(row.metres))} m away)`)
      .join(', ');

    return `USER LOCATION: the user is at ${lat.toFixed(5)}, ${lng.toFixed(5)}. ` +
      `Their nearest stops are: ${list}. Use the closest one as the origin when ` +
      `the user names only a destination.`;
  }

  private async runTool(name: string, args: Record<string, string>) {
    switch (name) {
      case 'search_places': {
        const result = await this.search.search(args.query);
        // Trim to what the model needs to choose — ids and names, not geometry.
        return (result.data ?? []).slice(0, 8).map(p => ({
          title: p.title, category: p.category,
        }));
      }
      case 'plan_journey': {
        const result = await this.journeys.planJourney(args.from, args.to);
        const data = result.data as unknown as Record<string, unknown>;
        return {
          totalDurationMinutes: data.totalDurationMinutes,
          totalDistanceKm: data.totalDistanceKm,
          transfersCount: data.transfersCount,
          totalFareINR: data.totalFare,
          fareIncomplete: data.fareIncomplete,
          fareNote: data.fareSources,
          legs: (data.legs as Record<string, unknown>[]).map(l => ({
            mode: l.mode, from: l.fromName, to: l.toName,
            minutes: l.durationMinutes, service: l.serviceName,
          })),
        };
      }
      default:
        return { error: `Unknown tool ${name}` };
    }
  }
}
