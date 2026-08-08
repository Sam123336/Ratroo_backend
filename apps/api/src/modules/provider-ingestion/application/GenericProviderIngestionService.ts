import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { DatasetPromotionService } from './DatasetPromotionService';
import { BaseProviderAdapter } from '../sdk/base-provider-adapter';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';
import {
  DatasetModel,
  DatasetVersionModel,
  ProviderItemCheckpointModel,
  ProviderRunModel,
  RawSourceRecordModel,
  SourceObservationModel,
  StagedNodeModel,
  StagedRouteModel,
  StagedRouteStopModel,
  StagedTripModel,
  StagedStopTimeModel,
  ProviderNodeMappingModel,
} from '../infrastructure/sequelize/models';

export interface IngestionPipelineResult {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED_UNCHANGED';
  providerCode: string;
  runId: string;
  datasetVersionId: string;
  pagesFetched: number;
  rawDocumentsStored: number;
  recordsParsed: number;
  recordsRejected: number;
  routesDiscovered: number;
  stopsDiscovered: number;
  routeStopsDiscovered: number;
  tripsDiscovered: number;
  syncDurationMs: number;
  promotedStatus: string;
  counts: {
    nodes: number;
    routes: number;
    routeStops: number;
    trips: number;
  };
}

@Injectable()
export class GenericProviderIngestionService {
  private readonly logger = new Logger(GenericProviderIngestionService.name);

  constructor(
    @InjectConnection()
    private readonly sequelize: Sequelize,
    @InjectModel(ProviderRunModel)
    private readonly providerRunModel: typeof ProviderRunModel,
    @InjectModel(ProviderItemCheckpointModel)
    private readonly checkpointModel: typeof ProviderItemCheckpointModel,
    @InjectModel(RawSourceRecordModel)
    private readonly rawSourceRecordModel: typeof RawSourceRecordModel,
    @InjectModel(DatasetModel)
    private readonly datasetModel: typeof DatasetModel,
    @InjectModel(DatasetVersionModel)
    private readonly datasetVersionModel: typeof DatasetVersionModel,
    @InjectModel(SourceObservationModel)
    private readonly sourceObservationModel: typeof SourceObservationModel,
    @InjectModel(StagedNodeModel)
    private readonly stagedNodeModel: typeof StagedNodeModel,
    @InjectModel(StagedRouteModel)
    private readonly stagedRouteModel: typeof StagedRouteModel,
    @InjectModel(StagedRouteStopModel)
    private readonly stagedRouteStopModel: typeof StagedRouteStopModel,
    @InjectModel(StagedTripModel)
    private readonly stagedTripModel: typeof StagedTripModel,
    @InjectModel(StagedStopTimeModel)
    private readonly stagedStopTimeModel: typeof StagedStopTimeModel,
    @InjectModel(ProviderNodeMappingModel)
    private readonly providerNodeMappingModel: typeof ProviderNodeMappingModel,
    private readonly promotion: DatasetPromotionService,
  ) {}

