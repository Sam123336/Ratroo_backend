import { Trip } from '../../domain/entities/Trip';
import { TypeOrmTripEntity } from '../typeorm/entities/typeorm-trip.entity';

export class TripMapper {
  static toDomain(entity: TypeOrmTripEntity): Trip {
    return new Trip({
      id: entity.id,
      routeId: entity.routeId,
      direction: entity.direction as 'UP' | 'DOWN',
      serviceId: entity.serviceId,
      vehicleName: entity.vehicleName,
      vehicleRegistration: entity.vehicleRegistration,
      provider: entity.provider,
      externalId: entity.externalId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toPersistence(domain: Trip): Partial<TypeOrmTripEntity> {
    return {
      id: domain.id,
      routeId: domain.routeId,
      direction: domain.direction,
      serviceId: domain.serviceId,
      vehicleName: domain.vehicleName,
      vehicleRegistration: domain.vehicleRegistration,
      provider: domain.provider,
      externalId: domain.externalId,
    };
  }
}
