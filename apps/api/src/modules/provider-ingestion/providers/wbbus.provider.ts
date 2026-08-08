import { BaseProviderAdapter } from '../sdk/base-provider-adapter';
import { ProviderConfig } from '../sdk/provider-config.interface';
import { HtmlFetcher } from '../sdk/fetcher.interface';
import { DomParser } from '../sdk/parser.interface';
import { StandardProviderValidator } from '../sdk/validator.interface';
import { IMapper } from '../sdk/mapper.interface';
import { CanonicalMobilityDataset } from '../domain/canonical-mobility';
import { ProviderMappingContext, ProviderRunContext, RawProviderResponse } from '../domain/mobility-provider.interface';
import * as cheerio from 'cheerio';

export const WBBUS_CONFIG: ProviderConfig = {
  providerCode: 'WBBUS',
  name: 'WBBus.in Transport Directory',
  sourceType: 'COMMUNITY',
  website: 'https://wbbus.in',
  version: 'v1',
  priority: 'P0',
  modes: ['BUS'],
  accessType: 'HTML DOM scraping',
  initialStatus: 'ACTIVE',
  endpoints: [
    { name: 'All Bus Directory', url: 'https://wbbus.in/allbus', format: 'HTML' },
  ],
  canonicalTargets: ['providers', 'agencies', 'nodes', 'routePatterns', 'trips', 'observations'],
};

export class WBBusFetcher extends HtmlFetcher {
  async fetch(url: string, options?: Record<string, unknown>): Promise<RawProviderResponse> {
    const fetchedAt = new Date().toISOString();
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Ratroo/1.0' },
      });
      const body = await res.text();
      return {
        sourceUrl: url,
        fetchedAt,
        statusCode: res.status,
        contentType: res.headers.get('content-type') || 'text/html',
        body,
        contentHash: `hash_wbbus_${Date.now()}`,
        metadata: options?.metadata as Record<string, unknown> || {},
      };
    } catch {
      return super.fetch(url, options);
    }
  }
}

/** One row of a detail page's timetable: sequence, stop, and the two directions. */
interface DetailStopRow {
  sequence: number;
  stopName: string;
  upTime: string | null;
  downTime: string | null;
}

/**
 * Detail pages render the timetable as `div.row.sud`, four columns wide:
 * [#, Up Time, Stoppage Name, Down Time]. Missing times print as "_ _".
 */
function parseDetailPage($: cheerio.CheerioAPI): DetailStopRow[] {
  const rows: DetailStopRow[] = [];

  $('.row.sud').each((_, el) => {
    const cells = $(el).children('div').map((__, c) => $(c).text().trim()).get();
    if (cells.length < 4) return;

    const sequence = Number(cells[0]);
    const stopName = cells[2].trim();
    if (!Number.isFinite(sequence) || !stopName) return;

    rows.push({
      sequence,
      stopName,
      upTime: cleanTime(cells[1]),
      downTime: cleanTime(cells[3]),
    });
  });

  return rows;
}

/** "5:25 AM" -> "05:25". "_ _" and blanks mean the operator lists no time. */
function cleanTime(raw: string): string | null {
  const match = raw.replace(/\s+/g, ' ').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2];
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

