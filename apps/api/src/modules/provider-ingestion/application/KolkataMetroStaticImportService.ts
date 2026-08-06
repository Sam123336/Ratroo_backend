import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';
import { DatasetPromotionService } from './DatasetPromotionService';
import {
  KolkataMetroCanonicalOutput,
  KolkataMetroRawPage,
  KolkataMetroStaticNetworkDiscovery,
  KolkataMetroStaticNetworkMapper,
  KolkataMetroStaticNetworkParser,
  KolkataMetroStaticNetworkValidator,
  sha256,
} from './kolkata-metro-static-network';
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
} from '../infrastructure/sequelize/models';

interface FetchedKolkataMetroPage {
  sourceKind: string;
  url: string;
  body: string;
  contentHash: string;
  contentType?: string;
  statusCode: number;
  fetchedAt: string;
}

@Injectable()
export class KolkataMetroStaticImportService {
  private readonly discovery = new KolkataMetroStaticNetworkDiscovery();
  private readonly parser = new KolkataMetroStaticNetworkParser();
  private readonly validator = new KolkataMetroStaticNetworkValidator();
  private readonly mapper = new KolkataMetroStaticNetworkMapper();

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
    @InjectModel(ProviderAgencyMappingModel)
    private readonly providerAgencyMappingModel: typeof ProviderAgencyMappingModel,
    private readonly promotion: DatasetPromotionService,
  ) {}

  async importStaticNetwork() {
    const run = await this.providerRunModel.create({
      providerCode: 'KOLKATA_METRO',
      providerVersion: 'v1',
      status: 'DISCOVERING',
      runType: 'FULL',
      metrics: {},
    });

    try {
      const discoveryItems = this.discovery.discover();
      await run.update({ discoveredCount: discoveryItems.length, status: 'FETCHING' });

      const fetchedPages = await Promise.all(
        discoveryItems.map(async item => {
          const page = await this.fetchPage(item.url, item.sourceKind);
          const latest = await this.rawSourceRecordModel.findOne({
            where: {
              providerCode: 'KOLKATA_METRO',
              sourceUrl: item.url,
            },
            order: [['fetchedAt', 'DESC']],
          });

          await this.checkpointModel.create({
            providerRunId: run.id,
            providerCode: 'KOLKATA_METRO',
            externalId: `kolkata-metro-${item.sourceKind.toLowerCase()}`,
            sourceUrl: item.url,
            status: latest?.contentHash === page.contentHash ? 'SKIPPED_UNCHANGED' : 'FETCHED',
            contentHash: page.contentHash,
          });

          if (latest?.contentHash === page.contentHash) {
            return { ...page, rawRecord: latest };
          }

          const rawRecord = await this.rawSourceRecordModel.create({
            providerCode: 'KOLKATA_METRO',
            providerRunId: run.id,
            sourceUrl: item.url,
            contentHash: page.contentHash,
            contentType: page.contentType,
            statusCode: page.statusCode,
            rawPayload: { body: page.body },
            fetchedAt: new Date(page.fetchedAt),
            metadata: {
              sourceKind: item.sourceKind,
              ...(item.metadata || {}),
            },
          });

          return { ...page, rawRecord };
        }),
      );

      await run.update({ fetchedCount: fetchedPages.length, status: 'PARSING' });

      const rawPages: KolkataMetroRawPage[] = fetchedPages.map(page => ({
        sourceKind: page.sourceKind as any,
        url: page.url,
        html: page.body,
        fetchedAt: page.fetchedAt,
        contentHash: page.contentHash,
        rawRecordId: page.rawRecord?.id || '',
      }));

      const parsed = this.parser.parse(rawPages);
      const validation = this.validator.validate(parsed);
      await run.update({
        parsedCount: parsed.lines.reduce((count, line) => count + line.stations.length, 0),
        failedCount: validation.errors.length,
        status: validation.isValid ? 'MAPPING' : 'FAILED',
        errorMessage: validation.errors.join('\n') || undefined,
        metrics: {
          warnings: validation.warnings.length,
        },
      });

      if (!validation.isValid) {
        throw new BadRequestException({ message: 'Kolkata Metro validation failed.', errors: validation.errors });
      }

      const canonical = this.mapper.map(parsed);
      const contentHash = this.canonicalContentHash(canonical);
      const activeVersion = await this.findActiveVersionByContentHash(contentHash);
      if (activeVersion) {
        await run.update({
          status: 'COMPLETED',
          mappedCount: canonical.nodes.length,
          metrics: {
            skippedCanonicalPromotion: true,
            activeDatasetVersionId: activeVersion.id,
            warnings: validation.warnings.length,
          },
        });
        return {
          providerCode: 'KOLKATA_METRO',
          runId: run.id,
          datasetVersionId: activeVersion.id,
          status: 'SKIPPED_UNCHANGED',
          validation,
          counts: {
            lines: canonical.routePatterns.length,
            stations: canonical.nodes.length,
          },
        };
      }

      const staged = await this.stageCanonical(run, canonical, contentHash, validation);
      await run.update({ status: 'PROMOTING', mappedCount: canonical.nodes.length });
      const promoted = await this.promotion.promoteDatasetVersion(staged.datasetVersionId);
      await run.update({
        status: 'COMPLETED',
        metrics: {
          promoted,
          counts: staged.counts,
        },
      });

      return {
        providerCode: 'KOLKATA_METRO',
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

  private async fetchPage(url: string, sourceKind: string): Promise<FetchedKolkataMetroPage> {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'RatrooBot/0.1 Kolkata Metro static-network importer',
      },
    });
    const body = await response.text();

    return {
      sourceKind,
      url,
      body,
      statusCode: response.status,
      contentType: response.headers.get('content-type') || undefined,
      fetchedAt: new Date().toISOString(),
      contentHash: sha256(body),
    };
  }

  private async findActiveVersionByContentHash(contentHash: string) {
    const dataset = await this.datasetModel.findOne({
      where: {
        providerCode: 'KOLKATA_METRO',
        name: 'Kolkata Metro static network',
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
        contentHash,
      },
      order: [['updatedAt', 'DESC']],
    });
  }

  private canonicalContentHash(canonical: KolkataMetroCanonicalOutput) {
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
          metadata: (node as unknown as { metadata?: Record<string, unknown> }).metadata,
        })),
        routePatterns: canonical.routePatterns.map(route => ({
          externalId: route.externalId,
          longName: route.longName,
          shortName: route.shortName,
          providerCode: route.providerCode,
          operationalStatus: route.operationalStatus,
          stops: route.stops.map(stop => ({
            nodeExternalId: stop.nodeExternalId,
            sequence: stop.sequence,
          })),
        })),
      }),
    );
  }

  private async stageCanonical(
    run: ProviderRunModel,
    canonical: KolkataMetroCanonicalOutput,
    contentHash: string,
    validation: { errors: string[]; warnings: string[] },
  ) {
    return this.sequelize.transaction(async transaction => {
      const [dataset] = await this.datasetModel.findOrCreate({
        where: {
          providerCode: 'KOLKATA_METRO',
          name: 'Kolkata Metro static network',
        },
        defaults: {
          providerCode: 'KOLKATA_METRO',
          name: 'Kolkata Metro static network',
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

      const sourceObservations = [];
      for (const observation of canonical.sourceObservations) {
        sourceObservations.push(
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
      const primaryObservationId = sourceObservations[0]?.id;

      if (!primaryObservationId) {
        throw new BadRequestException('No source observation exists.');
      }

      for (const agency of canonical.agencies) {
        const stagedAgency = await this.stagedAgencyModel.create(
          {
            datasetVersionId: datasetVersion.id,
            providerCode: agency.providerCode,
            providerExternalId: agency.externalId,
            sourceObservationId: primaryObservationId,
            validationStatus: 'VALIDATED',
            operationalStatus: 'ACTIVE',
            canonicalPayload: agency,
          },
          { transaction },
        );

        await this.providerAgencyMappingModel.findOrCreate({
          where: {
            providerCode: agency.providerCode,
            providerExternalId: agency.externalId || stagedAgency.id,
          },
          defaults: {
            providerCode: agency.providerCode,
            providerExternalId: agency.externalId || stagedAgency.id,
            resolutionStatus: 'AUTO_RESOLVED',
            confidence: 0.9,
            evidence: {
              sourceObservationId: primaryObservationId,
              datasetVersionId: datasetVersion.id,
            },
          },
          transaction,
        });
      }

      for (const node of canonical.nodes) {
        await this.stagedNodeModel.create(
          {
            datasetVersionId: datasetVersion.id,
            providerCode: node.providerCode,
            providerExternalId: node.externalId,
            sourceObservationId: primaryObservationId,
            validationStatus: 'VALIDATED',
            operationalStatus: 'ACTIVE',
            canonicalPayload: node,
          },
          { transaction },
        );
      }

      for (const route of canonical.routePatterns) {
        const stagedRoute = await this.stagedRouteModel.create(
          {
            datasetVersionId: datasetVersion.id,
            providerCode: route.providerCode,
            providerExternalId: route.externalId,
            sourceObservationId: primaryObservationId,
            validationStatus: 'VALIDATED',
            operationalStatus: route.operationalStatus,
            canonicalPayload: route,
          },
          { transaction },
        );

        for (const stop of route.stops) {
          await this.stagedRouteStopModel.create(
            {
              datasetVersionId: datasetVersion.id,
              providerCode: route.providerCode,
              providerExternalId: `${route.externalId}:${stop.sequence}:${stop.nodeExternalId}`,
              sourceObservationId: primaryObservationId,
              validationStatus: 'VALIDATED',
              operationalStatus: route.operationalStatus,
              canonicalPayload: {
                routeExternalId: route.externalId,
                stagedRouteId: stagedRoute.id,
                ...stop,
              },
            },
            { transaction },
          );
        }
      }

      return {
        datasetVersionId: datasetVersion.id,
        counts: {
          agencies: canonical.agencies.length,
          sourceObservations: sourceObservations.length,
          nodes: canonical.nodes.length,
          routePatterns: canonical.routePatterns.length,
          routeStops: canonical.routePatterns.reduce((count, route) => count + route.stops.length, 0),
        },
      };
    });
  }
}
