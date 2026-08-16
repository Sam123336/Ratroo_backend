/**
 * BMTC as a [BaseProviderAdapter], so it runs through
 * [GenericProviderIngestionService] like the other eight providers instead of
 * through `scripts/ingest-bmtc.ts` + `BmtcStaticImportService`.
 *
 * The script and this adapter share the client and the mapper functions, so
 * there is one implementation of the actual BMTC knowledge; what the adapter
 * adds is the run row, raw-record storage, staging and promotion that every
 * other provider already gets for free.
 *
 * Shape note: BMTC is a *crawl*, not a document fetch. The base `discover()`
 * yields one item per configured endpoint, which for BMTC would fetch a route
 * list and stop. [BmtcOfficialProvider.discover] overrides that to fetch the
 * route list and yield one item per directional route — the same override
 * WBBUS makes for its detail pages — and `fetch()` then makes the two or three
 * calls that one route needs, returning them as a single raw record.
 */
import { Injectable } from '@nestjs/common';
import { join } from 'path';
import { BaseProviderAdapter } from '../../sdk/base-provider-adapter';
import { ProviderConfig } from '../../sdk/provider-config.interface';
import { IFetcher } from '../../sdk/fetcher.interface';
import { IParser } from '../../sdk/parser.interface';
import { IValidator } from '../../sdk/validator.interface';
import { IMapper } from '../../sdk/mapper.interface';
import {
  CanonicalMobilityDataset,
  CanonicalMobilityNode,
  CanonicalRoutePattern,
  CanonicalTrip,
  ServiceClass,
} from '../../domain/canonical-mobility';
import {
  ProviderMappingContext,
  ProviderRunContext,
  ProviderValidationResult,
  RawProviderResponse,
} from '../../domain/mobility-provider.interface';
import { BMTC_BASE_URL, BmtcClient } from './bmtc-official.client';
import {
  BMTC_AGENCY,
  BMTC_PROVIDER_CODE,
  serviceClassLookup,
  toNode,
  toRoutePattern,
  toTrip,
  tripsFromVehicleDetails,
  landableTrips,
} from './bmtc-official.mapper';
import {
  BmtcRoute,
  BmtcRouteDetailsResponse,
  BmtcRouteListResponse,
  BmtcRouteSearchResponse,
  BmtcRouteStop,
  BmtcServiceType,
  BmtcServiceTypesResponse,
  BmtcTimetableResponse,
  envelopeOk,
  timetableTrips,
} from './bmtc-official.types';

export const BMTC_OFFICIAL_CONFIG: ProviderConfig = {
  providerCode: BMTC_PROVIDER_CODE,
  name: 'Namma BMTC commuter backend',
  sourceType: 'GOVERNMENT_APP',
  website: 'https://mybmtc.karnataka.gov.in',
  version: 'v1',
  priority: 'P0',
  modes: ['BUS'],
  accessType: 'Undocumented JSON API behind the official commuter app',
  initialStatus: 'ACTIVE',
  endpoints: [
    { name: 'Service Types', url: `${BMTC_BASE_URL}/GetAllServiceTypes`, method: 'POST', format: 'JSON' },
    { name: 'Route List', url: `${BMTC_BASE_URL}/GetAllRouteList`, method: 'POST', format: 'JSON' },
    { name: 'Route Search', url: `${BMTC_BASE_URL}/SearchRoute_v2`, method: 'POST', format: 'JSON' },
    { name: 'Route Details', url: `${BMTC_BASE_URL}/SearchByRouteDetails_v4`, method: 'POST', format: 'JSON' },
    { name: 'Timetable', url: `${BMTC_BASE_URL}/GetTimetableByRouteid_v3`, method: 'POST', format: 'JSON' },
  ],
  rateLimit: { requestsPerSecond: 1, concurrentRequests: 1, retryAttempts: 3 },
  canonicalTargets: ['providers', 'agencies', 'nodes', 'routePatterns', 'trips', 'observations'],
  geographyScope: { countryCode: 'IN', stateCode: 'KA', districts: ['Bengaluru Urban'] },
  notes: [
    'Licence and permission not yet cleared — see providers/karnataka/bengaluru/README.md.',
    'vehicleDetails is a live snapshot: per-stop times only exist while the route is running.',
  ],
};

