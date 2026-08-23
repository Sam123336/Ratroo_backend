import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import {
  CanonicalAgency,
  CanonicalMobilityNode,
  CanonicalRoutePattern,
  CanonicalSourceObservation,
} from '../domain/canonical-mobility';

export type BmrclSourceKind =
  | 'NETWORK'
  | 'LINES'
  | 'STATIONS'
  | 'TIMETABLE'
  | 'FARES'
  | 'SERVICE_ALERTS';

export interface BmrclDiscoveryItem {
  sourceKind: BmrclSourceKind;
  url: string;
  effectiveFrom?: string;
  metadata?: Record<string, unknown>;
}

export interface BmrclRawPage {
  sourceKind: BmrclSourceKind;
  url: string;
  html: string;
  fetchedAt: string;
  contentHash: string;
  rawRecordId: string;
}

export interface BmrclParsedStation {
  externalId: string;
  name: string;
  lineName: string;
  sequence: number;
  isInterchange: boolean;
  stationCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface BmrclParsedLine {
  externalId: string;
  name: string;
  color: string;
  operationalStatus: 'ACTIVE' | 'PLANNED' | 'UNDER_CONSTRUCTION' | 'UNKNOWN';
  stations: BmrclParsedStation[];
}

export interface BmrclParsedNetwork {
  sourceUrl: string;
  fetchedAt: string;
  contentHash: string;
  rawRecordIds: string[];
  lines: BmrclParsedLine[];
  warnings: string[];
}

export interface BmrclCanonicalOutput {
  agencies: CanonicalAgency[];
  nodes: CanonicalMobilityNode[];
  routePatterns: CanonicalRoutePattern[];
  sourceObservations: CanonicalSourceObservation[];
}

export interface BmrclValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

const BMRCL_DISCOVERY_ITEMS: BmrclDiscoveryItem[] = [
  {
    sourceKind: 'LINES',
    url: 'https://www.bmrc.co.in/metro-network/',
    metadata: {
      sourceName: 'BMRCL official metro network page',
    },
  },
  {
    sourceKind: 'STATIONS',
    url: 'https://www.bmrc.co.in/',
    metadata: {
      sourceName: 'BMRCL official home and fare station selector page',
    },
  },
];

const MAINTAINED_STATION_ORDER: Array<Omit<BmrclParsedLine, 'operationalStatus'>> = [
  {
    externalId: 'purple-line',
    name: 'Purple Line',
    color: 'PURPLE',
    stations: [
      'Whitefield',
      'Hopefarm',
      'Kadugodi Tree Park',
      'Pattandur Agrahara',
      'Sri Sathya Sai Hospital',
      'Nallurhalli',
      'Kundalahalli',
      'Seetharampalya',
      'Hoodi',
      'Garudacharpalya',
      'Singayyanapalya',
      'K.R. Pura',
      'Benniganahalli',
      'Baiyappanahalli',
      'Swami Vivekananda Road',
      'Indiranagar',
      'Halasuru',
      'Trinity',
      'MG Road',
      'Cubbon Park',
      'Vidhana Soudha',
      'Central College',
      'Majestic',
      'City Railway Station',
      'Magadi Road',
      'Hosahalli',
      'Vijayanagara',
      'Attiguppe',
      'Deepanjali Nagar',
      'Mysuru Road',
      'Nayandahalli',
      'RR Nagar',
      'Jnanabharathi',
      'Pattanagere',
      'Kengeri Bus Terminal',
      'Kengeri',
      'Challaghatta',
    ].map((name, index) => maintainedStation(name, 'Purple Line', index + 1)),
  },
  {
    externalId: 'green-line',
    name: 'Green Line',
    color: 'GREEN',
    stations: [
      'Madavara',
      'Chikkabidarakallu',
      'Manjunathanagara',
      'Nagasandra',
      'Dasarahalli',
      'Jalahalli',
      'Peenya Industry',
      'Peenya',
      'Goraguntepalya',
      'Yeshwanthpur',
      'Sandal Soap Factory',
      'Mahalakshmi',
      'Rajajinagar',
      'Kuvempu Road',
      'Srirampura',
      'Sampige Road',
      'Majestic',
      'Chickpete',
      'KR Market',
      'National College',
      'Lalbagh',
      'South End Circle',
      'Jayanagara',
      'RV Road',
      'Banashankari',
      'JP Nagar',
      'Yelachenahalli',
      'Konanakunte Cross',
      'Doddakallasandra',
      'Vajarahalli',
      'Thalaghattapura',
      'Silk Institute',
    ].map((name, index) => maintainedStation(name, 'Green Line', index + 1)),
  },
  {
    externalId: 'yellow-line',
    name: 'Yellow Line',
    color: 'YELLOW',
    stations: [
      'RV Road',
      'Ragigudda',
      'Jayadeva Hospital',
      'BTM Layout',
      'Central Silk Board',
      'Bommanahalli',
      'Hongasandra',
      'Kudlu Gate',
      'Singasandra',
      'Hosa Road',
      'Beratena Agrahara',
      'Electronic City',
      'Infosys Agrahara',
      'Huskur Road',
      'Hebbagodi',
      'Bommasandra',
    ].map((name, index) => maintainedStation(name, 'Yellow Line', index + 1)),
  },
];

function maintainedStation(name: string, lineName: string, sequence: number): BmrclParsedStation {
  return {
    externalId: slug(`${lineName}-${name}`),
    name,
    lineName,
    sequence,
    isInterchange: ['majestic', 'rv-road'].includes(slug(name)),
  };
}

export class BmrclStaticNetworkDiscovery {
  discover(): BmrclDiscoveryItem[] {
    return BMRCL_DISCOVERY_ITEMS;
  }
}

export class BmrclStaticNetworkParser {
  parse(rawPages: BmrclRawPage[]): BmrclParsedNetwork {
    const warnings: string[] = [];
    const fixtureLines = this.parseStructuredFixture(rawPages);
    const lines = fixtureLines.length ? fixtureLines : this.parseMaintainedFallback(rawPages, warnings);

    if (!fixtureLines.length) {
      warnings.push(
        'Official BMRCL HTML did not expose a machine-readable station sequence; used maintained BMRCL line-order fallback.',
      );
    }

    return {
      sourceUrl: rawPages.map(page => page.url).join(','),
      fetchedAt: rawPages[0]?.fetchedAt || new Date().toISOString(),
      contentHash: sha256(rawPages.map(page => page.contentHash).sort().join('|')),
      rawRecordIds: rawPages.map(page => page.rawRecordId),
      lines,
      warnings,
    };
  }

