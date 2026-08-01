import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import {
  CanonicalAgency,
  CanonicalMobilityNode,
  CanonicalRoutePattern,
  CanonicalSourceObservation,
  CanonicalTrip,
  NodeType,
  ServiceClass,
  TransportMode,
} from '../domain/canonical-mobility';

export type WestBengalGovernmentBusProviderCode = 'WBTC' | 'NBSTC' | 'SBSTC' | 'KOLKATA_TRAM' | 'WB_FERRY' | 'EASTERN_RAILWAY_SUBURBAN';

export interface GovernmentBusSourceConfig {
  providerCode: WestBengalGovernmentBusProviderCode;
  agencyName: string;
  shortName: string;
  website: string;
  sourceUrl: string;
  stateRegion: string;
  mode: TransportMode;
  nodeType: NodeType;
  fallbackHtml?: string;
}

export interface GovernmentBusRawPage {
  sourceUrl: string;
  html: string;
  fetchedAt: string;
  contentHash: string;
  rawRecordId: string;
}

export interface GovernmentBusParsedRoute {
  externalId: string;
  rowNumber: number;
  from: string;
  to: string;
  via: string[];
  departureTime?: string;
  serviceClass: ServiceClass;
  sourceUrl: string;
  rawRecordId: string;
}

export interface GovernmentBusParsedNetwork {
  providerCode: WestBengalGovernmentBusProviderCode;
  sourceUrl: string;
  fetchedAt: string;
  contentHash: string;
  rawRecordIds: string[];
  routes: GovernmentBusParsedRoute[];
  warnings: string[];
}

export interface GovernmentBusCanonicalOutput {
  agencies: CanonicalAgency[];
  nodes: CanonicalMobilityNode[];
  routePatterns: CanonicalRoutePattern[];
  trips: CanonicalTrip[];
  sourceObservations: CanonicalSourceObservation[];
}

export interface GovernmentBusValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export const GOVERNMENT_BUS_SOURCES: Record<WestBengalGovernmentBusProviderCode, GovernmentBusSourceConfig> = {
  WBTC: {
    providerCode: 'WBTC',
    agencyName: 'West Bengal Transport Corporation',
    shortName: 'WBTC',
    website: 'https://wbtconline.in/',
    sourceUrl: 'https://wbtconline.in/home',
    stateRegion: 'Kolkata Metropolitan Area',
    mode: 'BUS',
    nodeType: 'BUS_STOP',
  },
  NBSTC: {
    providerCode: 'NBSTC',
    agencyName: 'North Bengal State Transport Corporation',
    shortName: 'NBSTC',
    website: 'https://nbstc.in/',
    sourceUrl: 'https://nbstc.in/bus-routes.php',
    stateRegion: 'North Bengal',
    mode: 'BUS',
    nodeType: 'BUS_STOP',
  },
  SBSTC: {
    providerCode: 'SBSTC',
    agencyName: 'South Bengal State Transport Corporation',
    shortName: 'SBSTC',
    website: 'https://sbstc.co.in/',
    sourceUrl: 'https://sbstc.co.in/BusRoutes?StartFrom=5&busroute=243',
    stateRegion: 'South Bengal',
    mode: 'BUS',
    nodeType: 'BUS_STOP',
    fallbackHtml: sbstcOfficialSnapshotHtml(),
  },
  KOLKATA_TRAM: {
    providerCode: 'KOLKATA_TRAM',
    agencyName: 'Kolkata Tramways',
    shortName: 'Kolkata Tram',
    website: 'https://transport.wb.gov.in/',
    sourceUrl: 'https://transport.wb.gov.in/about-us/department-at-a-glance/corporation/wbtc/ctc/',
    stateRegion: 'Kolkata Metropolitan Area',
    mode: 'TRAM',
    nodeType: 'TRAM_STOP',
    fallbackHtml: kolkataTramSnapshotHtml(),
  },
  WB_FERRY: {
    providerCode: 'WB_FERRY',
    agencyName: 'West Bengal Surface Transport Corporation Ferry Services',
    shortName: 'WB Ferry',
    website: 'https://transport.wb.gov.in/',
    sourceUrl: 'https://transport.wb.gov.in/transport-services/ferry-services/ferry-routes/',
    stateRegion: 'West Bengal Riverine Network',
    mode: 'FERRY',
    nodeType: 'FERRY_TERMINAL',
    fallbackHtml: westBengalFerrySnapshotHtml(),
  },
  EASTERN_RAILWAY_SUBURBAN: {
    providerCode: 'EASTERN_RAILWAY_SUBURBAN',
    agencyName: 'Eastern Railway Suburban Services',
    shortName: 'Eastern Railway',
    website: 'https://er.indianrailways.gov.in/',
    sourceUrl: 'https://er.indianrailways.gov.in/view_section.jsp?backgroundColor=LIGHTSTEELBLUE&fontColor=black&id=0%2C1&lang=0',
    stateRegion: 'Kolkata Suburban Rail Network',
    mode: 'SUBURBAN_RAIL',
    nodeType: 'RAILWAY_STATION',
    fallbackHtml: easternRailwaySuburbanSnapshotHtml(),
  },
};

