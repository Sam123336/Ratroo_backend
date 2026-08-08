import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Groq from 'groq-sdk';
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

Reply in the language the user wrote in. Be brief and concrete: which service to
board, where to change, roughly how long it takes.`;

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
  ) {}

  private groq(): Groq {
    if (!process.env.GROQ_API_KEY) {
      throw new ServiceUnavailableException('GROQ_API_KEY is not configured.');
    }
    this.client ??= new Groq({ apiKey: process.env.GROQ_API_KEY });
    return this.client;
  }

  async ask(question: string): Promise<{ answer: string; toolCalls: string[]; model: string }> {
    const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: question },
    ];
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
        max_completion_tokens: 1024,
      });

      const choice = completion.choices[0]?.message;
      if (!choice) break;

      messages.push(choice as Groq.Chat.Completions.ChatCompletionMessageParam);

      if (!choice.tool_calls?.length) {
        return { answer: stripReasoning(choice.content ?? ''), toolCalls, model: this.model };
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
