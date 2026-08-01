import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import {
  CanonicalAgency,
  CanonicalMobilityNode,
  CanonicalRoutePattern,
  CanonicalSourceObservation,
} from '../domain/canonical-mobility';

export type KolkataMetroSourceKind = 'ROUTE_MAP' | 'OFFICIAL_SITE';

export interface KolkataMetroDiscoveryItem {
  sourceKind: KolkataMetroSourceKind;
  url: string;
  metadata?: Record<string, unknown>;
}

export interface KolkataMetroRawPage {
  sourceKind: KolkataMetroSourceKind;
  url: string;
  html: string;
  fetchedAt: string;
  contentHash: string;
  rawRecordId: string;
}

export interface KolkataMetroParsedStation {
  externalId: string;
  name: string;
  lineName: string;
  sequence: number;
  isInterchange: boolean;
}

export interface KolkataMetroParsedLine {
  externalId: string;
  name: string;
  color: string;
  operationalStatus: 'ACTIVE' | 'PLANNED' | 'UNDER_CONSTRUCTION' | 'UNKNOWN';
  stations: KolkataMetroParsedStation[];
}

export interface KolkataMetroParsedNetwork {
  sourceUrl: string;
  fetchedAt: string;
  contentHash: string;
  rawRecordIds: string[];
  lines: KolkataMetroParsedLine[];
  warnings: string[];
}

export interface KolkataMetroCanonicalOutput {
  agencies: CanonicalAgency[];
  nodes: CanonicalMobilityNode[];
  routePatterns: CanonicalRoutePattern[];
  sourceObservations: CanonicalSourceObservation[];
}

export interface KolkataMetroValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

const KOLKATA_METRO_DISCOVERY_ITEMS: KolkataMetroDiscoveryItem[] = [
  {
    sourceKind: 'ROUTE_MAP',
    url: 'https://www.kmrc.in/route_map.php',
    metadata: {
      sourceName: 'Kolkata Metro Rail Corporation official route map',
    },
  },
  {
    sourceKind: 'OFFICIAL_SITE',
    url: 'https://www.kmrc.in/',
    metadata: {
      sourceName: 'Kolkata Metro Rail Corporation official website',
    },
  },
];

const MAINTAINED_STATION_ORDER: Array<Omit<KolkataMetroParsedLine, 'operationalStatus'>> = [
  {
    externalId: 'blue-line',
    name: 'Blue Line',
    color: 'BLUE',
    stations: [
      'Dakshineswar',
      'Baranagar',
      'Noapara',
      'Dum Dum',
      'Belgachia',
      'Shyambazar',
      'Shobhabazar Sutanuti',
      'Girish Park',
      'Mahatma Gandhi Road',
      'Central',
      'Chandni Chowk',
      'Esplanade',
      'Park Street',
      'Maidan',
      'Rabindra Sadan',
      'Netaji Bhavan',
      'Jatin Das Park',
      'Kalighat',
      'Rabindra Sarobar',
      'Mahanayak Uttam Kumar',
      'Netaji',
      'Masterda Surya Sen',
      'Gitanjali',
      'Kavi Nazrul',
      'Shahid Khudiram',
      'Kavi Subhash',
    ].map((name, index) => maintainedStation(name, 'Blue Line', index + 1)),
  },
  {
    externalId: 'green-line',
    name: 'Green Line',
    color: 'GREEN',
    stations: [
      'Howrah Maidan',
      'Howrah',
      'Mahakaran',
      'Esplanade',
      'Sealdah',
      'Phoolbagan',
      'Salt Lake Stadium',
      'Bengal Chemical',
      'City Centre',
      'Central Park',
      'Karunamoyee',
      'Salt Lake Sector V',
    ].map((name, index) => maintainedStation(name, 'Green Line', index + 1)),
  },
  {
    externalId: 'purple-line',
    name: 'Purple Line',
    color: 'PURPLE',
    stations: ['Joka', 'Thakurpukur', 'Sakher Bazar', 'Behala Chowrasta', 'Behala Bazar', 'Taratala', 'Majerhat'].map(
      (name, index) => maintainedStation(name, 'Purple Line', index + 1),
    ),
  },
  {
    externalId: 'orange-line',
    name: 'Orange Line',
    color: 'ORANGE',
    stations: [
      'Kavi Subhash',
      'Satyajit Ray',
      'Jyotirindra Nandi',
      'Kavi Sukanta',
      'Hemanta Mukhopadhyay',
      'VIP Bazar',
      'Ritwik Ghatak',
      'Barun Sengupta',
      'Beleghata',
    ].map((name, index) => maintainedStation(name, 'Orange Line', index + 1)),
  },
  {
    externalId: 'yellow-line',
    name: 'Yellow Line',
    color: 'YELLOW',
    stations: ['Noapara', 'Dum Dum Cantonment', 'Jessore Road', 'Jai Hind Airport'].map((name, index) =>
      maintainedStation(name, 'Yellow Line', index + 1),
    ),
  },
];