export class GovernmentBusStaticParser {
  parse(config: GovernmentBusSourceConfig, rawPages: GovernmentBusRawPage[]): GovernmentBusParsedNetwork {
    const warnings: string[] = [];
    const routes: GovernmentBusParsedRoute[] = [];

    for (const page of rawPages) {
      if (this.shouldUseMaintainedSnapshot(config) && config.fallbackHtml) {
        routes.push(...this.parseTableRoutes(config, { ...page, html: config.fallbackHtml }, warnings));
        continue;
      }
      routes.push(...this.parseTableRoutes(config, page, warnings));
    }

    return {
      providerCode: config.providerCode,
      sourceUrl: rawPages.map(page => page.sourceUrl).join(','),
      fetchedAt: rawPages[0]?.fetchedAt || new Date().toISOString(),
      contentHash: sha256(rawPages.map(page => page.contentHash).sort().join('|')),
      rawRecordIds: rawPages.map(page => page.rawRecordId),
      routes: this.dedupeRoutes(routes),
      warnings,
    };
  }

  private parseTableRoutes(
    config: GovernmentBusSourceConfig,
    page: GovernmentBusRawPage,
    warnings: string[],
  ): GovernmentBusParsedRoute[] {
    const $ = cheerio.load(page.html);
    const routes: GovernmentBusParsedRoute[] = [];

    if ($('[data-yatroo-fallback="sbstc-official-snapshot"]').length) {
      warnings.push('SBSTC live official route page timed out; used maintained snapshot from the official route-table page.');
    }
    if ($('[data-yatroo-fallback="static-mobility-snapshot"]').length) {
      warnings.push(`${config.providerCode} uses a maintained route snapshot because the public official page is not a stable machine-readable route API.`);
    }

    $('tr').each((_, row) => {
      const cells = $(row)
        .find('th,td')
        .map((__, cell) => normalizeWhitespace($(cell).text()))
        .get()
        .filter(Boolean);

      const rowNumber = parseSerial(cells[0]);
      const minimumCells = this.shouldUseMaintainedSnapshot(config) ? 2 : 3;
      if (cells.length < minimumCells || !rowNumber || /originating point|terminating point|cancellation/i.test(cells.join(' '))) {
        return;
      }

      const parsed = this.parseCells(config.providerCode, cells);
      if (!parsed) {
        return;
      }

      const stops = routeStops(parsed.from, parsed.via, parsed.to);
      if (stops.length < 2) {
        warnings.push(`${config.providerCode} row ${cells.join(' | ')} did not contain at least two stops.`);
        return;
      }

      routes.push({
        externalId: `${config.providerCode.toLowerCase()}:route:${rowNumber}:${slug(parsed.from)}:${slug(parsed.to)}:${slug(parsed.departureTime || 'unknown')}`,
        rowNumber,
        from: parsed.from,
        to: parsed.to,
        via: parsed.via,
        departureTime: parsed.departureTime,
        serviceClass: inferServiceClass(`${parsed.from} ${parsed.to} ${parsed.via.join(' ')}`),
        sourceUrl: page.sourceUrl,
        rawRecordId: page.rawRecordId,
      });
    });

    if (!routes.length) {
      warnings.push(`${config.providerCode} official route table produced no parseable rows.`);
    }

    return routes;
  }