  private parseStructuredFixture(rawPages: BmrclRawPage[]): BmrclParsedLine[] {
    const lines: BmrclParsedLine[] = [];

    for (const page of rawPages) {
      const $ = cheerio.load(page.html);
      $('[data-bmrcl-line]').each((_, element) => {
        const lineElement = $(element);
        const lineName = lineElement.attr('data-bmrcl-line')?.trim() || lineElement.find('h1,h2,h3').first().text().trim();
        const stations: BmrclParsedStation[] = [];

        lineElement.find('[data-station-name], li, tr').each((index, stationElement) => {
          const station = $(stationElement);
          const name = (station.attr('data-station-name') || station.find('[data-name]').first().text() || station.text())
            .replace(/\bITERM\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

          if (!name || /^\d+$/.test(name)) {
            return;
          }

          const sequence = Number(station.attr('data-sequence') || station.find('[data-sequence]').first().text() || index + 1);
          stations.push({
            externalId: station.attr('data-external-id') || slug(`${lineName}-${name}`),
            name,
            lineName,
            sequence,
            isInterchange: station.attr('data-interchange') === 'true' || /ITERM|interchange/i.test(station.text()),
            stationCode: station.attr('data-station-code') || undefined,
          });
        });

        if (lineName && stations.length) {
          lines.push({
            externalId: slug(lineName),
            name: normalizeLineName(lineName),
            color: inferLineColor(lineName),
            operationalStatus: 'ACTIVE',
            stations,
          });
        }
      });
    }

    return lines;
  }

  private parseMaintainedFallback(rawPages: BmrclRawPage[], warnings: string[]): BmrclParsedLine[] {
    const text = rawPages
      .map(page => cheerio.load(page.html)('body').text())
      .join(' ')
      .replace(/\s+/g, ' ');

    if (!/BMRCL|Metro|ಮೆಟ್ರೋ|Bangalore Metro|ಬೆಂಗಳೂರು ಮೆಟ್ರೋ/i.test(text)) {
      warnings.push('Official source text did not contain expected BMRCL metro markers.');
    }

    return MAINTAINED_STATION_ORDER.map(line => {
      const { status, reason } = statusFromSource(line.name, text);
      if (reason) warnings.push(reason);

      return {
        ...line,
        operationalStatus: status,
        stations: line.stations.map(station => ({ ...station })),
      };
    });
  }
}

export class BmrclStaticNetworkValidator {
  validate(network: BmrclParsedNetwork): BmrclValidationResult {
    const errors: string[] = [];
    const warnings = [...network.warnings];

    if (!network.rawRecordIds.length) {
      errors.push('No raw source record exists.');
    }

    if (!network.lines.length) {
      errors.push('Parsed output is empty.');
    }

    const externalStationIds = new Map<string, string>();

    for (const line of network.lines) {
      if (line.stations.length < 2) {
        errors.push(`${line.name} has fewer than two stations.`);
      }

      const sequences = new Set<number>();
      const stationIds = new Set<string>();

      for (const station of line.stations) {
        if (sequences.has(station.sequence)) {
          errors.push(`${line.name} contains duplicate station sequence ${station.sequence}.`);
        }
        sequences.add(station.sequence);

        if (stationIds.has(station.externalId)) {
          errors.push(`${line.name} references station ${station.externalId} more than once.`);
        }
        stationIds.add(station.externalId);

        const normalized = normalizeStationName(station.name);
        const previous = externalStationIds.get(station.externalId);
        if (previous && previous !== normalized) {
          errors.push(`External station ID ${station.externalId} maps to multiple unrelated stations.`);
        }
        externalStationIds.set(station.externalId, normalized);

        if (!station.stationCode) {
          warnings.push(`${station.name} is missing station code.`);
        }
        if (station.latitude === undefined || station.longitude === undefined) {
          warnings.push(`${station.name} is missing coordinates.`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: Array.from(new Set(warnings)),
    };
  }
}

export class BmrclStaticNetworkMapper {
  map(network: BmrclParsedNetwork): BmrclCanonicalOutput {
    const agency: CanonicalAgency = {
      externalId: 'bmrcl',
      providerCode: 'BMRCL_METRO',
      name: 'Bangalore Metro Rail Corporation Limited',
      shortName: 'BMRCL',
      website: 'https://www.bmrc.co.in/',
      geography: {
        countryCode: 'IN',
        stateCode: 'KA',
        city: 'Bengaluru',
        metropolitanArea: 'Bengaluru Metropolitan Region',
      },
    };

    const nodesByNormalizedName = new Map<string, CanonicalMobilityNode>();

    for (const line of network.lines) {
      for (const station of line.stations) {
        const normalizedName = normalizeStationName(station.name);
        const existing = nodesByNormalizedName.get(normalizedName);
        const lineRef = { lineExternalId: line.externalId, lineName: line.name, sequence: station.sequence };

        if (existing) {
          existing.nodeType = 'METRO_STATION';
          existing.aliases = Array.from(new Set([...existing.aliases, station.name]));
          existing.confidence = Math.max(existing.confidence, 0.82);
          existing['metadata'] = {
            ...((existing as unknown as { metadata?: Record<string, unknown> }).metadata || {}),
            isInterchange: true,
            lines: [
              ...((((existing as unknown as { metadata?: Record<string, unknown> }).metadata || {}).lines as unknown[]) || []),
              lineRef,
            ],
          };
          continue;
        }

        const node = {
          externalId: slug(station.name),
          providerCode: 'BMRCL_METRO',
          nodeType: 'METRO_STATION',
          name: station.name,
          normalizedName,
          aliases: [],
          latitude: station.latitude,
          longitude: station.longitude,
          geography: {
            countryCode: 'IN',
            stateCode: 'KA',
            city: 'Bengaluru',
            metropolitanArea: 'Bengaluru Metropolitan Region',
          },
          confidence: 0.82,
          metadata: {
            isInterchange: station.isInterchange,
            lines: [lineRef],
          },
        } as CanonicalMobilityNode & { metadata: Record<string, unknown> };
        nodesByNormalizedName.set(normalizedName, node);
      }
    }

    const routePatterns: CanonicalRoutePattern[] = network.lines.map(line => ({
      externalId: line.externalId,
      providerCode: 'BMRCL_METRO',
      agencyExternalId: 'bmrcl',
      mode: 'METRO',
      shortName: line.name.replace(/\s+Line$/i, ''),
      longName: line.name,
      operationalStatus: line.operationalStatus,
      serviceClass: 'REGULAR',
      stops: line.stations.map(station => ({
        nodeExternalId: slug(station.name),
        name: station.name,
        sequence: station.sequence,
        pickupAllowed: true,
        dropoffAllowed: true,
      })),
    }));

    return {
      agencies: [agency],
      nodes: Array.from(nodesByNormalizedName.values()),
      routePatterns,
      sourceObservations: network.rawRecordIds.map(rawRecordId => ({
        providerCode: 'BMRCL_METRO',
        providerVersion: 'v1',
        sourceUrl: network.sourceUrl,
        fetchedAt: network.fetchedAt,
        contentHash: network.contentHash,
        rawRecordId,
        confidence: 0.78,
        verificationStatus: 'OFFICIAL',
        warnings: network.warnings,
      })),
    };
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function normalizeStationName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\b(nadaprabhu kempegowda station|station|metro)\b/g, '')
    .replace(/\((.*?)\)/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phrases BMRCL uses about a line, most specific first.
 *
 * Order matters: "planned to be operational" is a promise, not a service, so
 * the forward-looking markers are tested before the running ones.
 */
const STATUS_MARKERS: Array<{ status: BmrclParsedLine['operationalStatus']; pattern: RegExp }> = [
  {
    status: 'UNDER_CONSTRUCTION',
    pattern: /under construction|construction (?:is )?(?:in progress|ongoing)|works? (?:is|are) ongoing|yet to (?:open|commence)/i,
  },
  { status: 'PLANNED', pattern: /\bplanned\b|\bproposed\b|\bsanctioned\b|awaiting approval|\bDPR\b/i },
  {
    status: 'ACTIVE',
    pattern: /operational|in operation|revenue service|commenced|inaugurated|now open|opened on|currently running/i,
  },
];

/** How much text either side of a line's name counts as describing that line. */
const STATUS_WINDOW = 140;

/**
 * A line's operational status, read from the fetched page instead of assumed.
 *
 * This replaced a ternary that pinned Yellow Line to UNKNOWN and every other
 * line to ACTIVE. Both halves failed the same way: one withheld a fact BMRCL
 * publishes until somebody edited code, the other asserted one the source had
 * never been consulted for.
 *
 * The window is narrow deliberately. "Under construction" a paragraph away from
 * a line's name is describing something else, and a status inferred across that
 * distance is a guess wearing a citation. Where the page says nothing, or says
 * two contradictory things, the answer is UNKNOWN and a warning records why — a
 * rider is far better served by an admitted gap than a confident wrong one.
 */
function statusFromSource(
  lineName: string,
  text: string,
): { status: BmrclParsedLine['operationalStatus']; reason?: string } {
  const needle = new RegExp(lineName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const found = new Set<BmrclParsedLine['operationalStatus']>();

  for (const match of text.matchAll(needle)) {
    const index = match.index ?? 0;
    const window = text.slice(Math.max(0, index - STATUS_WINDOW), index + lineName.length + STATUS_WINDOW);
    const marker = STATUS_MARKERS.find(entry => entry.pattern.test(window));
    if (marker) found.add(marker.status);
  }

  if (found.size === 1) {
    return { status: [...found][0] };
  }

  if (found.size === 0) {
    return {
      status: 'UNKNOWN',
      reason: `${lineName}: source does not state an operational status; left UNKNOWN.`,
    };
  }

  return {
    status: 'UNKNOWN',
    reason: `${lineName}: source describes it as ${[...found].join(' and ')}; left UNKNOWN.`,
  };
}

function normalizeLineName(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return /line$/i.test(trimmed) ? trimmed : `${trimmed} Line`;
}

function inferLineColor(value: string): string {
  for (const color of ['Purple', 'Green', 'Yellow', 'Pink', 'Blue', 'Orange']) {
    if (new RegExp(color, 'i').test(value)) {
      return color.toUpperCase();
    }
  }

  return 'UNKNOWN';
}
