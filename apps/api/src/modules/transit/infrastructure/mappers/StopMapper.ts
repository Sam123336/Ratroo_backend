import { Stop } from '../../domain/entities/Stop';
import { Coordinates } from '../../domain/value-objects/Coordinates';
import { TypeOrmStopEntity } from '../typeorm/entities/typeorm-stop.entity';

export class StopMapper {
  static toDomain(entity: TypeOrmStopEntity): Stop {
    const coords = (entity.latitude !== null && entity.longitude !== null)
      ? new Coordinates(Number(entity.latitude), Number(entity.longitude))
      : undefined;

    return new Stop({
      id: entity.id,
      name: entity.name,
      normalizedName: entity.normalizedName,
      coordinates: coords,
      city: entity.city,
      district: entity.district,
      state: entity.state,
      provider: entity.provider,
      externalId: entity.externalId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toPersistence(domain: Stop): Partial<TypeOrmStopEntity> {
    const lat = domain.coordinates?.latitude;
    const lng = domain.coordinates?.longitude;
    const locationGeo = (lat !== undefined && lng !== undefined)
      ? `POINT(${lng} ${lat})`
      : undefined;

    return {
      id: domain.id,
      name: domain.name,
      normalizedName: domain.normalizedName,
      latitude: lat,
      longitude: lng,
      location: locationGeo,
      city: domain.city,
      district: domain.district,
      state: domain.state,
      provider: domain.provider,
      externalId: domain.externalId,
    };
  }
}