  private shouldUseMaintainedSnapshot(config: GovernmentBusSourceConfig) {
    return ['KOLKATA_TRAM', 'WB_FERRY', 'EASTERN_RAILWAY_SUBURBAN'].includes(config.providerCode);
  }

  private parseCells(
    providerCode: WestBengalGovernmentBusProviderCode,
    cells: string[],
  ): { from: string; to: string; via: string[]; departureTime?: string } | null {
    if (providerCode === 'NBSTC' && cells.length >= 4) {
      return {
        from: cells[1],
        to: cells[2],
        departureTime: normalizeTime(cells[3]),
        via: splitVia(cells.slice(4).join(' ')),
      };
    }

    if (providerCode === 'WBTC' && cells.length >= 5) {
      if (!isLikelyWbtcRouteNumber(cells[1])) {
        return null;
      }
      return {
        from: cells[2],
        to: cells[3],
        via: splitVia(cells.slice(4).join(' ')),
      };
    }

    if (providerCode === 'SBSTC' && cells.length >= 4) {
      return {
        from: cells[1],
        to: cells[2],
        departureTime: normalizeTime(cells[3]),
        via: splitVia(cells.slice(4).join(' ')),
      };
    }

    if (providerCode === 'SBSTC' && cells.length >= 3) {
      const destination = parseRouteText(cells[1]);
      if (destination) {
        return {
          from: destination.from,
          to: destination.to,
          departureTime: normalizeTime(cells[2]),
          via: [],
        };
      }
    }

    if ((providerCode === 'KOLKATA_TRAM' || providerCode === 'WB_FERRY' || providerCode === 'EASTERN_RAILWAY_SUBURBAN') && cells.length >= 2) {
      const destination = parseRouteText(cells[1]);
      if (destination) {
        return {
          from: destination.from,
          to: destination.to,
          via: splitVia(cells.slice(2).join(' ')),
        };
      }
    }

    return null;
  }

  private dedupeRoutes(routes: GovernmentBusParsedRoute[]) {
    const byExternalId = new Map<string, GovernmentBusParsedRoute>();
    for (const route of routes) {
      byExternalId.set(route.externalId, route);
    }
    return Array.from(byExternalId.values());
  }
}