/** Where the client caches raw responses. Shared with `scripts/ingest-bmtc.ts`. */
const CACHE_DIR = process.env.BMTC_CACHE_DIR ?? join(process.cwd(), '.bmtc-cache');

/** One directional route to crawl, plus the service classes resolved once. */
interface BmtcDiscoveryItem {
  route: BmtcRoute;
  serviceTypes: BmtcServiceType[];
  contextRunId: string;
}

/** What one route's crawl produced. One of these becomes one raw record. */
export interface BmtcRouteRecord {
  route: BmtcRoute;
  serviceTypes: BmtcServiceType[];
  stops: BmtcRouteStop[];
  timetable: BmtcTimetableResponse | null;
  error?: string;
}

function routeNumber(routeno: string): string {
  return routeno.replace(/\s+(UP|DOWN)$/i, '').trim();
}

function todayInBengaluru(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Wraps [BmtcClient] as an [IFetcher].
 *
 * The client is kept rather than replaced by the SDK's `JsonFetcher` because
 * every BMTC call is a POST with a body, and the client already carries the
 * disk cache, the one-second floor, the retry/backoff and the browser
 * User-Agent their nginx requires. `JsonFetcher` does none of that.
 */
export class BmtcFetcher implements IFetcher {
  readonly supportedFormat = 'JSON' as const;
  readonly client: BmtcClient;

  constructor(cacheDir = CACHE_DIR, minIntervalMs = Number(process.env.BMTC_INTERVAL_MS ?? 1000)) {
    this.client = new BmtcClient({ cacheDir, minIntervalMs });
  }

  async fetch(url: string, options?: Record<string, unknown>): Promise<RawProviderResponse> {
    const endpoint = url.split('/').pop()!;
    const raw = await this.client.post<Record<string, unknown>>(
      endpoint,
      (options?.body as Record<string, unknown>) ?? {},
    );
    return {
      sourceUrl: raw.sourceUrl,
      fetchedAt: raw.fetchedAt,
      statusCode: 200,
      contentType: 'application/json',
      body: raw.body,
      contentHash: raw.contentHash,
      metadata: { fromCache: raw.fromCache },
    };
  }
}

/**
 * The crawl already produced structured objects, so parsing is a pass-through.
 *
 * It exists rather than being skipped because the pipeline stores what the
 * parser returns as the raw record — dropping it would lose the per-route
 * payload that makes a failed run diagnosable without re-crawling.
 */
export class BmtcRouteParser implements IParser<BmtcRouteRecord> {
  readonly parserType = 'JSON' as const;

  async parse(response: RawProviderResponse): Promise<BmtcRouteRecord[]> {
    const body = response.body as unknown as BmtcRouteRecord;
    return body?.route ? [body] : [];
  }
}

/**
 * Rejects a run that produced no usable route, and warns on the rest.
 *
 * [StandardProviderValidator] is not reusable here: it fails any record set
 * whose members lack `id`/`code`/`name`/`stop_id`/`route_id`, and a BMTC
 * record is keyed on `route.routeid`, so every healthy BMTC run would be
 * marked invalid by it.
 */
export class BmtcValidator implements IValidator<BmtcRouteRecord> {
  async validate(records: BmtcRouteRecord[]): Promise<ProviderValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!records.length) {
      return { isValid: false, errors: ['No routes crawled from BMTC.'], warnings };
    }

    const failed = records.filter(r => r.error).length;
    const withStops = records.filter(r => r.stops.length).length;
    const withTimes = records.filter(r =>
      r.stops.some(s => (s.vehicleDetails ?? []).length),
    ).length;

    if (!withStops) errors.push('No route returned any stop.');
    if (failed) warnings.push(`${failed}/${records.length} routes failed to crawl.`);
    // Not an error: vehicleDetails is a live snapshot, so a harvest run late at
    // night legitimately sees almost nothing moving.
    if (!withTimes) {
      warnings.push(
        'No route carried vehicleDetails — per-stop times will be absent. ' +
          'Run during service hours for timetable coverage.',
      );
    }

    return { isValid: errors.length === 0, errors, warnings };
  }
}

