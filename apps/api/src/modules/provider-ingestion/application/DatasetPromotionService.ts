import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { DatasetVersionModel, ProviderRunModel } from '../infrastructure/sequelize/models';

@Injectable()
export class DatasetPromotionService {
  constructor(
    @InjectConnection()
    private readonly sequelize: Sequelize,
    @InjectModel(DatasetVersionModel)
    private readonly datasetVersionModel: typeof DatasetVersionModel,
    @InjectModel(ProviderRunModel)
    private readonly providerRunModel: typeof ProviderRunModel,
  ) {}

  async promoteDatasetVersion(id: string) {
    return this.sequelize.transaction(async transaction => {
      const version = await this.datasetVersionModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });

      if (!version) {
        throw new NotFoundException(`Dataset version "${id}" was not found`);
      }

      if (version.status !== 'STAGED') {
        await version.update({ status: 'REJECTED' }, { transaction });
        return {
          id: version.id,
          status: 'REJECTED',
          reason: 'Only STAGED dataset versions can be promoted',
        };
      }

      await this.datasetVersionModel.update(
        { status: 'SUPERSEDED' },
        {
          where: {
            datasetId: version.datasetId,
            status: 'ACTIVE',
          },
          transaction,
        },
      );

      await version.update({ status: 'ACTIVE' }, { transaction });

      return {
        id: version.id,
        status: version.status,
        promoted: true,
      };
    });
  }

  async rejectDatasetVersion(id: string) {
    const version = await this.datasetVersionModel.findByPk(id);

    if (!version) {
      throw new NotFoundException(`Dataset version "${id}" was not found`);
    }

    await version.update({ status: 'REJECTED' });

    return {
      id: version.id,
      status: version.status,
    };
  }

  async enqueueProviderSync(providerCode: string) {
    const run = await this.providerRunModel.create({
      providerCode,
      providerVersion: 'v1',
      status: 'PENDING',
      runType: 'FULL',
      metrics: {},
    });

    return {
      runId: run.id,
      providerCode,
      status: run.status,
      note: 'Run record created. Worker queue dispatch will be connected in the next milestone.',
    };
  }
}

