import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  StopRepository,
  NearbyStopResult,
  TransitQueryScope,
} from '../../domain/repositories/StopRepository';
import { Stop } from '../../domain/entities/Stop';
import { Coordinates } from '../../domain/value-objects/Coordinates';
import { TypeOrmStopEntity } from '../typeorm/entities/typeorm-stop.entity';
import { StopMapper } from '../mappers/StopMapper';

@Injectable()
export class PostgresStopRepository implements StopRepository {
  constructor(
    @InjectRepository(TypeOrmStopEntity)
    private readonly repo: Repository<TypeOrmStopEntity>,
  ) {}

  async findById(id: string): Promise<Stop | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? StopMapper.toDomain(entity) : null;
  }

  async findByNormalizedName(normalizedName: string): Promise<Stop | null> {
    const entity = await this.repo.findOne({ where: { normalizedName } });
    return entity ? StopMapper.toDomain(entity) : null;
  }

  async findNearby(
    coordinates: Coordinates,
    radiusMeters: number,
    scope?: TransitQueryScope,
  ): Promise<NearbyStopResult[]> {
    const { latitude: lat, longitude: lng } = coordinates;

    const rawQueryBuilder = this.repo
      .createQueryBuilder('stop')
      .select([
        'stop.id',
        'stop.name',
        'stop.normalizedName',
        'stop.latitude',
        'stop.longitude',
        'stop.city',
        'stop.district',
        'stop.state',
        'stop.provider',
        'stop.externalId',
        'stop.createdAt',
        'stop.updatedAt',
      ])
      .addSelect(
        `ST_Distance(stop.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)`,
        'distanceMeters',
      )
      .where('stop.location IS NOT NULL')
      .andWhere(
        `ST_DWithin(stop.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)`,
      )
      .setParameters({ lng, lat, radius: radiusMeters })
      .orderBy('distanceMeters', 'ASC')
      .limit(100);

    this.applyScope(rawQueryBuilder, scope);

    const rawResults = await rawQueryBuilder.getRawMany();

    return rawResults.map(r => ({
      stop: StopMapper.toDomain({
        id: r.stop_id,
        name: r.stop_name,
        normalizedName: r.stop_normalized_name,
        latitude: r.stop_latitude,
        longitude: r.stop_longitude,
        city: r.stop_city,
        district: r.stop_district,
        state: r.stop_state,
        provider: r.stop_provider,
        externalId: r.stop_external_id,
        createdAt: r.stop_created_at,
        updatedAt: r.stop_updated_at,
        location: null,
      }),
      distanceMeters: Number(r.distanceMeters),
    }));
  }

  async findAll(
    page = 1,
    limit = 50,
    search?: string,
    scope?: TransitQueryScope,
  ): Promise<{ items: Stop[]; total: number }> {
    const qb = this.repo.createQueryBuilder('stop');
    if (search) {
      qb.where('stop.name ILIKE :search OR stop.normalizedName ILIKE :search', { search: `%${search}%` });
    }
    this.applyScope(qb, scope);
    qb.skip((page - 1) * limit).take(limit);

    const [entities, total] = await qb.getManyAndCount();
    return {
      items: entities.map(StopMapper.toDomain),
      total,
    };
  }

  async save(stop: Stop): Promise<Stop> {
    const persistenceData = StopMapper.toPersistence(stop);
    const savedEntity = await this.repo.save(persistenceData);
    return StopMapper.toDomain(savedEntity);
  }

  private applyScope(
    qb: ReturnType<Repository<TypeOrmStopEntity>['createQueryBuilder']>,
    scope?: TransitQueryScope,
  ): void {
    if (!scope) {
      return;
    }

    if (scope.providerCodes?.length) {
      qb.andWhere('stop.provider IN (:...providerCodes)', {
        providerCodes: scope.providerCodes,
      });
    }

    if (scope.state) {
      qb.andWhere('stop.state = :state', { state: scope.state });
    }

    if (scope.district) {
      qb.andWhere('stop.district = :district', { district: scope.district });
    }

    if (scope.city) {
      qb.andWhere('stop.city = :city', { city: scope.city });
    }
  }
}
