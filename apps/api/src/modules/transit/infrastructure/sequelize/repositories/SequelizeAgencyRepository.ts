import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Agency } from '../../../domain/entities/Agency';
import { AgencyRepository } from '../../../domain/repositories/AgencyRepository';
import { AgencyModel } from '../models';

@Injectable()
export class SequelizeAgencyRepository implements AgencyRepository {
  constructor(
    @InjectModel(AgencyModel)
    private readonly agencyModel: typeof AgencyModel,
  ) {}

  async findById(id: string): Promise<Agency | null> {
    const model = await this.agencyModel.findByPk(id);
    return model ? this.toDomain(model) : null;
  }

  async findByCode(code: string): Promise<Agency | null> {
    const model = await this.agencyModel.findOne({ where: { code } });
    return model ? this.toDomain(model) : null;
  }

  async save(agency: Agency): Promise<Agency> {
    const [model] = await this.agencyModel.upsert(this.toPersistence(agency), { returning: true });
    return this.toDomain(model);
  }

  private toDomain(model: AgencyModel): Agency {
    return new Agency({
      id: model.id,
      name: model.name,
      code: model.code,
      state: model.state,
      city: model.city,
      country: model.country,
      provider: model.provider,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }

  private toPersistence(agency: Agency) {
    return {
      id: agency.id,
      name: agency.name,
      code: agency.code,
      state: agency.state,
      city: agency.city,
      country: agency.country,
      provider: agency.provider,
    };
  }
}

