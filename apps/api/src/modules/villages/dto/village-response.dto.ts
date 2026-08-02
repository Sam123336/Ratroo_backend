export class NearestStopDto {
  id: string;
  name: string;
  providerCode: string;
}

export class AvailableRouteDto {
  routeId: string;
  name: string;
  providerCode: string;
}

export class VillageResponseDto {
  villageId: string;
  villageName: string;
  gramPanchayat: string | null;
  block: string | null;
  district: string | null;
  state: string;
  nearestStop: NearestStopDto;
  distanceKm: string;
  walkingTimeMinutes: number;
  availableRoutesCount: number;
  availableBuses: AvailableRouteDto[];
}
