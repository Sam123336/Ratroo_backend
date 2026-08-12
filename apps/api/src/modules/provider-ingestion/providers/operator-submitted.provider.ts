import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CanonicalMobilityDataset, NodeType, TransportMode } from '../domain/canonical-mobility';
import {
  ProviderMappingContext, ProviderRunContext, ProviderValidationResult,
  RawProviderResponse,
} from '../domain/mobility-provider.interface';
import { OperatorRouteStopModel } from '../../operators/entities/operator-route-stop.model';
import {
  OperatorRouteModel, RoutePublishState,
} from '../../operators/entities/operator-route.model';
import { OperatorModel } from '../../operators/entities/operator.model';
import { OperatorStatus } from '../../operators/domain/operator-status';
import { VehicleType } from '../../operators/domain/vehicle-type';
import { BaseProviderAdapter } from '../sdk/base-provider-adapter';
import { ProviderConfig } from '../sdk/provider-config.interface';
import { IFetcher } from '../sdk/fetcher.interface';
import { IParser } from '../sdk/parser.interface';
import { IValidator } from '../sdk/validator.interface';
import { IMapper } from '../sdk/mapper.interface';

export const OPERATOR_SUBMITTED_CONFIG: ProviderConfig = {
  providerCode: 'OPERATOR_SUBMITTED',
  name: 'Registered operators',
  // The strongest source class the model has: the business that runs the
  // service, telling us directly.
  sourceType: 'OPERATOR',
  website: 'ratroo://operators',
  version: 'v1',
  priority: 'P0',
  modes: ['BUS', 'FERRY', 'TRAM', 'AUTO', 'SHARED_AUTO'],
  accessType: 'First-party submissions',
  initialStatus: 'ACTIVE',
  // One internal endpoint: the fetch reads the database rather than a URL, but
  // the pipeline still wants something to iterate.
  endpoints: [
    { name: 'Published operator routes', url: 'ratroo://operators/published', format: 'JSON' },
  ],
  canonicalTargets: ['providers', 'agencies', 'nodes', 'routePatterns', 'trips', 'fares', 'observations'],
  notes: [
    'Operator-supplied timetables and fares are published as they were given, ' +
      'never estimated. Only VERIFIED operators are read.',
  ],
};

/** One operator route, flattened for the pipeline. */
interface OperatorRouteRecord {
  operatorId: string;
  operatorName: string;
  operatorProviderCode: string;
  routeId: string;
  routeName: string;
  vehicleType: VehicleType;
  mode: TransportMode;
  fareINR: number | null;
  operatingDays: number[] | null;
  vehicleRegistration: string | null;
  vehicleName: string | null;
  stops: Array<{
    sequence: number;
    stopName: string;
    latitude: number | null;
    longitude: number | null;
    departureTime: string | null;
    fareFromOriginINR: number | null;
  }>;
}

/** Everything road-borne that is not a tram rides as a bus in the planner. */
function modeFor(vehicle: VehicleType): TransportMode {
  switch (vehicle) {
    case VehicleType.FERRY: return 'FERRY';
    case VehicleType.TRAM: return 'TRAM';
    case VehicleType.AUTO:
    case VehicleType.E_RICKSHAW: return 'AUTO';
    case VehicleType.SHARED_TAXI: return 'SHARED_AUTO';
    default: return 'BUS';
  }
}

/**
 * Reads published routes belonging to verified operators.
 *
 * The "fetch" is a database read, but it still produces a RawProviderResponse
 * with a content hash, so operator submissions get the same archived raw
 * record, the same change detection between runs, and the same provenance
 * trail as anything scraped. Nothing downstream needs to know the source was
 * internal.
 */
@Injectable()
export class OperatorSubmissionFetcher implements IFetcher {
  readonly supportedFormat = 'JSON' as const;

  constructor(
    @InjectModel(OperatorRouteModel)
    private readonly routes: typeof OperatorRouteModel,
  ) {}

