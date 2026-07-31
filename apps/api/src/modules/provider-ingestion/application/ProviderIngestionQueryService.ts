import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  CanonicalConflictModel,
  DatasetVersionModel,
  ProviderRunModel,
  SourceObservationModel,
} from '../infrastructure/sequelize/models';

@Injectable()
export class ProviderIngestionQueryService {
  constructor(
    @InjectModel(ProviderRunModel)
    private readonly providerRunModel: typeof ProviderRunModel,
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

    return {
      runId: run.id,
      providerCode: run.providerCode,
      status: run.status,
      checkpoint: {
        lastDiscoveryCursor: run.lastDiscoveryCursor,
        discoveredCount: run.discoveredCount,
        fetchedCount: run.fetchedCount,
        parsedCount: run.parsedCount,
        failedCount: run.failedCount,
        lastProcessedExternalId: run.lastProcessedExternalId,
      },
      metrics: run.metrics,
      errorMessage: run.errorMessage,
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
}