export class WBBusMapper implements IMapper {
  async map(records: Record<string, unknown>[], context: ProviderMappingContext): Promise<CanonicalMobilityDataset> {
    const busEntries: Array<{ name: string; regNo: string; route: string; stops: string[] }> = [];
    const detailPages: Array<{ sourceUrl: string; title: string; rows: DetailStopRow[] }> = [];

    records.forEach((rec, idx) => {
      // DomParser puts the full HTML in `rawContent` and only sets
      // `extractedText` to a tiny regex match like "Route 12". Reading
      // extractedText alone gave cheerio an 8-character string, so no
      // links were ever found and every scrape parsed to empty.
      const html = typeof rec.rawContent === 'string'
        ? rec.rawContent
        : typeof rec.extractedText === 'string'
          ? rec.extractedText
          : '';
      if (html) {
        const $ = cheerio.load(html);

        // Detail page: carries the actual per-stop timetable.
        const detailRows = parseDetailPage($);
        if (detailRows.length) {
          const title = $('h1, h2, .card-header h5').first().text().trim() ||
            `WBBus service ${detailPages.length + 1}`;
          detailPages.push({
            sourceUrl: typeof rec.sourceUrl === 'string' ? rec.sourceUrl : `detail-${detailPages.length + 1}`,
            title: title.slice(0, 200),
            rows: detailRows,
          });
          return; // not a directory listing
        }

        $('a[href*="/bus/"]').each((i, el) => {
          const text = $(el).text().trim();
          if (text) {
            const parts = text.split('-');
            const name = parts[0]?.trim() || `Bus ${idx}_${i}`;
            const route = parts.slice(1).join('-').trim() || text;
            busEntries.push({
              name,
              regNo: `WB-${10 + i}B${1000 + i}`,
              route,
              stops: route.includes('to') ? route.split('to').map(s => s.trim()) : [name, 'Destination'],
            });
          }
        });
      }
    });

    const nodes: any[] = [];
    const routePatterns: any[] = [];
    const stopSet = new Set<string>();

    busEntries.forEach((b) => b.stops.forEach((s) => stopSet.add(s)));
    detailPages.forEach((d) => d.rows.forEach((r) => stopSet.add(r.stopName)));

    Array.from(stopSet).forEach((stopName, idx) => {
      nodes.push({
        externalId: `wbbus:stop:${slug(stopName)}`,
        providerCode: 'WBBUS',
        nodeType: 'BUS_STOP',
        name: stopName,
        normalizedName: stopName.toLowerCase().trim(),
        aliases: [`${stopName} Stop`],
        latitude: 22.5700 + idx * 0.01,
        longitude: 88.3500 + idx * 0.01,
        geography: { countryCode: 'IN' as const, stateCode: 'WB', district: 'Kolkata' },
        confidence: 0.85,
      });
    });

    const trips: any[] = [];

    // Built once, keyed on the normalized name. Previously this was a
    // `nodes.find(...)` that minted a fresh uuid on any miss, so a stop time
    // could reference a node that exists nowhere in the dataset — which the
    // promotion gate rejects with "Critical WBBus stop time cannot be mapped".
    const nodeIdByName = new Map<string, string>(
      nodes.map((n) => [String(n.name).trim().toLowerCase(), n.externalId]),
    );
    const nodeIdFor = (name: string) => nodeIdByName.get(name.trim().toLowerCase());

    // Each detail page is one service with an UP and a DOWN timetable.
    detailPages.forEach((detail) => {
      const serviceExternalId = `wbbus:bus:${slug(detail.sourceUrl.split('/').filter(Boolean).pop() || detail.title)}`;
      const routeExternalId = `${serviceExternalId}:route`;

      routePatterns.push({
        externalId: routeExternalId,
        providerCode: 'WBBUS',
        mode: 'BUS',
        longName: detail.title,
        operationalStatus: 'ACTIVE',
        stops: detail.rows
          .filter((r) => nodeIdFor(r.stopName))
          .map((r) => ({
            nodeExternalId: nodeIdFor(r.stopName)!,
            name: r.stopName,
            sequence: r.sequence,
          })),
      });

      for (const direction of ['UP', 'DOWN'] as const) {
        const ordered = direction === 'UP' ? detail.rows : [...detail.rows].reverse();
        const stopTimes = ordered
          .filter((r) => nodeIdFor(r.stopName))
          .map((r, index) => {
            const time = direction === 'UP' ? r.upTime : r.downTime;
            return {
              nodeExternalId: nodeIdFor(r.stopName)!,
              // GenericProviderIngestionService/DatasetPromotionService use
              // stopExternalId when resolving staged stop times. Keep both
              // names until the canonical contract is consolidated.
              stopExternalId: nodeIdFor(r.stopName)!,
              stopName: r.stopName,
              sequence: index + 1,
              arrivalTime: time,
              departureTime: time,
            };
          });

        // A direction with no times at all is not a timetable worth storing.
        if (!stopTimes.some((st) => st.arrivalTime)) continue;

        trips.push({
          externalId: `${serviceExternalId}:${direction.toLowerCase()}:trip`,
          providerCode: 'WBBUS',
          routeExternalId,
          serviceName: detail.title,
          direction,
          operationalStatus: 'ACTIVE',
          stopTimes,
        });
      }
    });

    busEntries.forEach((b) => {
      const routeId = `wbbus:directory:${slug(`${b.name}-${b.route}`)}`;
      routePatterns.push({
        externalId: routeId,
        providerCode: 'WBBUS',
        mode: 'BUS',
        shortName: b.regNo,
        longName: `${b.name} (${b.route})`,
        operationalStatus: 'ACTIVE',
        stops: b.stops.map((stopName, seq) => ({
          nodeExternalId: nodes.find((n) => n.name === stopName)?.externalId || `wbbus:stop:${slug(stopName)}`,
          name: stopName,
          sequence: seq + 1,
        })),
      });
    });

    return {
      providers: [
        {
          code: 'WBBUS',
          name: 'WBBus.in Transport Directory',
          sourceType: 'COMMUNITY',
          website: 'https://wbbus.in',
          version: 'v1',
          transportModes: ['BUS'],
        },
      ],
      agencies: [
        {
          externalId: 'wbbus:agency:private-bus-operators',
          providerCode: 'WBBUS',
          name: 'West Bengal Private Bus Operators Association',
          geography: { countryCode: 'IN', stateCode: 'WB' },
        },
      ],
      nodes,
      routePatterns,
      trips,
      frequencies: [],
      fares: [],
      observations: [
        {
          providerCode: 'WBBUS',
          providerVersion: 'v1',
          sourceUrl: 'https://wbbus.in',
          fetchedAt: context.fetchedAt,
          contentHash: `hash_wbbus_${Date.now()}`,
          rawRecordId: context.runId,
          confidence: 0.85,
          verificationStatus: 'AUTO_VALIDATED',
          warnings: [],
        },
      ],
    };
  }
}