  async fetch(url: string): Promise<RawProviderResponse> {
    const rows = await this.routes.findAll({
      where: { publishState: RoutePublishState.PUBLISHED },
      include: [
        {
          model: OperatorModel,
          // Verification is the trust decision. A pending or suspended
          // operator's routes never reach the pipeline, whatever they marked
          // as published before review.
          where: { status: OperatorStatus.VERIFIED },
          required: true,
        },
        OperatorRouteStopModel,
      ],
      order: [
        ['createdAt', 'ASC'],
        [OperatorRouteStopModel, 'sequence', 'ASC'],
      ],
    });

    const records: OperatorRouteRecord[] = rows.map(route => ({
      operatorId: route.operatorId,
      operatorName: route.operator?.name ?? 'Unknown operator',
      operatorProviderCode: route.operator?.providerCode ?? OPERATOR_SUBMITTED_CONFIG.providerCode,
      routeId: route.id,
      routeName: route.name,
      vehicleType: route.vehicleType,
      mode: modeFor(route.vehicleType),
      fareINR: route.fareINR ?? null,
      operatingDays: route.operatingDays ?? null,
      vehicleRegistration: route.vehicle?.registrationNumber ?? null,
      vehicleName: route.vehicle?.displayName ?? null,
      stops: (route.stops ?? []).map(stop => ({
        sequence: stop.sequence,
        stopName: stop.stopName,
        latitude: stop.latitude == null ? null : Number(stop.latitude),
        longitude: stop.longitude == null ? null : Number(stop.longitude),
        departureTime: stop.departureTime ?? null,
        fareFromOriginINR: stop.fareFromOriginINR ?? null,
      })),
    }));

    const body = { records };

    return {
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      statusCode: 200,
      contentType: 'application/json',
      body,
      // A real hash of the payload, not a timestamp: an unchanged night should
      // be recognisable as unchanged.
      contentHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      metadata: { routeCount: records.length },
    };
  }
}

export class OperatorSubmissionParser implements IParser<OperatorRouteRecord> {
  readonly parserType = 'JSON' as const;

  async parse(response: RawProviderResponse): Promise<OperatorRouteRecord[]> {
    const body =
      typeof response.body === 'string'
        ? (JSON.parse(response.body) as { records?: OperatorRouteRecord[] })
        : (response.body as { records?: OperatorRouteRecord[] });
    return body?.records ?? [];
  }
}

/**
 * Refuses submissions that would mislead a rider rather than repairing them.
 *
 * The DTOs already validate what an operator types; this is the second gate,
 * against what actually reached the database — a route whose stops were
 * deleted after publishing, a time that stopped being HH:MM through a manual
 * edit. Silently fixing either would put a made-up service in front of a rider.
 */