  async runIngestionPipeline(adapter: BaseProviderAdapter): Promise<IngestionPipelineResult> {
    const startTime = Date.now();
    const providerCode = adapter.providerCode;
    const run = await this.providerRunModel.create({
      providerCode,
      providerVersion: adapter.version,
      status: 'DISCOVERING',
      runType: 'FULL',
      metrics: { startedAt: new Date().toISOString() },
    });

    try {
      const discoveryContext = {
        runId: run.id,
        providerCode,
        providerVersion: adapter.version,
        startedAt: new Date().toISOString(),
      };

      const discoveryItems: Record<string, unknown>[] = [];
      for await (const item of adapter.discover(discoveryContext)) {
        discoveryItems.push(item as Record<string, unknown>);
      }

      await run.update({
        status: 'FETCHING',
        discoveredCount: discoveryItems.length,
      });

      const rawResponses = [];
      // WBBUS has roughly a thousand independent detail pages. A tiny pool
      // avoids a multi-hour serial crawl while remaining gentle to the
      // community site. Other adapters retain the original serial behaviour.
      const fetchConcurrency = providerCode === 'WBBUS'
        ? Math.max(1, Number(process.env.WBBUS_FETCH_CONCURRENCY || 3))
        : 1;

      for (let index = 0; index < discoveryItems.length; index += fetchConcurrency) {
        const batch = discoveryItems.slice(index, index + fetchConcurrency);
        const batchResponses = await Promise.all(
          batch.map(item => adapter.fetch(item, discoveryContext)),
        );

        for (const rawRes of batchResponses) {
          rawResponses.push(rawRes);
          await this.rawSourceRecordModel.create({
          providerCode,
          providerRunId: run.id,
          sourceUrl: rawRes.sourceUrl,
          contentHash: rawRes.contentHash,
          contentType: rawRes.contentType || 'text/plain',
          statusCode: rawRes.statusCode || 200,
          rawPayload: { body: rawRes.body },
          metadata: rawRes.metadata || {},
          status: 'RAW_SAVED',
          fetchedAt: new Date(rawRes.fetchedAt),
          });
        }
      }

      await run.update({ status: 'PARSING', fetchedCount: rawResponses.length });

      let allParsedRecords: Record<string, unknown>[] = [];
      for (const res of rawResponses) {
        const parsed = await adapter.parse(res);
        allParsedRecords = allParsedRecords.concat(parsed as Record<string, unknown>[]);
      }

      await run.update({ status: 'VALIDATING', parsedCount: allParsedRecords.length });

      const validation = await adapter.validate(allParsedRecords);
      if (!validation.isValid) {
        await run.update({
          status: 'FAILED',
          errorMessage: validation.errors.join(' | '),
        });
        throw new BadRequestException(`Validation failed for provider ${providerCode}: ${validation.errors.join(', ')}`);
      }

      await run.update({ status: 'MAPPING' });

      const mappingContext = {
        runId: run.id,
        providerCode,
        providerVersion: adapter.version,
        fetchedAt: new Date().toISOString(),
      };

      const canonicalDatasets = await adapter.map(allParsedRecords, mappingContext);
      const canonical = canonicalDatasets[0];

      await run.update({ status: 'STAGING' });

      const stagedResult = await this.stageCanonicalDataset(run, canonical);
      
      await run.update({ status: 'PROMOTING' });

      const promotionResult = await this.promotion.promoteDatasetVersion(stagedResult.datasetVersionId);

      const endTime = Date.now();
      const durationMs = endTime - startTime;

      await run.update({
        status: 'COMPLETED',
        metrics: {
          durationMs,
          datasetVersionId: stagedResult.datasetVersionId,
          promoted: promotionResult,
          counts: stagedResult.counts,
        },
      });

      return {
        status: 'SUCCESS',
        providerCode,
        runId: run.id,
        datasetVersionId: stagedResult.datasetVersionId,
        pagesFetched: discoveryItems.length,
        rawDocumentsStored: rawResponses.length,
        recordsParsed: allParsedRecords.length,
        recordsRejected: validation.errors.length,
        routesDiscovered: canonical.routePatterns.length,
        stopsDiscovered: canonical.nodes.length,
        routeStopsDiscovered: canonical.routePatterns.reduce((sum, r) => sum + r.stops.length, 0),
        tripsDiscovered: canonical.trips.length,
        syncDurationMs: durationMs,
        promotedStatus: promotionResult.status,
        counts: {
          nodes: canonical.nodes.length,
          routes: canonical.routePatterns.length,
          routeStops: canonical.routePatterns.reduce((sum, r) => sum + r.stops.length, 0),
          trips: canonical.trips.length,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await run.update({
        status: 'FAILED',
        errorMessage: message,
      });
      throw error;
    }
  }

  private async stageCanonicalDataset(run: ProviderRunModel, canonical: any) {
    return this.sequelize.transaction(async (transaction) => {
      const [dataset] = await this.datasetModel.findOrCreate({
        where: {
          providerCode: run.providerCode,
          name: `${run.providerCode} Dataset`,
        },
        defaults: {
          providerCode: run.providerCode,
          name: `${run.providerCode} Dataset`,
          status: 'ACTIVE',
        },
        transaction,
      });

      const datasetVersion = await this.datasetVersionModel.create(
        {
          datasetId: dataset.id,
          providerRunId: run.id,
          contentHash: `hash_${run.providerCode}_${Date.now()}`,
          validationSummary: { errors: [], warnings: [] },
          status: 'STAGED',
        },
        { transaction },
      );

      let rawRecord = await this.rawSourceRecordModel.findOne({
        where: { providerRunId: run.id },
        transaction,
      });

      if (!rawRecord) {
        rawRecord = await this.rawSourceRecordModel.create(
          {
            providerCode: run.providerCode,
            providerRunId: run.id,
            sourceUrl: canonical.observations[0]?.sourceUrl || 'https://transport.wb.gov.in',
            contentHash: `hash_${run.providerCode}_${Date.now()}`,
            contentType: 'text/html',
            statusCode: 200,
            rawPayload: { body: 'Ingested raw payload' },
            status: 'RAW_SAVED',
            fetchedAt: new Date(),
          },
          { transaction },
        );
      }

      const observation = await this.sourceObservationModel.create(
        {
          providerCode: run.providerCode,
          providerVersion: run.providerVersion,
          rawSourceRecordId: rawRecord.id,
          sourceUrl: canonical.observations[0]?.sourceUrl || 'https://transport.wb.gov.in',
          contentHash: `hash_obs_${Date.now()}`,
          confidence: canonical.observations[0]?.confidence || 0.90,
          verificationStatus: 'AUTO_VALIDATED',
          warnings: [],
        },
        { transaction },
      );

      // Stage Nodes
      const stagedNodes = canonical.nodes.map((node: any) => ({
        id: ensureUuidV7(),
        datasetVersionId: datasetVersion.id,
        providerCode: run.providerCode,
        providerExternalId: node.externalId || `node_${node.name}`,
        sourceObservationId: observation.id,
        validationStatus: 'VALIDATED',
        operationalStatus: 'ACTIVE',
        canonicalPayload: node,
      }));
      await this.stagedNodeModel.bulkCreate(stagedNodes, { transaction });

      // Stage Routes & RouteStops
      const stagedRoutes: any[] = [];
      const stagedRouteStops: any[] = [];
      for (const route of canonical.routePatterns) {
        const stagedRouteId = ensureUuidV7();
        stagedRoutes.push({
          id: stagedRouteId,
          datasetVersionId: datasetVersion.id,
          providerCode: run.providerCode,
          providerExternalId: route.externalId || `route_${route.shortName}`,
          sourceObservationId: observation.id,
          validationStatus: 'VALIDATED',
          operationalStatus: route.operationalStatus || 'ACTIVE',
          canonicalPayload: route,
        });

        for (const stop of route.stops) {
          stagedRouteStops.push({
            id: ensureUuidV7(),
            datasetVersionId: datasetVersion.id,
            providerCode: run.providerCode,
            providerExternalId: `${route.externalId}:${stop.sequence}`,
            sourceObservationId: observation.id,
            validationStatus: 'VALIDATED',
            operationalStatus: route.operationalStatus || 'ACTIVE',
            canonicalPayload: {
              routeExternalId: route.externalId,
              stagedRouteId,
              nodeExternalId: stop.nodeExternalId || `node_${stop.name}`,
              ...stop,
            },
          });
        }
      }

      if (stagedRoutes.length > 0) {
        await this.stagedRouteModel.bulkCreate(stagedRoutes, { transaction });
      }
      if (stagedRouteStops.length > 0) {
        await this.stagedRouteStopModel.bulkCreate(stagedRouteStops, { transaction });
      }

      // Stage Trips & StopTimes
      const stagedTrips: any[] = [];
      const stagedStopTimes: any[] = [];
      for (const trip of canonical.trips || []) {
        const stagedTripId = ensureUuidV7();
        stagedTrips.push({
          id: stagedTripId,
          datasetVersionId: datasetVersion.id,
          providerCode: run.providerCode,
          providerExternalId: trip.externalId || `trip_${trip.serviceName}`,
          sourceObservationId: observation.id,
          validationStatus: 'VALIDATED',
          operationalStatus: trip.operationalStatus || 'ACTIVE',
          canonicalPayload: trip,
        });

        for (const st of trip.stopTimes || []) {
          stagedStopTimes.push({
            id: ensureUuidV7(),
            datasetVersionId: datasetVersion.id,
            providerCode: run.providerCode,
            providerExternalId: `${trip.externalId}:${st.sequence}`,
            sourceObservationId: observation.id,
            validationStatus: 'VALIDATED',
            operationalStatus: trip.operationalStatus || 'ACTIVE',
            canonicalPayload: {
              tripExternalId: trip.externalId,
              stagedTripId,
              stopExternalId: st.stopExternalId || `node_${st.stopName}`,
              ...st,
            },
          });
        }
      }

      if (stagedTrips.length > 0) {
        await this.stagedTripModel.bulkCreate(stagedTrips, { transaction });
      }
      if (stagedStopTimes.length > 0) {
        await this.stagedStopTimeModel.bulkCreate(stagedStopTimes, { transaction });
      }

      return {
        datasetVersionId: datasetVersion.id,
        counts: {
          nodes: canonical.nodes.length,
          routes: canonical.routePatterns.length,
          routeStops: stagedRouteStops.length,
          trips: (canonical.trips || []).length,
        },
      };
    });
  }
}
