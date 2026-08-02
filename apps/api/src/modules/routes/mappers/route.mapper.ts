import { Injectable } from '@nestjs/common';
import { RouteResponseDto } from '../dto/route-response.dto';
import { BusRouteModel } from '../../provider-ingestion/infrastructure/sequelize/models/bus-network.model';

@Injectable()
export class RouteMapper {
  mapToDto(
    route: BusRouteModel,
    stops: Array<{ stopId: string; name: string; sequence: number }>,
    trips: Array<{ vehicleName?: string; departureTime?: string }>
  ): RouteResponseDto {
    return {
      id: route.id,
      externalId: route.externalId,
      providerCode: route.providerCode,
      shortName: (route.metadata as any)?.shortName || null,
      longName: route.longName,
      operationalStatus: route.operationalStatus,
      datasetVersionId: route.datasetVersionId,
      operator: (route.metadata as any)?.agency || trips[0]?.vehicleName || null,
      fareINR: (route.metadata as any)?.fareINR || null,
      trips,
      intermediateStops: stops.map((s) => ({
        stopId: s.stopId,
        name: s.name,
        sequence: s.sequence,
      })),
    };
  }
}