export class OperatorSubmissionValidator implements IValidator<OperatorRouteRecord> {
  async validate(records: OperatorRouteRecord[]): Promise<ProviderValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const record of records) {
      const label = `${record.operatorName} / ${record.routeName}`;

      if (record.stops.length < 2) {
        errors.push(`${label}: a route needs at least two stops, found ${record.stops.length}.`);
        continue;
      }

      const badTime = record.stops.find(
        stop => stop.departureTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(stop.departureTime),
      );
      if (badTime) {
        errors.push(`${label}: "${badTime.departureTime}" at stop ${badTime.sequence} is not HH:MM.`);
      }

      if (!record.stops.some(stop => stop.departureTime)) {
        // Not fatal: a route with no times is still worth knowing exists, and
        // the app already says "no timetable published" rather than inventing.
        warnings.push(`${label}: no departure times published.`);
      }

      if (!record.stops.some(stop => stop.latitude != null && stop.longitude != null)) {
        warnings.push(`${label}: no coordinates, so stops will be matched by name alone.`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

/**
 * Turns operator submissions into the canonical shape.
 *
 * Times and fares are carried as published, marked not-estimated. That is the
 * whole point of trusting the operator: their own fare outranks a distance
 * estimate, and their own timetable outranks an interpolated one.
 */
export class OperatorSubmissionMapper implements IMapper<OperatorRouteRecord> {
  async map(
    records: OperatorRouteRecord[],
    context: ProviderMappingContext,
  ): Promise<CanonicalMobilityDataset> {
    const dataset: CanonicalMobilityDataset = {
      providers: [
        {
          code: OPERATOR_SUBMITTED_CONFIG.providerCode,
          name: OPERATOR_SUBMITTED_CONFIG.name,
          sourceType: 'OPERATOR',
          website: OPERATOR_SUBMITTED_CONFIG.website,
          version: OPERATOR_SUBMITTED_CONFIG.version,
          transportModes: OPERATOR_SUBMITTED_CONFIG.modes,
        },
      ],
      agencies: [],
      nodes: [],
      routePatterns: [],
      trips: [],
      frequencies: [],
      fares: [],
      observations: [],
    };

    const geography = { countryCode: 'IN' as const, stateCode: 'WB' };
    const seenAgencies = new Set<string>();
    const seenNodes = new Set<string>();

    for (const record of records) {
      if (!seenAgencies.has(record.operatorId)) {
        seenAgencies.add(record.operatorId);
        dataset.agencies.push({
          externalId: record.operatorId,
          providerCode: OPERATOR_SUBMITTED_CONFIG.providerCode,
          name: record.operatorName,
          geography,
        });
      }

      for (const stop of record.stops) {
        const nodeId = `${record.operatorId}:${normalise(stop.stopName)}`;
        if (seenNodes.has(nodeId)) continue;
        seenNodes.add(nodeId);

        dataset.nodes.push({
          externalId: nodeId,
          providerCode: OPERATOR_SUBMITTED_CONFIG.providerCode,
          nodeType: nodeTypeFor(record.mode),
          name: stop.stopName,
          normalizedName: normalise(stop.stopName),
          aliases: [],
          latitude: stop.latitude ?? undefined,
          longitude: stop.longitude ?? undefined,
          geography,
          // A pin the operator dropped themselves is the best coordinate we
          // will get for a village stop; a name alone is worth much less,
          // since resolution still has to guess which place it means.
          confidence: stop.latitude != null && stop.longitude != null ? 0.95 : 0.6,
        });
      }

      dataset.routePatterns.push({
        externalId: record.routeId,
        providerCode: OPERATOR_SUBMITTED_CONFIG.providerCode,
        agencyExternalId: record.operatorId,
        mode: record.mode,
        longName: record.routeName,
        operationalStatus: 'ACTIVE',
        stops: record.stops.map(stop => ({
          nodeExternalId: `${record.operatorId}:${normalise(stop.stopName)}`,
          name: stop.stopName,
          sequence: stop.sequence,
        })),
      });

      dataset.trips.push({
        externalId: `${record.routeId}:trip`,
        providerCode: OPERATOR_SUBMITTED_CONFIG.providerCode,
        routeExternalId: record.routeId,
        serviceName: record.routeName,
        vehicleRegistration: record.vehicleRegistration ?? undefined,
        vehicleName: record.vehicleName ?? undefined,
        serviceDays: record.operatingDays ?? undefined,
        operationalStatus: 'ACTIVE',
        stopTimes: record.stops.map(stop => ({
          stopExternalId: `${record.operatorId}:${normalise(stop.stopName)}`,
          stopName: stop.stopName,
          sequence: stop.sequence,
          departureTime: stop.departureTime ?? undefined,
          // Published by the operator, so never flagged as an estimate.
          timeIsEstimated: false,
        })),
      });

      if (record.fareINR != null) {
        dataset.fares.push({
          currency: 'INR',
          amount: record.fareINR,
          fareType: 'FIXED',
        });
      }

      // Stage fares: what it costs from the first stop to each later one.
      const origin = record.stops[0];
      for (const stop of record.stops) {
        if (stop.fareFromOriginINR == null || !origin) continue;
        dataset.fares.push({
          currency: 'INR',
          amount: stop.fareFromOriginINR,
          fromNodeExternalId: `${record.operatorId}:${normalise(origin.stopName)}`,
          toNodeExternalId: `${record.operatorId}:${normalise(stop.stopName)}`,
          fareType: 'FIXED',
        });
      }

      dataset.observations.push({
        providerCode: OPERATOR_SUBMITTED_CONFIG.providerCode,
        providerVersion: OPERATOR_SUBMITTED_CONFIG.version,
        sourceUrl: `ratroo://operators/${record.operatorProviderCode}/routes/${record.routeId}`,
        sourceRecordId: record.routeId,
        fetchedAt: context.fetchedAt,
        contentHash: createHash('sha256')
          .update(JSON.stringify(record))
          .digest('hex'),
        rawRecordId: record.routeId,
        // The operator is the authority on their own service: nothing we could
        // scrape would be a better source for it.
        confidence: 1,
        verificationStatus: 'OPERATOR_VERIFIED',
        warnings: [],
      });
    }

    return dataset;
  }
}

/** The stop kind a rider would recognise for this mode. */
function nodeTypeFor(mode: TransportMode): NodeType {
  switch (mode) {
    case 'FERRY': return 'FERRY_TERMINAL';
    case 'TRAM': return 'TRAM_STOP';
    case 'AUTO':
    case 'SHARED_AUTO': return 'AUTO_STAND';
    default: return 'BUS_STOP';
  }
}

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Registered operators as a provider.
 *
 * Deliberately not a parallel write path into `routes`/`stops`. Going through
 * the same pipeline means operator data gets canonical stop resolution — so an
 * owner typing "Arambagh Bus Stand" lands on the stop riders already search —
 * plus the quality gate, provenance and dataset versioning, for free. A
 * private path would have to reimplement all of it, and every future feature
 * would need to know about both.
 */
@Injectable()
export class OperatorSubmittedProvider extends BaseProviderAdapter<
  { url: string },
  OperatorRouteRecord
> {
  readonly config = OPERATOR_SUBMITTED_CONFIG;
  readonly parser = new OperatorSubmissionParser();
  readonly validator = new OperatorSubmissionValidator();
  readonly mapper = new OperatorSubmissionMapper();

  constructor(readonly fetcher: OperatorSubmissionFetcher) {
    super();
  }

  /** One pass over the whole set; there are no pages to crawl. */
  async *discover(context: ProviderRunContext): AsyncIterable<{ url: string }> {
    yield { url: this.config.endpoints[0].url };
  }
}