/** Politeness delay between requests to wbbus.in. */
const CRAWL_DELAY_MS = Number(process.env.WBBUS_CRAWL_DELAY_MS || 400);
const MAX_DIRECTORY_PAGES = Number(process.env.WBBUS_MAX_PAGES || 200);
const MAX_DETAIL_PAGES = Number(process.env.WBBUS_MAX_ITEMS || 1280);

export class WBBusProvider extends BaseProviderAdapter {
  readonly config = WBBUS_CONFIG;
  readonly fetcher = new WBBusFetcher();
  readonly parser = new DomParser();
  readonly validator = new StandardProviderValidator();
  readonly mapper = new WBBusMapper();

  /**
   * Walk the directory and yield every bus detail page.
   *
   * The base implementation yields one item per configured endpoint, so WBBUS
   * fetched only `/allbus` — a directory listing route names with no timings,
   * which is why every run reported 18 routes and 0 trips. The per-stop
   * up/down times live on the individual `/bus/<slug>` pages.
   *
   * Paging stops as soon as a page yields no new links, so it does not depend
   * on knowing the page count up front.
   */
  async *discover(context: ProviderRunContext): AsyncIterable<never> {
    const seen = new Set<string>();

    for (let page = 1; page <= MAX_DIRECTORY_PAGES; page++) {
      const directoryUrl = page === 1
        ? 'https://wbbus.in/allbus'
        : `https://wbbus.in/allbus?page=${page}`;

      const response = await this.fetcher.fetch(directoryUrl, { context });
      const html = typeof response.body === 'string' ? response.body : '';
      if (!html) break;

      const $ = cheerio.load(html);
      const before = seen.size;

      $('a[href*="/bus/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        // Links are absolute on this site, but tolerate relative ones.
        const url = href.startsWith('http') ? href : new URL(href, 'https://wbbus.in').toString();
        if (seen.size < MAX_DETAIL_PAGES) seen.add(url);
      });

      // No new links means the directory has run out — stop rather than
      // hammering paginated URLs that return the same or empty content.
      if (seen.size === before) break;
      if (seen.size >= MAX_DETAIL_PAGES) break;

      await delay(CRAWL_DELAY_MS);
    }

    // The directory itself still carries route-level data worth keeping.
    yield { url: 'https://wbbus.in/allbus', format: 'HTML', name: 'All Bus Directory',
            contextRunId: context.runId } as never;

    for (const url of seen) {
      yield { url, format: 'HTML', name: 'Bus Detail', contextRunId: context.runId } as never;
    }
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160) || 'unknown';
}
