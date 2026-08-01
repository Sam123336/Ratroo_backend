import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { DatasetPromotionService } from './DatasetPromotionService';
import {
  externalIdFromSourceUrl,
  sha256,
  WBBusCanonicalOutput,
  WBBusDirectoryParser,
  WBBusMapper,
  WBBusParser,
  WBBusValidator,
  wbbusRecordRejectionReason,
} from './wbbus-static-network';
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

interface WBBusFetchedPage {
  url: string;
  body: string;
  contentHash: string;
  contentType?: string;
  statusCode: number;
  fetchedAt: string;
}

interface WBBusRawBusInput {
  url: string;
  body: string;
  contentHash: string;
  rawRecordId: string;
}

@Injectable()
export class WBBusImportService {
  private readonly directoryParser = new WBBusDirectoryParser();
  private readonly busParser = new WBBusParser();
  private readonly validator = new WBBusValidator();
  private readonly mapper = new WBBusMapper();
  private readonly baseUrl = 'https://wbbus.in';

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

  async importAllBuses(options: { maxPages?: number; maxItems?: number } = {}) {
    const maxPages = options.maxPages || Number(process.env.WBBUS_MAX_PAGES || 200);
    const maxItems = options.maxItems || Number(process.env.WBBUS_MAX_ITEMS || 1280);
    const run = await this.providerRunModel.create({
      providerCode: 'WBBUS',
      providerVersion: 'v1',
      status: 'DISCOVERING',
      runType: 'FULL',
      metrics: { maxPages, maxItems },
    });

    try {
      const discovery = await this.discoverBusUrls(run, maxPages, maxItems);
      await run.update({
        status: 'FETCHING',
        discoveredCount: discovery.busUrls.length,
        lastDiscoveryCursor: discovery.lastDiscoveryCursor,
      });

      const rawInputs: WBBusRawBusInput[] = [];
      let fetchedCount = 0;
      let skippedCount = 0;
      let failedFetchCount = 0;
      const fetchFailures: Array<{ url: string; message: string }> = [];
      const maxFetchFailures = Math.max(5, Math.ceil(discovery.busUrls.length * 0.1));

      for (const [index, busUrl] of discovery.busUrls.entries()) {
        let fetched: WBBusFetchedPage;
        const externalId = this.externalIdFromBusUrl(busUrl);
        try {
          fetched = await this.fetchWithRetries(busUrl, 3);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failedFetchCount++;
          fetchFailures.push({ url: busUrl, message });
          await this.checkpointModel.create({
            providerRunId: run.id,
            providerCode: 'WBBUS',
            externalId,
            sourceUrl: busUrl,
            status: 'FETCH_FAILED',
            errorMessage: message,
          });
          await run.update({
            fetchedCount: rawInputs.length,
            failedCount: failedFetchCount,
            lastProcessedExternalId: externalId,
            metrics: {
              maxPages,
              maxItems,
              discoveredBuses: discovery.busUrls.length,
              skippedCount,
              fetchFailureCount: failedFetchCount,
              latestFetchFailure: { url: busUrl, message },
            },
          });

          if (failedFetchCount > maxFetchFailures) {
            throw new Error(`WBBus fetch failure threshold exceeded: ${failedFetchCount}/${discovery.busUrls.length}`);
          }

          continue;
        }

        const latest = await this.findLatestRaw(busUrl);
        const unchanged = latest?.contentHash === fetched.contentHash;

        await this.checkpointModel.create({
          providerRunId: run.id,
          providerCode: 'WBBUS',
          externalId,
          sourceUrl: busUrl,
          status: unchanged ? 'SKIPPED_UNCHANGED' : 'FETCHED',
          contentHash: fetched.contentHash,
        });

        if (unchanged && latest) {
          skippedCount++;
          rawInputs.push({
            url: busUrl,
            body: String((latest.rawPayload as { body?: string }).body || ''),
            contentHash: latest.contentHash,
            rawRecordId: latest.id,
          });
          continue;
        }

        const rawRecord = await this.rawSourceRecordModel.create({
          providerCode: 'WBBUS',
          providerRunId: run.id,
          sourceUrl: busUrl,
          contentHash: fetched.contentHash,
          contentType: fetched.contentType,
          statusCode: fetched.statusCode,
          rawPayload: { body: fetched.body },
          metadata: {
            sourceKind: 'BUS_DETAIL',
          },
          status: 'RAW_SAVED',
          fetchedAt: new Date(fetched.fetchedAt),
        });

        fetchedCount++;
        rawInputs.push({
          url: busUrl,
          body: fetched.body,
          contentHash: fetched.contentHash,
          rawRecordId: rawRecord.id,
        });

        if ((index + 1) % 25 === 0 || index === discovery.busUrls.length - 1) {
          await run.update({
            fetchedCount: rawInputs.length,
            failedCount: failedFetchCount,
            lastProcessedExternalId: externalId,
            metrics: {
              maxPages,
              maxItems,
              discoveredBuses: discovery.busUrls.length,
              skippedCount,
              fetchFailureCount: failedFetchCount,
              fetchFailures: fetchFailures.slice(-5),
            },
          });
        }
      }

      if (!rawInputs.length) {
        throw new Error('WBBus import produced no fetchable bus detail pages.');
      }

      if (rawInputs.length && fetchedCount === 0 && failedFetchCount === 0) {
        await run.update({
          status: 'SKIPPED_UNCHANGED',
          fetchedCount: rawInputs.length,
          parsedCount: 0,
          metrics: {
            maxPages,
            maxItems,
            discoveredBuses: discovery.busUrls.length,
            skippedCount,
            skippedReason: 'All WBBus detail page hashes match the latest raw source records.',
          },
        });

        return {
          providerCode: 'WBBUS',
          runId: run.id,
          status: 'SKIPPED_UNCHANGED',
          discoveredBuses: discovery.busUrls.length,
          skippedCount,
        };
      }

      await run.update({ status: 'PARSING', fetchedCount: rawInputs.length, failedCount: failedFetchCount });

      const parsedRecords = rawInputs.map(input =>
        this.busParser.parseBusHtml(input.url, input.body, input.rawRecordId, input.contentHash),
      );
      const rejectedRecords: Array<{ sourceUrl: string; reason: string }> = [];
      const parsed = [];
      for (const record of parsedRecords) {
        const rejectionReason = wbbusRecordRejectionReason(record);
        if (rejectionReason) {
          rejectedRecords.push({ sourceUrl: record.sourceUrl, reason: rejectionReason });
          await this.checkpointModel.create({
            providerRunId: run.id,
            providerCode: 'WBBUS',
            externalId: this.externalIdFromBusUrl(record.sourceUrl),
            sourceUrl: record.sourceUrl,
            status: 'REJECTED_INVALID_RECORD',
            contentHash: record.contentHash,
            errorMessage: rejectionReason,
          });
          continue;
        }

        parsed.push(record);
      }
      const validation = this.validator.validate(parsed);

      if (!validation.isValid) {
        await run.update({
          status: 'FAILED',
          parsedCount: parsed.length,
          failedCount: validation.errors.length,
          errorMessage: validation.errors.join(' | '),
          metrics: { validation },
        });
        throw new BadRequestException({
          message: 'WBBus import validation failed before staging.',
          errors: validation.errors,
          warnings: validation.warnings,
        });
      }

      const canonical = this.mapper.map(parsed);
      const datasetHash = sha256(rawInputs.map(input => input.contentHash).sort().join('|'));
      await run.update({ status: 'STAGING', parsedCount: parsed.length, failedCount: failedFetchCount + rejectedRecords.length });

      const staged = await this.stageCanonical(run, canonical, datasetHash, validation);
      const promoted = await this.promotion.promoteDatasetVersion(staged.datasetVersionId);

      await run.update({
        status: 'COMPLETED',
        metrics: {
          maxPages,
          maxItems,
          discoveredBuses: discovery.busUrls.length,
          skippedCount,
          fetchFailureCount: failedFetchCount,
          fetchFailures: fetchFailures.slice(-20),
          rejectedRecordCount: rejectedRecords.length,
          rejectedRecords: rejectedRecords.slice(-20),
          validation,
          datasetVersionId: staged.datasetVersionId,
          promoted,
          counts: staged.counts,
        },
      });

      return {
        providerCode: 'WBBUS',
        runId: run.id,
        datasetVersionId: staged.datasetVersionId,
        status: 'COMPLETED',
        discoveredBuses: discovery.busUrls.length,
        skippedCount,
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

  private async discoverBusUrls(run: ProviderRunModel, maxPages: number, maxItems: number) {
    const busUrls = new Set<string>();
    const visitedPages = new Set<string>();
    let pageUrl = `${this.baseUrl}/allbus`;
    let pageNumber = 1;
    let lastDiscoveryCursor = pageUrl;

    while (pageUrl && pageNumber <= maxPages && busUrls.size < maxItems) {
      if (visitedPages.has(pageUrl)) {
        break;
      }

      visitedPages.add(pageUrl);
      const fetched = await this.fetchWithRetries(pageUrl, 3);
      const latest = await this.findLatestRaw(pageUrl);
      const unchanged = latest?.contentHash === fetched.contentHash;
      await this.checkpointModel.create({
        providerRunId: run.id,
        providerCode: 'WBBUS',
        externalId: `directory-page-${pageNumber}`,
        sourceUrl: pageUrl,
        status: unchanged ? 'SKIPPED_UNCHANGED' : 'FETCHED',
        contentHash: fetched.contentHash,
      });

      if (!unchanged) {
        await this.rawSourceRecordModel.create({
          providerCode: 'WBBUS',
          providerRunId: run.id,
          sourceUrl: pageUrl,
          contentHash: fetched.contentHash,
          contentType: fetched.contentType,
          statusCode: fetched.statusCode,
          rawPayload: { body: fetched.body },
          metadata: {
            sourceKind: 'DIRECTORY_PAGE',
            pageNumber,
          },
          status: 'RAW_SAVED',
          fetchedAt: new Date(fetched.fetchedAt),
        });
      }

      const directory = this.directoryParser.discoverBusLinks(pageUrl, fetched.body);
      for (const busUrl of directory.busUrls) {
        if (busUrls.size >= maxItems) {
          break;
        }
        busUrls.add(busUrl);
      }

      lastDiscoveryCursor = pageUrl;
      pageUrl = directory.nextPageUrl;
      pageNumber++;
      await this.sleep(750);
    }

    return {
      busUrls: Array.from(busUrls),
      lastDiscoveryCursor,
    };
  }

  private async fetchWithRetries(url: string, retries: number): Promise<WBBusFetchedPage> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'user-agent': 'YatrooBot/0.1 WBBus importer',
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
      } catch (error) {
        lastError = error;
        await this.sleep(attempt * 1000);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
  }

  private async stageCanonical(
    run: ProviderRunModel,
    canonical: WBBusCanonicalOutput,
    contentHash: string,
    validation: { errors: string[]; warnings: string[] },
  ) {
    return this.sequelize.transaction(async transaction => {
      const [dataset] = await this.datasetModel.findOrCreate({
        where: {
          providerCode: 'WBBUS',
          name: 'WBBus private bus network',
        },
        defaults: {
          providerCode: 'WBBUS',
          name: 'WBBus private bus network',
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
      const observationIdByRawRecordId = new Map(observations.map(observation => [observation.rawSourceRecordId, observation.id]));
      const primaryObservationId = observations[0]?.id;

      if (!primaryObservationId) {
        throw new BadRequestException('No source observation exists.');
      }

      const stagedAgencies = canonical.agencies.map(agency => ({
        id: ensureUuidV7(),
        datasetVersionId: datasetVersion.id,
        providerCode: agency.providerCode,
        providerExternalId: agency.externalId,
        sourceObservationId: primaryObservationId,
        validationStatus: 'VALIDATED',
        operationalStatus: 'ACTIVE',
        canonicalPayload: agency,
      }));
      await this.bulkCreateInBatches(this.stagedAgencyModel, stagedAgencies, transaction);

      for (const agency of canonical.agencies) {
        await this.providerAgencyMappingModel.findOrCreate({
          where: {
            providerCode: agency.providerCode,
            providerExternalId: agency.externalId || 'wbbus:agency',
          },
          defaults: {
            providerCode: agency.providerCode,
            providerExternalId: agency.externalId || 'wbbus:agency',
            resolutionStatus: 'AUTO_RESOLVED',
            confidence: 0.7,
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

      const sourceObservationIdByRouteExternalId = new Map<string, string>();
      for (const observation of canonical.sourceObservations) {
        const routeKey = this.externalIdFromBusUrl(observation.sourceUrl);
        const observationId = observationIdByRawRecordId.get(observation.rawRecordId) || primaryObservationId;
        sourceObservationIdByRouteExternalId.set(`${routeKey}:up`, observationId);
        sourceObservationIdByRouteExternalId.set(`${routeKey}:down`, observationId);
      }

      const stagedRoutes = [];
      const stagedRouteStops = [];
      for (const route of canonical.routePatterns) {
        const sourceObservationId = sourceObservationIdByRouteExternalId.get(route.externalId) || primaryObservationId;
        const stagedRouteId = ensureUuidV7();
        stagedRoutes.push({
          id: stagedRouteId,
          datasetVersionId: datasetVersion.id,
          providerCode: route.providerCode,
          providerExternalId: route.externalId,
          sourceObservationId,
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
            sourceObservationId,
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
        const sourceObservationId = sourceObservationIdByRouteExternalId.get(trip.routeExternalId || '') || primaryObservationId;
        const stagedTripId = ensureUuidV7();
        stagedTrips.push({
          id: stagedTripId,
          datasetVersionId: datasetVersion.id,
          providerCode: trip.providerCode,
          providerExternalId: trip.externalId,
          sourceObservationId,
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
            sourceObservationId,
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
    const batchSize = Number(process.env.WBBUS_STAGE_BATCH_SIZE || 1000);

    for (let index = 0; index < records.length; index += batchSize) {
      await model.bulkCreate(records.slice(index, index + batchSize), { transaction });
    }
  }

  private findLatestRaw(sourceUrl: string) {
    return this.rawSourceRecordModel.findOne({
      where: {
        providerCode: 'WBBUS',
        sourceUrl,
      },
      order: [['fetchedAt', 'DESC']],
    });
  }

  private externalIdFromBusUrl(url: string): string {
    return externalIdFromSourceUrl(url);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