/** Per-route crawl records -> one canonical dataset. */
export class BmtcMapper implements IMapper<BmtcRouteRecord> {
  async map(
    records: BmtcRouteRecord[],
    context: ProviderMappingContext,
  ): Promise<CanonicalMobilityDataset> {
    const nodes = new Map<string, CanonicalMobilityNode>();
    const routePatterns: CanonicalRoutePattern[] = [];
    const trips: CanonicalTrip[] = [];

    for (const record of records) {
      if (!record.stops.length) continue;
      const classByType = serviceClassLookup(record.serviceTypes);

      for (const stop of record.stops) {
        const node = toNode(stop);
        const existing = nodes.get(node.externalId!);
        // Keep the richest record: a later route may locate a stop an earlier
        // one left at 0,0.
        if (!existing || (node.latitude !== undefined && existing.latitude === undefined)) {
          nodes.set(node.externalId!, node);
        }
      }

      // Class comes from the vehicles actually working the route. Modal rather
      // than first-seen: a route can be worked by both classes, and the first
      // vehicle listed is whichever sits nearest the top of the route.
      const votes = new Map<ServiceClass, number>();
      for (const stop of record.stops) {
        for (const vehicle of stop.vehicleDetails ?? []) {
          const cls =
            vehicle.servicetypeid !== undefined
              ? classByType.get(vehicle.servicetypeid)
              : undefined;
          if (cls) votes.set(cls, (votes.get(cls) ?? 0) + 1);
        }
      }
      const routeClass: ServiceClass =
        [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'UNKNOWN';

      routePatterns.push(toRoutePattern(record.route, record.stops, routeClass));

      // Per-stop times, from the vehicle blocks the route-details call already
      // returned — the only intermediate-stop timing BMTC publishes.
      trips.push(...tripsFromVehicleDetails(record.route, record.stops));

      if (record.timetable) {
        const mapped = timetableTrips(record.timetable)
          .map((trip, i) =>
            toTrip(record.route, trip, i, classByType.get(trip.servicetypeid ?? -1) ?? 'UNKNOWN'),
          )
          .filter((t): t is CanonicalTrip => t !== null);
        trips.push(...mapped);
      }
    }

    const canonicalNodes = [...nodes.values()];
    const landable = landableTrips(trips, canonicalNodes, routePatterns);

    return {
      providers: [
        {
          code: BMTC_PROVIDER_CODE,
          name: BMTC_OFFICIAL_CONFIG.name,
          sourceType: BMTC_OFFICIAL_CONFIG.sourceType,
          website: BMTC_OFFICIAL_CONFIG.website,
          version: context.providerVersion,
          transportModes: ['BUS'],
        },
      ],
      agencies: [BMTC_AGENCY],
      nodes: canonicalNodes,
      routePatterns,
      trips: landable.trips,
      frequencies: [],
      fares: [],
      observations: [],
    };
  }
}

@Injectable()
export class BmtcOfficialProvider extends BaseProviderAdapter<BmtcDiscoveryItem, BmtcRouteRecord> {
  readonly config = BMTC_OFFICIAL_CONFIG;
  readonly fetcher = new BmtcFetcher();
  readonly parser = new BmtcRouteParser();
  readonly validator = new BmtcValidator();
  readonly mapper = new BmtcMapper();

