import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  CanonicalConflictModel,
  DatasetModel,
  DatasetVersionModel,
  ProviderItemCheckpointModel,
  ProviderRunModel,
  RawSourceRecordModel,
  SourceObservationModel,
} from '../infrastructure/sequelize/models';

@Injectable()
export class ProviderIngestionQueryService {
  constructor(
    @InjectModel(ProviderRunModel)
    private readonly providerRunModel: typeof ProviderRunModel,
    @InjectModel(ProviderItemCheckpointModel)
    private readonly providerItemCheckpointModel: typeof ProviderItemCheckpointModel,
    @InjectModel(RawSourceRecordModel)
    private readonly rawSourceRecordModel: typeof RawSourceRecordModel,
    @InjectModel(DatasetModel)
    private readonly datasetModel: typeof DatasetModel,
    @InjectModel(DatasetVersionModel)
    private readonly datasetVersionModel: typeof DatasetVersionModel,
    @InjectModel(SourceObservationModel)
    private readonly sourceObservationModel: typeof SourceObservationModel,
    @InjectModel(CanonicalConflictModel)
    private readonly canonicalConflictModel: typeof CanonicalConflictModel,
  ) {}

  listProviderRuns() {
    return this.providerRunModel.findAll({ order: [['createdAt', 'DESC']], limit: 100 });
  }

  async getProviderRun(id: string) {
    const run = await this.providerRunModel.findByPk(id);

    if (!run) {
      throw new NotFoundException(`Provider run "${id}" was not found`);
    }

    return run;
  }

  async getProviderRunReport(id: string) {
    const run = await this.getProviderRun(id);
    const checkpoints = await this.providerItemCheckpointModel.findAll({
      where: { providerRunId: run.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    const rejected = checkpoints.filter(checkpoint => checkpoint.status === 'FAILED' || checkpoint.status === 'REJECTED');

    return {
      runId: run.id,
      providerCode: run.providerCode,
      status: run.status,
      progress: this.progressForRun(run),
      checkpoint: {
        lastDiscoveryCursor: run.lastDiscoveryCursor,
        discoveredCount: run.discoveredCount,
        fetchedCount: run.fetchedCount,
        parsedCount: run.parsedCount,
        failedCount: run.failedCount,
        lastProcessedExternalId: run.lastProcessedExternalId,
      },
      metrics: run.metrics,
      recentCheckpoints: checkpoints.map(checkpoint => ({
        id: checkpoint.id,
        externalId: checkpoint.externalId,
        sourceUrl: checkpoint.sourceUrl,
        status: checkpoint.status,
        contentHash: checkpoint.contentHash,
        errorMessage: checkpoint.errorMessage,
        updatedAt: checkpoint.updatedAt,
      })),
      rejected,
      errorMessage: run.errorMessage,
    };
  }

  async getDeveloperDashboard() {
    const [runs, datasets, versions, rawCount, conflicts] = await Promise.all([
      this.providerRunModel.findAll({ order: [['createdAt', 'DESC']], limit: 20 }),
      this.datasetModel.findAll({ order: [['updatedAt', 'DESC']], limit: 20 }),
      this.datasetVersionModel.findAll({ order: [['updatedAt', 'DESC']], limit: 50 }),
      this.rawSourceRecordModel.count(),
      this.canonicalConflictModel.findAll({ order: [['createdAt', 'DESC']], limit: 20 }),
    ]);

    const versionsByDatasetId = new Map<string, DatasetVersionModel[]>();
    for (const version of versions) {
      const datasetVersions = versionsByDatasetId.get(version.datasetId) || [];
      datasetVersions.push(version);
      versionsByDatasetId.set(version.datasetId, datasetVersions);
    }

    return {
      providers: this.providerSummaries(runs),
      runs: runs.map(run => ({
        id: run.id,
        providerCode: run.providerCode,
        providerVersion: run.providerVersion,
        status: run.status,
        progress: this.progressForRun(run),
        discoveredCount: run.discoveredCount,
        fetchedCount: run.fetchedCount,
        parsedCount: run.parsedCount,
        failedCount: run.failedCount,
        errorMessage: run.errorMessage,
        updatedAt: run.updatedAt,
      })),
      datasets: datasets.map(dataset => ({
        id: dataset.id,
        providerCode: dataset.providerCode,
        name: dataset.name,
        status: dataset.status,
        versions: (versionsByDatasetId.get(dataset.id) || []).map(version => ({
          id: version.id,
          status: version.status,
          contentHash: version.contentHash,
          validationSummary: version.validationSummary,
          updatedAt: version.updatedAt,
        })),
      })),
      totals: {
        rawSourceRecords: rawCount,
        openConflicts: conflicts.length,
      },
      conflicts,
    };
  }

  listDatasetVersions() {
    return this.datasetVersionModel.findAll({ order: [['createdAt', 'DESC']], limit: 100 });
  }

  async getDatasetVersion(id: string) {
    const version = await this.datasetVersionModel.findByPk(id);

    if (!version) {
      throw new NotFoundException(`Dataset version "${id}" was not found`);
    }

    return version;
  }

  async getSourceObservation(id: string) {
    const observation = await this.sourceObservationModel.findByPk(id);

    if (!observation) {
      throw new NotFoundException(`Source observation "${id}" was not found`);
    }

    return observation;
  }

  listCanonicalConflicts() {
    return this.canonicalConflictModel.findAll({ order: [['createdAt', 'DESC']], limit: 100 });
  }

  private providerSummaries(runs: ProviderRunModel[]) {
    const summaries = new Map<string, { providerCode: string; latestStatus: string; running: number; failed: number; completed: number }>();

    for (const run of runs) {
      const summary =
        summaries.get(run.providerCode) ||
        {
          providerCode: run.providerCode,
          latestStatus: run.status,
          running: 0,
          failed: 0,
          completed: 0,
        };

      if (['DISCOVERING', 'FETCHING', 'RAW', 'PARSING', 'VALIDATING', 'MAPPING', 'STAGING', 'PROMOTING', 'RUNNING'].includes(run.status)) {
        summary.running++;
      }
      if (run.status === 'FAILED') {
        summary.failed++;
      }
      if (['COMPLETED', 'ACTIVE', 'PROMOTED'].includes(run.status)) {
        summary.completed++;
      }

      summaries.set(run.providerCode, summary);
    }

    return Array.from(summaries.values());
  }

  private progressForRun(run: ProviderRunModel) {
    const discovered = Math.max(run.discoveredCount || 0, 0);
    const fetched = Math.max(run.fetchedCount || 0, 0);
    const parsed = Math.max(run.parsedCount || 0, 0);
    const failed = Math.max(run.failedCount || 0, 0);
    const denominator = Math.max(discovered, fetched, parsed, failed, 1);

    return {
      discovered,
      fetched,
      parsed,
      failed,
      percent: Math.min(100, Math.round(((parsed + failed) / denominator) * 100)),
    };
  }
}
