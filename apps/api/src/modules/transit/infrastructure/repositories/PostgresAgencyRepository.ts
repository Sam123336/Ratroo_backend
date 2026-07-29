import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgencyRepository } from '../../domain/repositories/AgencyRepository';
import { Agency } from '../../domain/entities/Agency';
import { TypeOrmAgencyEntity } from '../typeorm/entities/typeorm-agency.entity';
import { AgencyMapper } from '../mappers/AgencyMapper';

@Injectable()
export class PostgresAgencyRepository implements AgencyRepository {
  constructor(
    @InjectRepository(TypeOrmAgencyEntity)
    private readonly repo: Repository<TypeOrmAgencyEntity>,
  ) {}

  async findById(id: string): Promise<Agency | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? AgencyMapper.toDomain(entity) : null;
  }

  async findByCode(code: string): Promise<Agency | null> {
    const entity = await this.repo.findOne({ where: { code } });
    return entity ? AgencyMapper.toDomain(entity) : null;
  }

  async save(agency: Agency): Promise<Agency> {
    const persistenceData = AgencyMapper.toPersistence(agency);
    const savedEntity = await this.repo.save(persistenceData);
    return AgencyMapper.toDomain(savedEntity);
  }
}
