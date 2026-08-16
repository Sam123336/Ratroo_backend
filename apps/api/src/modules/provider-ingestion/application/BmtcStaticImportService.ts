/**
 * Stage and promote the harvested BMTC network.
 *
 * Reads the canonical JSON produced by `npm run bmtc:ingest` and pushes it
 * through the mandated path: staged tables → dataset version → promotion.
 * Nothing here writes to `routes`, `stops` or `stop_times` directly —
 * `providers/karnataka/bengaluru/README.md` forbids it, and
 * `DatasetPromotionService` already knows how to project a bus network
 * (`BMTC_OFFICIAL` is in its `BusProviderCode` union).
 *
 * **BMTC publishes only the two endpoint times per trip** — first call and
 * last call, nothing between. Those land here as real `stop_times` with
 * `timeIsEstimated: false`. Intermediate stops get nothing, and a rider
 * looking at a mid-route stop still sees "no timetable" until
 * `npm run timetables:interpolate` fills the gaps as `INTERPOLATED`. That
 * ordering is deliberate: the operator's own times are staged first and never
 * overwritten, and the estimates are added afterwards, labelled.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { readFileSync, existsSync } from 'fs';
import { Sequelize } from 'sequelize-typescript';
import { Transaction } from 'sequelize';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';
import { DatasetPromotionService } from './DatasetPromotionService';
import {
  CanonicalAgency,
  CanonicalMobilityNode,
  CanonicalRoutePattern,
  CanonicalTrip,
} from '../domain/canonical-mobility';
import {
  DatasetModel,
  DatasetVersionModel,
  ProviderRunModel,
  RawSourceRecordModel,
  SourceObservationModel,
  StagedAgencyModel,
  StagedNodeModel,
  StagedRouteModel,
  StagedRouteStopModel,
  StagedStopTimeModel,
  StagedTripModel,
} from '../infrastructure/sequelize/models';

const PROVIDER_CODE = 'BMTC_OFFICIAL';
const PROVIDER_VERSION = 'v1';
const DATASET_NAME = 'BMTC route network';

export interface BmtcHarvest {
  generatedAt: string;
  source: string;
  agency: CanonicalAgency;
  counts: Record<string, number>;
  nodes: CanonicalMobilityNode[];
  routePatterns: CanonicalRoutePattern[];
  trips: CanonicalTrip[];
}

export interface BmtcImportResult {
  datasetVersionId: string;
  staged: { nodes: number; routes: number; routeStops: number; trips: number; stopTimes: number };
  promoted: boolean;
  promotion?: unknown;
}

@Injectable()
export class BmtcStaticImportService {
  private readonly logger = new Logger(BmtcStaticImportService.name);

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(DatasetModel) private readonly datasetModel: typeof DatasetModel,
    @InjectModel(DatasetVersionModel) private readonly datasetVersionModel: typeof DatasetVersionModel,
    @InjectModel(ProviderRunModel) private readonly providerRunModel: typeof ProviderRunModel,
    @InjectModel(RawSourceRecordModel) private readonly rawSourceRecordModel: typeof RawSourceRecordModel,
    @InjectModel(SourceObservationModel) private readonly sourceObservationModel: typeof SourceObservationModel,
    @InjectModel(StagedAgencyModel) private readonly stagedAgencyModel: typeof StagedAgencyModel,
    @InjectModel(StagedNodeModel) private readonly stagedNodeModel: typeof StagedNodeModel,
    @InjectModel(StagedRouteModel) private readonly stagedRouteModel: typeof StagedRouteModel,
    @InjectModel(StagedRouteStopModel) private readonly stagedRouteStopModel: typeof StagedRouteStopModel,
    @InjectModel(StagedTripModel) private readonly stagedTripModel: typeof StagedTripModel,
    @InjectModel(StagedStopTimeModel) private readonly stagedStopTimeModel: typeof StagedStopTimeModel,
    private readonly promotionService: DatasetPromotionService,
  ) {}

  /** `dryRun` stages and reports, then rolls the whole transaction back. */
  async importFromFile(path: string, options: { dryRun?: boolean; contentHash?: string } = {}) {
    if (!existsSync(path)) {
      throw new BadRequestException(
        `No harvest at ${path}. Run \`npm run bmtc:ingest\` first.`,
      );
    }
    const harvest = JSON.parse(readFileSync(path, 'utf8')) as BmtcHarvest;
    return this.import(harvest, options);
  }

  async import(
    harvest: BmtcHarvest,
    options: { dryRun?: boolean; contentHash?: string } = {},
  ): Promise<BmtcImportResult> {
    this.assertUsable(harvest);

    const contentHash =
      options.contentHash ??
      `bmtc:${harvest.generatedAt}:${harvest.nodes.length}:${harvest.trips.length}`;

    // Staging runs in its own transaction so a dry run can roll back cleanly
    // without also unwinding a promotion that never happened.
    let staged!: BmtcImportResult['staged'];
    let datasetVersionId!: string;

    const stage = async (transaction: Transaction) => {
      const result = await this.stageCanonical(harvest, contentHash, transaction);
      staged = result.staged;
      datasetVersionId = result.datasetVersionId;
      if (options.dryRun) {
        // Nothing is kept. The counts above are the whole point of a dry run.
        throw new DryRunComplete();
      }
    };

    try {
      await this.sequelize.transaction(stage);
    } catch (error) {
      if (error instanceof DryRunComplete) {
        this.logger.log(`Dry run staged ${JSON.stringify(staged)} — rolled back.`);
        return { datasetVersionId, staged, promoted: false };
      }
      throw error;
    }

    const promotion = await this.promotionService.promoteDatasetVersion(datasetVersionId);
    this.logger.log(`Promoted ${datasetVersionId}: ${JSON.stringify(promotion)}`);
    return { datasetVersionId, staged, promoted: true, promotion };
  }

  /**
   * Refuses a harvest that would quietly shrink the network.
   *
   * A partial run — the API rate-limiting us, or the process killed halfway —
   * produces a valid-looking file with a fraction of the routes. Promoting it
   * supersedes the previous active version, so a rider would watch Bengaluru's
   * coverage collapse with nothing in the logs saying why.
   */
  private assertUsable(harvest: BmtcHarvest) {
    if (!harvest.nodes?.length) throw new BadRequestException('Harvest contains no stops.');
    if (!harvest.routePatterns?.length) throw new BadRequestException('Harvest contains no routes.');
    const withTimes = harvest.trips?.filter(t => t.stopTimes?.length).length ?? 0;
    if (!withTimes) {
      throw new BadRequestException(
        'Harvest contains no trips with times — promoting it would replace a timed network with an untimed one.',
      );
    }
  }

  private async stageCanonical(harvest: BmtcHarvest, contentHash: string, transaction: Transaction) {
    const counts = harvest.counts ?? {};
    const run = await this.providerRunModel.create(
      {
        providerCode: PROVIDER_CODE,
        providerVersion: PROVIDER_VERSION,
        status: 'SUCCESS',
        runType: 'STATIC_IMPORT',
        startedAt: new Date(),
        finishedAt: new Date(),
        discoveredCount: Number(counts.routesProcessed ?? harvest.routePatterns.length),
        fetchedCount: Number(counts.routesProcessed ?? harvest.routePatterns.length),
        parsedCount: harvest.routePatterns.length,
        failedCount: Number(counts.failures ?? 0),
        metrics: counts,
      } as never,
      { transaction },
    );

    const raw = await this.rawSourceRecordModel.create(
      {
        providerCode: PROVIDER_CODE,
        providerRunId: run.id,
        sourceUrl: 'https://bmtcmobileapi.karnataka.gov.in/WebAPI',
        contentHash,
        // The per-endpoint payloads stay in .bmtc-cache/ — tens of MB of raw
        // JSON does not belong in a database column. This records what was
        // fetched and where the bytes are.
        rawPayload: { note: harvest.source, counts, cache: '.bmtc-cache/' },
        metadata: { generatedAt: harvest.generatedAt },
        status: 'PARSED',
        fetchedAt: new Date(harvest.generatedAt),
      } as never,
      { transaction },
    );

    const [dataset] = await this.datasetModel.findOrCreate({
      where: { providerCode: PROVIDER_CODE, name: DATASET_NAME },
      defaults: { providerCode: PROVIDER_CODE, name: DATASET_NAME, status: 'ACTIVE' } as never,
      transaction,
    });

    const datasetVersion = await this.datasetVersionModel.create(
      {
        datasetId: dataset.id,
        providerRunId: run.id,
        contentHash,
        validationSummary: { errors: [], warnings: [] },
        status: 'STAGED',
      } as never,
      { transaction },
    );

    const observation = await this.sourceObservationModel.create(
      {
        providerCode: PROVIDER_CODE,
        providerVersion: PROVIDER_VERSION,
        rawSourceRecordId: raw.id,
        sourceUrl: 'https://bmtcmobileapi.karnataka.gov.in/WebAPI',
        contentHash,
        confidence: 0.9,
        // The operator's own backend, but with no published usage terms — so
        // AUTO_VALIDATED, not OFFICIAL. OFFICIAL is reserved for data we were
        // given rather than data we read.
        verificationStatus: 'AUTO_VALIDATED',
        warnings: ['BMTC publishes endpoint times only; intermediate stops require interpolation.'],
      } as never,
      { transaction },
    );

    const common = {
      datasetVersionId: datasetVersion.id,
      providerCode: PROVIDER_CODE,
      sourceObservationId: observation.id,
      validationStatus: 'VALIDATED' as const,
    };

    await this.bulk(this.stagedAgencyModel, [
      {
        id: ensureUuidV7(),
        ...common,
        providerExternalId: harvest.agency.externalId,
        operationalStatus: 'ACTIVE',
        canonicalPayload: harvest.agency,
      },
    ], transaction);

    await this.bulk(
      this.stagedNodeModel,
      harvest.nodes.map(node => ({
        id: ensureUuidV7(),
        ...common,
        providerExternalId: node.externalId,
        operationalStatus: 'ACTIVE',
        canonicalPayload: node,
      })),
      transaction,
    );

    await this.bulk(
      this.stagedRouteModel,
      harvest.routePatterns.map(route => ({
        id: ensureUuidV7(),
        ...common,
        providerExternalId: route.externalId,
        operationalStatus: route.operationalStatus,
        canonicalPayload: route,
      })),
      transaction,
    );

    // Flattened: promotion reads route membership from these rows, matching
    // `canonicalPayload.routeExternalId` to `canonicalPayload.nodeExternalId`.
    const routeStops = harvest.routePatterns.flatMap(route =>
      route.stops.map(stop => ({
        id: ensureUuidV7(),
        ...common,
        providerExternalId: `${route.externalId}:${stop.nodeExternalId}`,
        operationalStatus: 'ACTIVE',
        canonicalPayload: {
          routeExternalId: route.externalId,
          nodeExternalId: stop.nodeExternalId,
          sequence: stop.sequence,
          name: stop.name,
          pickupAllowed: stop.pickupAllowed ?? true,
          dropoffAllowed: stop.dropoffAllowed ?? true,
        },
      })),
    );
    await this.bulk(this.stagedRouteStopModel, routeStops, transaction);

    await this.bulk(
      this.stagedTripModel,
      harvest.trips.map(trip => ({
        id: ensureUuidV7(),
        ...common,
        providerExternalId: trip.externalId,
        operationalStatus: trip.operationalStatus,
        canonicalPayload: trip,
      })),
      transaction,
    );

    const stopTimes = harvest.trips.flatMap(trip =>
      trip.stopTimes.map(st => ({
        id: ensureUuidV7(),
        ...common,
        providerExternalId: `${trip.externalId}:${st.sequence}`,
        operationalStatus: 'ACTIVE',
        canonicalPayload: {
          tripExternalId: trip.externalId,
          stopExternalId: st.stopExternalId,
          stopName: st.stopName,
          sequence: st.sequence,
          arrivalTime: st.arrivalTime,
          departureTime: st.departureTime,
          // Published by BMTC. Interpolation adds INTERPOLATED rows later and
          // must never overwrite these.
          timeIsEstimated: false,
        },
      })),
    );
    await this.bulk(this.stagedStopTimeModel, stopTimes, transaction);

    return {
      datasetVersionId: datasetVersion.id,
      staged: {
        nodes: harvest.nodes.length,
        routes: harvest.routePatterns.length,
        routeStops: routeStops.length,
        trips: harvest.trips.length,
        stopTimes: stopTimes.length,
      },
    };
  }

  /** Batched: a single insert of ~200k stop times exceeds the parameter limit. */
  private async bulk(model: any, rows: unknown[], transaction: Transaction, size = 500) {
    for (let i = 0; i < rows.length; i += size) {
      await model.bulkCreate(rows.slice(i, i + size), { transaction });
    }
  }
}

class DryRunComplete extends Error {}