  /**
   * Resolve the service classes and the route list, then yield one item per
   * directional route.
   *
   * `--limit` on the script becomes `BMTC_MAX_ROUTES` here: a full crawl is
   * ~9,900 routes at one request per second, so an unbounded first run against
   * a cold cache is a multi-hour commitment.
   */
  async *discover(context: ProviderRunContext): AsyncIterable<BmtcDiscoveryItem> {
    const client = this.fetcher.client;

    const types = await client.post<BmtcServiceTypesResponse>('GetAllServiceTypes');
    if (!envelopeOk(types.body)) throw new Error('GetAllServiceTypes returned issuccess=false');
    const serviceTypes = types.body.data ?? [];

    const routes = await client.post<BmtcRouteListResponse>('GetAllRouteList');
    if (!envelopeOk(routes.body)) throw new Error('GetAllRouteList returned issuccess=false');

    const max = Number(process.env.BMTC_MAX_ROUTES ?? 0);
    const all = routes.body.data ?? [];
    const selected = max > 0 ? all.slice(0, max) : all;

    for (const route of selected) {
      yield { route, serviceTypes, contextRunId: context.runId };
    }
  }

  /**
   * Everything one route needs: its parent's stop list, and its timetable.
   *
   * Returns a record rather than throwing when a step fails. A thrown error
   * would abort the crawl on the first unmatched route number, and roughly one
   * route in twenty does not resolve; [BmtcValidator] reports the tally
   * instead.
   */
  async fetch(item: BmtcDiscoveryItem, context: ProviderRunContext): Promise<RawProviderResponse> {
    const client = this.fetcher.client;
    const { route, serviceTypes } = item;
    const record: BmtcRouteRecord = { route, serviceTypes, stops: [], timetable: null };
    let sourceUrl = `${BMTC_BASE_URL}/SearchByRouteDetails_v4#${route.routeid}`;
    let fetchedAt = new Date().toISOString();
    let contentHash = `bmtc-${route.routeid}`;

    try {
      const number = routeNumber(route.routeno);
      // Half of BMTC's route numbers carry the terminal pair as well as the
      // number — "335-E SNBS-KDG", not "335-E". Search the leading token, then
      // still require an exact match so a sibling variant is never silently
      // substituted.
      const token = number.split(/\s+/)[0];
      const search = await client.post<BmtcRouteSearchResponse>('SearchRoute_v2', {
        routetext: token,
      });
      const norm = (value: string) => value.trim().toLowerCase();
      const candidates = search.body.data ?? [];
      const exact =
        candidates.find(c => norm(c.routeno) === norm(number)) ??
        candidates.find(c => norm(c.routeno) === norm(token));
      if (!exact) throw new Error(`No exact parent route match for ${number}`);

      const details = await client.post<BmtcRouteDetailsResponse>('SearchByRouteDetails_v4', {
        routeid: exact.routeparentid,
        servicetypeid: 0,
      });
      sourceUrl = details.sourceUrl;
      fetchedAt = details.fetchedAt;
      contentHash = details.contentHash;

      const directional = [
        ...(details.body.data ?? details.body.routedetails ?? []),
        ...(details.body.up?.data ?? []),
        ...(details.body.down?.data ?? []),
      ];
      record.route.routeparentid = exact.routeparentid;
      record.stops = directional.filter(
        stop => stop.routeid === undefined || stop.routeid === route.routeid,
      );
      if (!record.stops.length) {
        throw new Error(`No stops returned for directional route ${route.routeid}`);
      }

      const serviceDate = todayInBengaluru();
      const timetable = await client.post<BmtcTimetableResponse>('GetTimetableByRouteid_v3', {
        routeid: route.routeid,
        fromStationId: route.fromstationid ?? 0,
        toStationId: route.tostationid ?? 0,
        current_date: serviceDate,
        starttime: `${serviceDate} 00:00`,
        endtime: `${serviceDate} 23:59`,
      });
      record.timetable = timetable.body;
    } catch (error) {
      record.error = String(error).slice(0, 200);
    }

    return {
      sourceUrl,
      fetchedAt,
      statusCode: 200,
      contentType: 'application/json',
      body: record as unknown as Record<string, unknown>,
      contentHash,
      metadata: { routeid: route.routeid, runId: context.runId },
    };
  }
}