export class GovernmentBusStaticValidator {
  validate(network: GovernmentBusParsedNetwork): GovernmentBusValidationResult {
    const errors: string[] = [];
    const warnings = [...network.warnings];

    if (!network.rawRecordIds.length) {
      errors.push('No raw source record exists.');
    }

    if (!network.routes.length) {
      errors.push('Parsed output is empty.');
    }

    for (const route of network.routes) {
      const stops = routeStops(route.from, route.via, route.to);
      if (stops.length < 2) {
        errors.push(`${route.externalId} has fewer than two stops.`);
      }
      if (!route.departureTime) {
        warnings.push(`${route.externalId} is missing departure time.`);
      }
      if (!route.via.length) {
        warnings.push(`${route.externalId} is missing via/intermediate stop information.`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: Array.from(new Set(warnings)),
    };
  }
}

export class GovernmentBusStaticMapper {
  map(config: GovernmentBusSourceConfig, network: GovernmentBusParsedNetwork): GovernmentBusCanonicalOutput {
    const nodesByExternalId = new Map<string, CanonicalMobilityNode>();

    for (const route of network.routes) {
      for (const stopName of routeStops(route.from, route.via, route.to)) {
        const externalId = `${config.providerCode.toLowerCase()}:stop:${slug(stopName)}`;
        if (nodesByExternalId.has(externalId)) {
          continue;
        }

        nodesByExternalId.set(externalId, {
          externalId,
          providerCode: config.providerCode,
          nodeType: config.nodeType,
          name: stopName,
          normalizedName: normalizeStopName(stopName),
          aliases: [],
          geography: {
            countryCode: 'IN',
            stateCode: 'WB',
            zone: config.stateRegion,
          },
          confidence: 0.72,
        });
      }
    }

    const routePatterns: CanonicalRoutePattern[] = network.routes.map(route => ({
      externalId: route.externalId,
      providerCode: config.providerCode,
      agencyExternalId: config.providerCode.toLowerCase(),
      mode: config.mode,
      shortName: `${route.from} - ${route.to}`,
      longName: `${route.from} to ${route.to}`,
      directionId: 'OUTBOUND',
      operationalStatus: 'ACTIVE',
      serviceClass: route.serviceClass,
      stops: routeStops(route.from, route.via, route.to).map((name, index) => ({
        nodeExternalId: `${config.providerCode.toLowerCase()}:stop:${slug(name)}`,
        name,
        sequence: index + 1,
        pickupAllowed: true,
        dropoffAllowed: true,
      })),
    }));

    const trips: CanonicalTrip[] = network.routes.map(route => ({
      externalId: `${route.externalId}:trip`,
      providerCode: config.providerCode,
      routeExternalId: route.externalId,
      serviceName: route.departureTime ? `${route.departureTime} departure` : undefined,
      direction: 'OUTBOUND',
      operationalStatus: 'ACTIVE',
      serviceClass: route.serviceClass,
      stopTimes: routeStops(route.from, route.via, route.to).map((name, index) => ({
        stopExternalId: `${config.providerCode.toLowerCase()}:stop:${slug(name)}`,
        stopName: name,
        sequence: index + 1,
        arrivalTime: index === 0 ? route.departureTime : undefined,
        departureTime: index === 0 ? route.departureTime : undefined,
        timeIsEstimated: index !== 0,
      })),
    }));

    const agency: CanonicalAgency = {
      externalId: config.providerCode.toLowerCase(),
      providerCode: config.providerCode,
      name: config.agencyName,
      shortName: config.shortName,
      website: config.website,
      geography: {
        countryCode: 'IN',
        stateCode: 'WB',
        zone: config.stateRegion,
      },
    };

    return {
      agencies: [agency],
      nodes: Array.from(nodesByExternalId.values()),
      routePatterns,
      trips,
      sourceObservations: network.rawRecordIds.map(rawRecordId => ({
        providerCode: config.providerCode,
        providerVersion: 'v1',
        sourceUrl: network.sourceUrl,
        fetchedAt: network.fetchedAt,
        contentHash: network.contentHash,
        rawRecordId,
        confidence: 0.82,
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

function routeStops(from: string, via: string[], to: string) {
  const stops = [from, ...via, to]
    .map(normalizeWhitespace)
    .filter(Boolean)
    .filter(value => !/^(via|nil|n\/a|na)$/i.test(value));
  return stops.filter((stop, index) => index === 0 || normalizeStopName(stop) !== normalizeStopName(stops[index - 1]));
}

function splitVia(value: string) {
  return normalizeWhitespace(value)
    .replace(/^via\s+/i, '')
    .split(/\s*(?:,|;|→|>|-|–|—)\s*/)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function parseRouteText(value: string) {
  const match = normalizeWhitespace(value).match(/^(.+?)\s+to\s+(.+)$/i);
  return match ? { from: match[1].trim(), to: match[2].trim() } : null;
}

function inferServiceClass(value: string): ServiceClass {
  if (/\b(ac|a\/c|volvo|premium)\b/i.test(value)) {
    return 'PREMIUM';
  }
  if (/\bexpress\b/i.test(value)) {
    return 'EXPRESS';
  }
  if (/\bnight\b/i.test(value)) {
    return 'NIGHT';
  }
  return 'REGULAR';
}

function normalizeStopName(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b(bus stand|bus terminus|bus terminal|stand|terminus|terminal)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTime(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeWhitespace(value)
    .replace(/\bnoon\b/i, 'PM')
    .replace(/\bmidnight\b/i, 'AM');
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) {
    return normalized || undefined;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hour < 12) {
    hour += 12;
  }
  if (period === 'AM' && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeWhitespace(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseSerial(value: string) {
  const match = normalizeWhitespace(value).match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function isLikelyWbtcRouteNumber(value: string) {
  return /^[A-Z]{0,4}\d{1,3}[A-Z]?(?:\/\d{1,3})?(?:-[A-Z0-9]{1,4})?$/i.test(normalizeWhitespace(value));
}

function sbstcOfficialSnapshotHtml() {
  const rows: Array<[string, string]> = [
    ['KOLKATA TO HALDIA', '06:00'],
    ['KOLKATA TO HALDIA', '06:30'],
    ['KOLKATA TO HALDIA', '07:15'],
    ['KOLKATA TO HALDIA', '08:00'],
    ['KOLKATA TO HALDIA', '09:30'],
    ['KOLKATA TO HALDIA', '11:15'],
    ['KOLKATA TO HALDIA', '13:30'],
    ['KOLKATA TO HALDIA (A/C)', '16:20'],
    ['KOLKATA TO HALDIA', '19:00'],
    ['KOLKATA TO ARAMBAG (NS)', '06:30'],
    ['KOLKATA TO BISHNUPUR (ARAMBAG)', '07:00'],
    ['KOLKATA TO KHATRA (AS) (ARAMBAG)', '08:05'],
    ['KOLKATA TO ARAMBAG (NS)', '09:30'],
    ['KOLKATA TO ARAMBAG (AS)', '11:00'],
    ['KOLKATA TO KHATRA (ARAMBAG)', '13:20'],
    ['KOLKATA TO BISHNUPUR (AS)', '15:10'],
    ['KOLKATA TO ARAMBAG (NS)', '17:30'],
    ['KOLKATA TO DIGHA', '06:30'],
    ['KOLKATA TO DIGHA', '07:15'],
    ['KOLKATA TO DIGHA', '08:45'],
    ['KOLKATA TO DIGHA', '10:30'],
    ['KOLKATA TO DIGHA', '12:45'],
    ['KOLKATA TO DIGHA', '14:20'],
    ['KOLKATA TO EGRA (DIGHA)', '15:00'],
    ['KOLKATA TO DIGHA', '17:45'],
    ['KOLKATA TO DIGHA (NIGHT SERVICE)', '23:00'],
    ['KOLKATA TO DIGHA (NIGHT SERVICE)', '23:45'],
    ['KOLKATA TO BURDWAN', '06:30'],
    ['KOLKATA TO BURDWAN', '07:40'],
    ['KOLKATA TO BURDWAN', '09:30'],
    ['KOLKATA TO BURDWAN (A/C)', '10:00'],
    ['KOLKATA TO NANUR (BURDWAN)', '11:55'],
    ['KOLKATA TO BURDWAN (A/C)', '12:15'],
    ['KOLKATA TO BURDWAN (LS)', '13:10'],
    ['KOLKATA TO TARAPITH (KALESWAR)', '13:50'],
    ['KOLKATA TO KIRNAHAR (BURDWAN)', '15:15'],
    ['KOLKATA TO LABPUR A/C (BURDWAN)', '16:30'],
    ['KOLKATA TO BURDWAN (A/C)', '18:00'],
    ['KOLKATA TO BURDWAN', '20:30'],
    ['GARIA TO MIDNAPUR (KOLKATA)', '05:30'],
    ['GARIA TO JHARGRAM (KOLKATA)', '06:30'],
    ['KOLKATA TO MIDNAPUR', '07:00'],
    ['KOLKATA TO JHARGRAM', '07:30'],
    ['KOLKATA TO MIDNAPUR', '09:30'],
    ['KOLKATA TO JHARGRAM (MIDNAPUR)', '10:30'],
    ['KOLKATA TO JHARGRAM (VIA-LODHASULI)', '11:40'],
    ['KOLKATA TO BELPAHARI (MIDNAPUR)', '12:30'],
    ['KOLKATA TO KHATRA (MIDNAPUR)', '13:00'],
    ['KOLKATA TO DATAN (MIDNAPUR)', '15:00'],
    ['KOLKATA TO MIDNAPUR (A/C)', '16:30'],
    ['KOLKATA TO JHARGRAM (MIDNAPUR)', '16:45'],
    ['KOLKATA TO MIDNAPUR', '18:45'],
  ];

  return `<table data-yatroo-fallback="sbstc-official-snapshot"><thead><tr><th>SN</th><th>Destination</th><th>Intime</th></tr></thead><tbody>${rows
    .map((row, index) => `<tr><td>${index + 1}</td><td>${row[0]}</td><td>${row[1]}</td></tr>`)
    .join('')}</tbody></table>`;
}

function westBengalFerrySnapshotHtml() {
  const rows: Array<[string, string]> = [
    ['Howrah TO Shipping Millennium Park', ''],
    ['Howrah TO Fairlie', ''],
    ['Dakshineswar TO Belur', ''],
    ['Fairlie TO Ariyadaha', 'Howrah >> Baghbazar >> Belur >> Kutighat'],
    ['Lot No. 8 TO Kachuberia Sagar Island', ''],
    ['Roychak TO Kukrahati', ''],
    ['Narayanpur TO Namkhana', ''],
    ['Hasnabad TO Par Hasnabad', ''],
    ['Nebukhali TO Dulduli', ''],
  ];

  return snapshotTable(rows);
}

function kolkataTramSnapshotHtml() {
  const rows: Array<[string, string]> = [
    ['Esplanade TO Shyambazar', 'Dalhousie >> BBD Bag >> Central >> MG Road'],
    ['Esplanade TO Kidderpore', 'Maidan >> Hastings >> Kidderpore'],
    ['Gariahat TO Esplanade', 'Ballygunge >> Park Circus >> Moulali'],
    ['Tollygunge TO Ballygunge', 'Rashbehari >> Gariahat'],
    ['Rajabazar TO Howrah Bridge', 'MG Road >> Burrabazar'],
    ['Nonapukur TO Esplanade', 'Park Street >> Maidan'],
  ];

  return snapshotTable(rows);
}

function easternRailwaySuburbanSnapshotHtml() {
  const rows: Array<[string, string]> = [
    ['Howrah TO Bardhaman', 'Bally >> Serampore >> Chandannagar >> Chinsurah >> Bandel'],
    ['Howrah TO Katwa', 'Bandel >> Nabadwip Dham'],
    ['Sealdah TO Ranaghat', 'Dum Dum >> Barrackpore >> Naihati >> Kanchrapara'],
    ['Sealdah TO Bongaon', 'Dum Dum >> Barasat >> Habra'],
    ['Sealdah TO Diamond Harbour', 'Ballygunge >> Sonarpur >> Baruipur'],
    ['Sealdah TO Canning', 'Ballygunge >> Sonarpur'],
    ['Sealdah TO Lakshmikantapur', 'Ballygunge >> Sonarpur >> Baruipur'],
    ['Bandel TO Naihati', 'Hooghly Ghat'],
  ];

  return snapshotTable(rows);
}

function snapshotTable(rows: Array<[string, string]>) {
  return `<table data-yatroo-fallback="static-mobility-snapshot"><thead><tr><th>SN</th><th>Route</th><th>Stoppages</th></tr></thead><tbody>${rows
    .map((row, index) => `<tr><td>${index + 1}</td><td>${row[0]}</td><td>${row[1]}</td></tr>`)
    .join('')}</tbody></table>`;
}
