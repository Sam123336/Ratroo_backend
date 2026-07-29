import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TripRepository } from '../../domain/repositories/TripRepository';
import { Trip } from '../../domain/entities/Trip';
import { TypeOrmTripEntity } from '../typeorm/entities/typeorm-trip.entity';
import { TripMapper } from '../mappers/TripMapper';

@Injectable()
export class PostgresTripRepository implements TripRepository {
  constructor(
    @InjectRepository(TypeOrmTripEntity)
    private readonly repo: Repository<TypeOrmTripEntity>,
  ) {}

  async findById(id: string): Promise<Trip | null> {
    const entity = await this.repo.findOne({ where: { id } });
    return entity ? TripMapper.toDomain(entity) : null;
  }

  async findByExternalId(externalId: string): Promise<Trip | null> {
    const entity = await this.repo.findOne({ where: { externalId } });
    return entity ? TripMapper.toDomain(entity) : null;
  }

  async findByRouteId(routeId: string): Promise<Trip[]> {
    const entities = await this.repo.find({ where: { routeId } });
    return entities.map(TripMapper.toDomain);
  }

  async save(trip: Trip): Promise<Trip> {
    const persistenceData = TripMapper.toPersistence(trip);
    const savedEntity = await this.repo.save(persistenceData);
    return TripMapper.toDomain(savedEntity);
  }
}
