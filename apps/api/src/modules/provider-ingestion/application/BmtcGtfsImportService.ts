import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { BmtcGtfsCanonicalOutput, BmtcGtfsParser, BmtcGtfsValidator, sha256 } from './bmtc-gtfs-network';
import { DatasetPromotionService } from './DatasetPromotionService';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';
import {
  DatasetModel,
  DatasetVersionModel,
  ProviderAgencyMappingModel,
  ProviderItemCheckpointModel,
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

@Injectable()
export class BmtcGtfsImportService {
  private readonly parser = new BmtcGtfsParser();
  private readonly validator = new BmtcGtfsValidator();

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
    @InjectModel(StagedAgencyModel)
    private readonly stagedAgencyModel: typeof StagedAgencyModel,
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
    @InjectModel(ProviderAgencyMappingModel)
    private readonly providerAgencyMappingModel: typeof ProviderAgencyMappingModel,
    private readonly promotion: DatasetPromotionService,
  ) {}

  async importGtfsFeed(options: { url?: string; maxRoutePatterns?: number } = {}) {
    const sourceUrl =
      options.url ||
      process.env.BMTC_GTFS_URL ||
      'https://github.com/Vonter/bmtc-gtfs/raw/refs/heads/main/gtfs/bmtc.zip';
    const run = await this.providerRunModel.create({
      providerCode: 'BMTC_OFFICIAL',
      providerVersion: 'v1',
      status: 'DISCOVERING',
      runType: 'FULL',
      metrics: { sourceUrl, maxRoutePatterns: options.maxRoutePatterns },
    });

    try {
      await run.update({ status: 'FETCHING', discoveredCount: 1 });
      const fetched = await this.fetchFeed(sourceUrl);
      const latest = await this.rawSourceRecordModel.findOne({
        where: {
          providerCode: 'BMTC_OFFICIAL',
          sourceUrl,
        },
        attributes: ['id', 'contentHash', 'sourceUrl', 'fetchedAt'],
        order: [['fetchedAt', 'DESC']],
      });
      const unchanged = latest?.contentHash === fetched.contentHash;
      const activeDatasetVersion = await this.getActiveDatasetVersion();

      await this.checkpointModel.create({
        providerRunId: run.id,
        providerCode: 'BMTC_OFFICIAL',
        externalId: 'bmtc-gtfs-feed',
        sourceUrl,
        status: unchanged ? 'SKIPPED_UNCHANGED' : 'FETCHED',
        contentHash: fetched.contentHash,
      });

      if (unchanged && latest && activeDatasetVersion) {
        await run.update({
          status: 'SKIPPED_UNCHANGED',
          fetchedCount: 0,
          parsedCount: 0,
          metrics: {
            sourceUrl,
            skippedReason: 'BMTC GTFS feed hash matches the latest raw source record.',
          },
        });

        return {
          providerCode: 'BMTC_OFFICIAL',
          runId: run.id,
          status: 'SKIPPED_UNCHANGED',
          sourceUrl,
        };
      }

      const rawRecord =
        unchanged && latest
          ? latest
          : await this.rawSourceRecordModel.create({
              providerCode: 'BMTC_OFFICIAL',
              providerRunId: run.id,
              sourceUrl,
              contentHash: fetched.contentHash,
              contentType: fetched.contentType,
              statusCode: fetched.statusCode,
              rawPayload: {
                encoding: 'base64',
                bodyBase64: fetched.buffer.toString('base64'),
              },
              metadata: {
                sourceKind: 'GTFS_SCHEDULE',
                sourceConfidence: 'COMMUNITY_DERIVED',
              },
              status: 'RAW_SAVED',
              fetchedAt: new Date(fetched.fetchedAt),
            });

      await run.update({ status: 'PARSING', fetchedCount: 1 });
      const includeTrips = this.includeTrips();
      const canonical = this.parser.parse(
        {
          ...fetched,
          rawRecordId: rawRecord.id,
        },
        {
          includeTrips,
          maxRoutePatterns: options.maxRoutePatterns || this.maxRoutePatterns(),
        },
      );
      const validation = this.validator.validate(canonical);

      if (!validation.isValid) {
        await run.update({
          status: 'FAILED',
          parsedCount: canonical.routePatterns.length,
          failedCount: validation.errors.length,
          errorMessage: validation.errors.join(' | '),
          metrics: { sourceUrl, validation },
        });
        throw new BadRequestException({
          message: 'BMTC GTFS import validation failed before staging.',
          errors: validation.errors,
          warnings: validation.warnings,
        });
      }

      await run.update({ status: 'STAGING', parsedCount: canonical.routePatterns.length });
      const staged = await this.stageCanonical(run, canonical, fetched.contentHash, validation);
      const promoted = await this.promotion.promoteDatasetVersion(staged.datasetVersionId);

      await run.update({
        status: 'COMPLETED',
        metrics: {
          sourceUrl,
          includeTrips,
          maxRoutePatterns: options.maxRoutePatterns || this.maxRoutePatterns(),
          validation,
          datasetVersionId: staged.datasetVersionId,
          promoted,
          counts: staged.counts,
        },
      });

      return {
        providerCode: 'BMTC_OFFICIAL',
        runId: run.id,
        datasetVersionId: staged.datasetVersionId,
        status: 'COMPLETED',
        sourceUrl,
        includeTrips,
        maxRoutePatterns: options.maxRoutePatterns || this.maxRoutePatterns(),
        counts: staged.counts,
        validation,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await run.update({
        status: 'FAILED',
        failedCount: run.failedCount + 1,
        errorMessage: message,
      });
      throw error;
    }
  }

  private async fetchFeed(url: string) {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'RatrooBot/0.1 BMTC GTFS importer',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch BMTC GTFS feed ${url}: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      url,
      buffer,
      contentHash: sha256(buffer),
      contentType: response.headers.get('content-type') || undefined,
      statusCode: response.status,
      fetchedAt: new Date().toISOString(),
    };
  }

  private async getActiveDatasetVersion() {
    const dataset = await this.datasetModel.findOne({
      where: {
        providerCode: 'BMTC_OFFICIAL',
        name: 'BMTC GTFS bus network',
      },
      order: [['updatedAt', 'DESC']],
    });

    if (!dataset) {
      return null;
    }

    return this.datasetVersionModel.findOne({
      where: {
        datasetId: dataset.id,
        status: 'ACTIVE',
      },
      order: [['updatedAt', 'DESC']],
    });
  }

  private async stageCanonical(
    run: ProviderRunModel,
    canonical: BmtcGtfsCanonicalOutput,
    contentHash: string,
    validation: { errors: string[]; warnings: string[] },
  ) {
    return this.sequelize.transaction(async transaction => {
      const [dataset] = await this.datasetModel.findOrCreate({
        where: {
          providerCode: 'BMTC_OFFICIAL',
          name: 'BMTC GTFS bus network',
        },
        defaults: {
          providerCode: 'BMTC_OFFICIAL',
          name: 'BMTC GTFS bus network',
          status: 'ACTIVE',
        },
        transaction,
      });

      const datasetVersion = await this.datasetVersionModel.create(
        {
          datasetId: dataset.id,
          providerRunId: run.id,
          contentHash,
          validationSummary: validation,
          status: 'STAGED',
        },
        { transaction },
      );

      const observations = [];
      for (const observation of canonical.sourceObservations) {
        observations.push(
          await this.sourceObservationModel.create(
            {
              providerCode: observation.providerCode,
              providerVersion: observation.providerVersion,
              rawSourceRecordId: observation.rawRecordId,
              sourceUrl: observation.sourceUrl,
              contentHash: observation.contentHash,
              confidence: observation.confidence,
              verificationStatus: observation.verificationStatus,
              warnings: observation.warnings,
            },
            { transaction },
          ),
        );
      }
      const primaryObservationId = observations[0]?.id;

      if (!primaryObservationId) {
        throw new BadRequestException('No source observation exists.');
      }

      await this.stagedAgencyModel.bulkCreate(
        canonical.agencies.map(agency => ({
          id: ensureUuidV7(),
          datasetVersionId: datasetVersion.id,
          providerCode: agency.providerCode,
          providerExternalId: agency.externalId,
          sourceObservationId: primaryObservationId,
          validationStatus: 'VALIDATED',
          operationalStatus: 'ACTIVE',
          canonicalPayload: agency,
        })),
        { transaction },
      );

      for (const agency of canonical.agencies) {
        await this.providerAgencyMappingModel.findOrCreate({
          where: {
            providerCode: agency.providerCode,
            providerExternalId: agency.externalId || 'bmtc:agency:bmtc',
          },
          defaults: {
            providerCode: agency.providerCode,
            providerExternalId: agency.externalId || 'bmtc:agency:bmtc',
            resolutionStatus: 'AUTO_RESOLVED',
            confidence: 0.78,
            evidence: {
              sourceObservationId: primaryObservationId,
              datasetVersionId: datasetVersion.id,
            },
          },
          transaction,
        });
      }

      await this.bulkCreateInBatches(
        this.stagedNodeModel,
        canonical.nodes.map(node => ({
          id: ensureUuidV7(),
          datasetVersionId: datasetVersion.id,
          providerCode: node.providerCode,
          providerExternalId: node.externalId,
          sourceObservationId: primaryObservationId,
          validationStatus: 'VALIDATED',
          operationalStatus: 'ACTIVE',
          canonicalPayload: node,
        })),
        transaction,
      );

      await this.bulkCreateInBatches(
        this.stagedRouteModel,
        canonical.routePatterns.map(route => ({
          id: ensureUuidV7(),
          datasetVersionId: datasetVersion.id,
          providerCode: route.providerCode,
          providerExternalId: route.externalId,
          sourceObservationId: primaryObservationId,
          validationStatus: 'VALIDATED',
          operationalStatus: route.operationalStatus,
          canonicalPayload: {
            ...route,
            stops: undefined,
          },
        })),
        transaction,
      );

      const routeStops = canonical.routePatterns.flatMap(route =>
        route.stops.map(stop => ({
          id: ensureUuidV7(),
          datasetVersionId: datasetVersion.id,
          providerCode: route.providerCode,
          providerExternalId: `${route.externalId}:${stop.sequence}:${stop.nodeExternalId}`,
          sourceObservationId: primaryObservationId,
          validationStatus: 'VALIDATED',
          operationalStatus: route.operationalStatus,
          canonicalPayload: {
            routeExternalId: route.externalId,
            ...stop,
          },
        })),
      );
      await this.bulkCreateInBatches(this.stagedRouteStopModel, routeStops, transaction);

      await this.bulkCreateInBatches(
        this.stagedTripModel,
        canonical.trips.map(trip => ({
          id: ensureUuidV7(),
          datasetVersionId: datasetVersion.id,
          providerCode: trip.providerCode,
          providerExternalId: trip.externalId,
          sourceObservationId: primaryObservationId,
          validationStatus: 'VALIDATED',
          operationalStatus: trip.operationalStatus,
          canonicalPayload: trip,
        })),
        transaction,
      );

      const stopTimes = canonical.trips.flatMap(trip =>
        trip.stopTimes.map(stopTime => ({
          id: ensureUuidV7(),
          datasetVersionId: datasetVersion.id,
          providerCode: trip.providerCode,
          providerExternalId: `${trip.externalId}:${stopTime.sequence}:${stopTime.stopExternalId}`,
          sourceObservationId: primaryObservationId,
          validationStatus: 'VALIDATED',
          operationalStatus: trip.operationalStatus,
          canonicalPayload: {
            tripExternalId: trip.externalId,
            ...stopTime,
          },
        })),
      );
      await this.bulkCreateInBatches(this.stagedStopTimeModel, stopTimes, transaction);

      return {
        datasetVersionId: datasetVersion.id,
        counts: {
          agencies: canonical.agencies.length,
          sourceObservations: observations.length,
          nodes: canonical.nodes.length,
          routePatterns: canonical.routePatterns.length,
          routeStops: routeStops.length,
          trips: canonical.trips.length,
          stopTimes: stopTimes.length,
        },
      };
    });
  }

  private async bulkCreateInBatches(model: any, records: Record<string, unknown>[], transaction: any) {
    const batchSize = Number(process.env.BMTC_GTFS_STAGE_BATCH_SIZE || 1000);

    for (let index = 0; index < records.length; index += batchSize) {
      await model.bulkCreate(records.slice(index, index + batchSize), { transaction });
    }
  }

  private includeTrips() {
    return ['true', '1', 'yes', 'on'].includes(String(process.env.BMTC_GTFS_INCLUDE_TRIPS || 'false').toLowerCase());
  }

  private maxRoutePatterns() {
    const parsed = Number(process.env.BMTC_GTFS_MAX_ROUTE_PATTERNS || 0);

    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }
}
