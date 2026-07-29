import { Route } from '../../domain/entities/Route';
import { TypeOrmRouteEntity } from '../typeorm/entities/typeorm-route.entity';

export class RouteMapper {
  static toDomain(entity: TypeOrmRouteEntity): Route {
    return new Route({
      id: entity.id,
      agencyId: entity.agencyId,
      shortName: entity.shortName,
      longName: entity.longName,
      originStopId: entity.originStopId,
      destinationStopId: entity.destinationStopId,
      routeType: entity.routeType,
      provider: entity.provider,
      externalId: entity.externalId,
    });
  }

  static toPersistence(domain: Route): Partial<TypeOrmRouteEntity> {
    return {
      id: domain.id,
      agencyId: domain.agencyId,
      shortName: domain.shortName,
      longName: domain.longName,
      originStopId: domain.originStopId,
      destinationStopId: domain.destinationStopId,
      routeType: domain.routeType,
      provider: domain.provider,
      externalId: domain.externalId,
    };
  }
}
