import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';
import { DatasetPromotionService } from './DatasetPromotionService';
import {
  GOVERNMENT_BUS_SOURCES,
  GovernmentBusCanonicalOutput,
  GovernmentBusRawPage,
  GovernmentBusStaticMapper,
  GovernmentBusStaticParser,
  GovernmentBusStaticValidator,
  sha256,
  WestBengalGovernmentBusProviderCode,
} from './government-bus-static-network';
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

interface FetchedGovernmentBusPage {
  url: string;
  body: string;
  contentHash: string;
  contentType?: string;
  statusCode: number;
  fetchedAt: string;
  usedFallbackSnapshot?: boolean;
}

@Injectable()
export class GovernmentBusStaticImportService {
  private readonly parser = new GovernmentBusStaticParser();
  private readonly validator = new GovernmentBusStaticValidator();
  private readonly mapper = new GovernmentBusStaticMapper();

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

  async importRoutes(providerCode: WestBengalGovernmentBusProviderCode) {
    const config = GOVERNMENT_BUS_SOURCES[providerCode];
    if (!config) {
      throw new NotFoundException(`Government bus provider "${providerCode}" is not configured.`);
    }

    const run = await this.providerRunModel.create({
      providerCode,
      providerVersion: 'v1',
      status: 'DISCOVERING',
      runType: 'FULL',
      metrics: {},
    });

    try {
      await run.update({ discoveredCount: 1, status: 'FETCHING' });
      const fetched = await this.fetchPageWithFallback(config);
      const latest = await this.rawSourceRecordModel.findOne({
        where: {
          providerCode,
          sourceUrl: config.sourceUrl,
        },
        order: [['fetchedAt', 'DESC']],
      });

      await this.checkpointModel.create({
        providerRunId: run.id,
        providerCode,
        externalId: `${providerCode.toLowerCase()}-routes`,
        sourceUrl: config.sourceUrl,
        status: latest?.contentHash === fetched.contentHash ? 'SKIPPED_UNCHANGED' : 'FETCHED',
        contentHash: fetched.contentHash,
      });

      let rawRecord = latest?.contentHash === fetched.contentHash ? latest : null;
      if (!rawRecord) {
        rawRecord = await this.rawSourceRecordModel.create({
          providerCode,
          providerRunId: run.id,
          sourceUrl: config.sourceUrl,
          contentHash: fetched.contentHash,
          contentType: fetched.contentType,
          statusCode: fetched.statusCode,
          rawPayload: { body: fetched.body },
          fetchedAt: new Date(fetched.fetchedAt),
          metadata: {
            sourceKind: 'ROUTES',
            sourceName: `${config.shortName} official route table`,
            usedFallbackSnapshot: fetched.usedFallbackSnapshot,
          },
        });
      }

      await run.update({ fetchedCount: 1, status: 'PARSING' });
      const parsed = this.parser.parse(config, [
        {
          sourceUrl: config.sourceUrl,
          html: fetched.body,
          fetchedAt: fetched.fetchedAt,
          contentHash: fetched.contentHash,
          rawRecordId: rawRecord.id,
        },
      ]);

      const validation = this.validator.validate(parsed);
      await run.update({
        parsedCount: parsed.routes.length,
        failedCount: validation.errors.length,
        status: validation.isValid ? 'MAPPING' : 'FAILED',
        errorMessage: validation.errors.join('\n') || undefined,
        metrics: {
          warnings: validation.warnings.length,
          skippedUnchanged: latest?.contentHash === fetched.contentHash,
        },
      });

      if (!validation.isValid) {
        throw new BadRequestException({ message: `${config.shortName} validation failed.`, errors: validation.errors });
      }

      const canonical = this.mapper.map(config, parsed);
      const contentHash = this.canonicalContentHash(canonical);
      const activeVersion = await this.findActiveVersionByContentHash(providerCode, contentHash);
      if (activeVersion) {
        await run.update({
          status: 'COMPLETED',
          mappedCount: canonical.routePatterns.length,
          metrics: {
            skippedCanonicalPromotion: true,
            activeDatasetVersionId: activeVersion.id,
            warnings: validation.warnings.length,
          },
        });
        return {
          providerCode,
          runId: run.id,
          datasetVersionId: activeVersion.id,
          status: 'SKIPPED_UNCHANGED',
          validation,
          counts: {
            routes: canonical.routePatterns.length,
            stops: canonical.nodes.length,
            trips: canonical.trips.length,
          },
        };
      }

      const staged = await this.stageCanonical(run, config.agencyName, canonical, contentHash, validation);
      await run.update({ status: 'PROMOTING', mappedCount: canonical.routePatterns.length });
      const promoted = await this.promotion.promoteDatasetVersion(staged.datasetVersionId);
      await run.update({
        status: 'COMPLETED',
        metrics: {
          promoted,
          counts: staged.counts,
        },
      });

      return {
        providerCode,
        runId: run.id,
        datasetVersionId: staged.datasetVersionId,
        status: 'COMPLETED',
        validation,
        counts: staged.counts,
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

  private async fetchPageWithFallback(config: (typeof GOVERNMENT_BUS_SOURCES)[WestBengalGovernmentBusProviderCode]): Promise<FetchedGovernmentBusPage> {
    try {
      return await this.fetchPage(config.sourceUrl, config.providerCode);
    } catch (error) {
      if (!config.fallbackHtml) {
        throw error;
      }
      const fetchedAt = new Date().toISOString();
      return {
        url: config.sourceUrl,
        body: config.fallbackHtml,
        contentHash: sha256(`${config.sourceUrl}|fallback|${config.fallbackHtml}`),
        contentType: 'text/html; charset=utf-8',
        statusCode: 0,
        fetchedAt,
        usedFallbackSnapshot: true,
      };
    }
  }

  private async fetchPage(url: string, providerCode: WestBengalGovernmentBusProviderCode): Promise<FetchedGovernmentBusPage> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.GOVERNMENT_BUS_FETCH_TIMEOUT_MS || 15000));
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'user-agent': `RatrooBot/0.1 ${providerCode} route importer`,
        },
      });
      const body = await response.text();

      return {
        url,
        body,
        contentHash: sha256(body),
        contentType: response.headers.get('content-type') || undefined,
        statusCode: response.status,
        fetchedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async findActiveVersionByContentHash(providerCode: WestBengalGovernmentBusProviderCode, contentHash: string) {
    const dataset = await this.datasetModel.findOne({
      where: { providerCode },
      order: [['updatedAt', 'DESC']],
    });

    if (!dataset) {
      return null;
    }

    return this.datasetVersionModel.findOne({
      where: {
        datasetId: dataset.id,
        status: 'ACTIVE',
        contentHash,
      },
      order: [['updatedAt', 'DESC']],
    });
  }

  private canonicalContentHash(canonical: GovernmentBusCanonicalOutput) {
    return sha256(
      JSON.stringify({
        agencies: canonical.agencies.map(agency => ({
          externalId: agency.externalId,
          name: agency.name,
          providerCode: agency.providerCode,
        })),
        nodes: canonical.nodes.map(node => ({
          externalId: node.externalId,
          name: node.name,
          normalizedName: node.normalizedName,
          providerCode: node.providerCode,
        })),
        routePatterns: canonical.routePatterns.map(route => ({
          externalId: route.externalId,
          longName: route.longName,
          providerCode: route.providerCode,
          stops: route.stops.map(stop => ({
            nodeExternalId: stop.nodeExternalId,
            sequence: stop.sequence,
          })),
        })),
        trips: canonical.trips.map(trip => ({
          externalId: trip.externalId,
          routeExternalId: trip.routeExternalId,
          departureTime: trip.stopTimes[0]?.departureTime,
        })),
      }),
    );
  }

  private async stageCanonical(
    run: ProviderRunModel,
    datasetName: string,
    canonical: GovernmentBusCanonicalOutput,
    contentHash: string,
    validation: { errors: string[]; warnings: string[] },
  ) {
    return this.sequelize.transaction(async transaction => {
      const providerCode = run.providerCode as WestBengalGovernmentBusProviderCode;
      const [dataset] = await this.datasetModel.findOrCreate({
        where: {
          providerCode,
          name: `${datasetName} route network`,
        },
        defaults: {
          providerCode,
          name: `${datasetName} route network`,
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

      await this.bulkCreateInBatches(
        this.stagedAgencyModel,
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
        transaction,
      );

      for (const agency of canonical.agencies) {
        await this.providerAgencyMappingModel.findOrCreate({
          where: {
            providerCode: agency.providerCode,
            providerExternalId: agency.externalId || `${providerCode.toLowerCase()}:agency`,
          },
          defaults: {
            providerCode: agency.providerCode,
            providerExternalId: agency.externalId || `${providerCode.toLowerCase()}:agency`,
            resolutionStatus: 'AUTO_RESOLVED',
            confidence: 0.82,
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
          operationalStatus: 'UNKNOWN',
          canonicalPayload: node,
        })),
        transaction,
      );

      const stagedRoutes = [];
      const stagedRouteStops = [];
      for (const route of canonical.routePatterns) {
        const stagedRouteId = ensureUuidV7();
        stagedRoutes.push({
          id: stagedRouteId,
          datasetVersionId: datasetVersion.id,
          providerCode: route.providerCode,
          providerExternalId: route.externalId,
          sourceObservationId: primaryObservationId,
          validationStatus: 'VALIDATED',
          operationalStatus: route.operationalStatus,
          canonicalPayload: route,
        });

        for (const stop of route.stops) {
          stagedRouteStops.push({
            id: ensureUuidV7(),
            datasetVersionId: datasetVersion.id,
            providerCode: route.providerCode,
            providerExternalId: `${route.externalId}:${stop.sequence}:${stop.nodeExternalId}`,
            sourceObservationId: primaryObservationId,
            validationStatus: 'VALIDATED',
            operationalStatus: route.operationalStatus,
            canonicalPayload: {
              routeExternalId: route.externalId,
              stagedRouteId,
              ...stop,
            },
          });
        }
      }
      await this.bulkCreateInBatches(this.stagedRouteModel, stagedRoutes, transaction);
      await this.bulkCreateInBatches(this.stagedRouteStopModel, stagedRouteStops, transaction);

      const stagedTrips = [];
      const stagedStopTimes = [];
      for (const trip of canonical.trips) {
        const stagedTripId = ensureUuidV7();
        stagedTrips.push({
          id: stagedTripId,
          datasetVersionId: datasetVersion.id,
          providerCode: trip.providerCode,
          providerExternalId: trip.externalId,
          sourceObservationId: primaryObservationId,
          validationStatus: 'VALIDATED',
          operationalStatus: trip.operationalStatus,
          canonicalPayload: trip,
        });

        for (const stopTime of trip.stopTimes) {
          stagedStopTimes.push({
            id: ensureUuidV7(),
            datasetVersionId: datasetVersion.id,
            providerCode: trip.providerCode,
            providerExternalId: `${trip.externalId}:${stopTime.sequence}:${stopTime.stopExternalId}`,
            sourceObservationId: primaryObservationId,
            validationStatus: 'VALIDATED',
            operationalStatus: trip.operationalStatus,
            canonicalPayload: {
              tripExternalId: trip.externalId,
              stagedTripId,
              ...stopTime,
            },
          });
        }
      }
      await this.bulkCreateInBatches(this.stagedTripModel, stagedTrips, transaction);
      await this.bulkCreateInBatches(this.stagedStopTimeModel, stagedStopTimes, transaction);

      return {
        datasetVersionId: datasetVersion.id,
        counts: {
          agencies: canonical.agencies.length,
          sourceObservations: observations.length,
          nodes: canonical.nodes.length,
          routePatterns: canonical.routePatterns.length,
          routeStops: canonical.routePatterns.reduce((sum, route) => sum + route.stops.length, 0),
          trips: canonical.trips.length,
          stopTimes: canonical.trips.reduce((sum, trip) => sum + trip.stopTimes.length, 0),
        },
      };
    });
  }

  private async bulkCreateInBatches(model: any, records: Record<string, unknown>[], transaction: any) {
    const batchSize = Number(process.env.GOVERNMENT_BUS_STAGE_BATCH_SIZE || 1000);

    for (let index = 0; index < records.length; index += batchSize) {
      await model.bulkCreate(records.slice(index, index + batchSize), { transaction });
    }
  }
}
