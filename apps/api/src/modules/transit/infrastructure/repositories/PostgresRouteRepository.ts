import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RouteRepository } from '../../domain/repositories/RouteRepository';
import { Route } from '../../domain/entities/Route';
import { TypeOrmRouteEntity } from '../typeorm/entities/typeorm-route.entity';
import { RouteMapper } from '../mappers/RouteMapper';

@Injectable()
export class PostgresRouteRepository implements RouteRepository {
  constructor(
    @InjectRepository(TypeOrmRouteEntity)
    private readonly repo: Repository<TypeOrmRouteEntity>,
  ) {}

  async findById(id: string): Promise<Route | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? RouteMapper.toDomain(entity) : null;
  }

  async findByExternalId(externalId: string): Promise<Route | null> {
    const entity = await this.repo.findOne({ where: { externalId } });
    return entity ? RouteMapper.toDomain(entity) : null;
  }

  async findAll(page = 1, limit = 50, search?: string): Promise<{ items: Route[]; total: number }> {
    const qb = this.repo.createQueryBuilder('route');
    if (search) {
      qb.where('route.longName ILIKE :search OR route.shortName ILIKE :search', {
        search: `%${search}%`,
      });
    }
    qb.skip((page - 1) * limit).take(limit);

    const [entities, total] = await qb.getManyAndCount();
    return {
      items: entities.map(RouteMapper.toDomain),
      total,
    };
  }

  async save(route: Route): Promise<Route> {
    const persistenceData = RouteMapper.toPersistence(route);
    const savedEntity = await this.repo.save(persistenceData);
    return RouteMapper.toDomain(savedEntity);
  }
}