function maintainedStation(name: string, lineName: string, sequence: number): KolkataMetroParsedStation {
  return {
    externalId: slug(`${lineName}-${name}`),
    name,
    lineName,
    sequence,
    isInterchange: ['esplanade', 'kavi-subhash', 'noapara'].includes(slug(name)),
  };
}

export class KolkataMetroStaticNetworkDiscovery {
  discover(): KolkataMetroDiscoveryItem[] {
    return KOLKATA_METRO_DISCOVERY_ITEMS;
  }
}

export class KolkataMetroStaticNetworkParser {
  parse(rawPages: KolkataMetroRawPage[]): KolkataMetroParsedNetwork {
    const warnings: string[] = [
      'Kolkata Metro official route map is not exposed as stable machine-readable station data; used maintained line-order fallback after saving raw official pages.',
    ];
    const text = rawPages
      .map(page => cheerio.load(page.html)('body').text())
      .join(' ')
      .replace(/\s+/g, ' ');

    if (!/Kolkata|Metro|KMRC|KMRCL/i.test(text)) {
      warnings.push('Official source text did not contain expected Kolkata Metro markers.');
    }

    return {
      sourceUrl: rawPages.map(page => page.url).join(','),
      fetchedAt: rawPages[0]?.fetchedAt || new Date().toISOString(),
      contentHash: sha256(rawPages.map(page => page.contentHash).sort().join('|')),
      rawRecordIds: rawPages.map(page => page.rawRecordId),
      lines: MAINTAINED_STATION_ORDER.map(line => ({
        ...line,
        operationalStatus: 'ACTIVE',
        stations: line.stations.map(station => ({ ...station })),
      })),
      warnings,
    };
  }
}

export class KolkataMetroStaticNetworkValidator {
  validate(network: KolkataMetroParsedNetwork): KolkataMetroValidationResult {
    const errors: string[] = [];
    const warnings = [...network.warnings];

    if (!network.rawRecordIds.length) {
      errors.push('No raw source record exists.');
    }

    if (!network.lines.length) {
      errors.push('Parsed output is empty.');
    }

    const stationNamesByExternalId = new Map<string, string>();
    for (const line of network.lines) {
      if (line.stations.length < 2) {
        errors.push(`${line.name} has fewer than two stations.`);
      }

      const sequences = new Set<number>();
      for (const station of line.stations) {
        if (sequences.has(station.sequence)) {
          errors.push(`${line.name} contains duplicate station sequence ${station.sequence}.`);
        }
        sequences.add(station.sequence);

        const normalizedName = normalizeStationName(station.name);
        const previous = stationNamesByExternalId.get(station.externalId);
        if (previous && previous !== normalizedName) {
          errors.push(`External station ID ${station.externalId} maps to multiple unrelated stations.`);
        }
        stationNamesByExternalId.set(station.externalId, normalizedName);
        warnings.push(`${station.name} is missing coordinates.`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: Array.from(new Set(warnings)),
    };
  }
}

export class KolkataMetroStaticNetworkMapper {
  map(network: KolkataMetroParsedNetwork): KolkataMetroCanonicalOutput {
    const agency: CanonicalAgency = {
      externalId: 'kolkata-metro',
      providerCode: 'KOLKATA_METRO',
      name: 'Kolkata Metro',
      shortName: 'Kolkata Metro',
      website: 'https://www.kmrc.in/',
      geography: {
        countryCode: 'IN',
        stateCode: 'WB',
        city: 'Kolkata',
        metropolitanArea: 'Kolkata Metropolitan Area',
      },
    };

    const nodesByNormalizedName = new Map<string, CanonicalMobilityNode>();
    for (const line of network.lines) {
      for (const station of line.stations) {
        const normalizedName = normalizeStationName(station.name);
        const existing = nodesByNormalizedName.get(normalizedName);
        const lineRef = { lineExternalId: line.externalId, lineName: line.name, sequence: station.sequence };

        if (existing) {
          existing.aliases = Array.from(new Set([...existing.aliases, station.name]));
          existing.confidence = Math.max(existing.confidence, 0.72);
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

        nodesByNormalizedName.set(normalizedName, {
          externalId: slug(station.name),
          providerCode: 'KOLKATA_METRO',
          nodeType: 'METRO_STATION',
          name: station.name,
          normalizedName,
          aliases: [],
          geography: {
            countryCode: 'IN',
            stateCode: 'WB',
            city: 'Kolkata',
            metropolitanArea: 'Kolkata Metropolitan Area',
          },
          confidence: 0.72,
          metadata: {
            isInterchange: station.isInterchange,
            lines: [lineRef],
          },
        } as CanonicalMobilityNode & { metadata: Record<string, unknown> });
      }
    }

    const routePatterns: CanonicalRoutePattern[] = network.lines.map(line => ({
      externalId: line.externalId,
      providerCode: 'KOLKATA_METRO',
      agencyExternalId: 'kolkata-metro',
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
        providerCode: 'KOLKATA_METRO',
        providerVersion: 'v1',
        sourceUrl: network.sourceUrl,
        fetchedAt: network.fetchedAt,
        contentHash: network.contentHash,
        rawRecordId,
        confidence: 0.7,
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
    .replace(/\b(station|metro)\b/g, '')
    .replace(/\((.*?)\)/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
