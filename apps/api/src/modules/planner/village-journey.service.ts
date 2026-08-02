import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

export interface JourneyLeg {
  legNumber: number;
  mode: 'WALK' | 'BUS' | 'SUBURBAN_RAIL' | 'METRO' | 'FERRY';
  fromName: string;
  toName: string;
  distanceKm: string;
  durationMinutes: number;
  providerCode?: string;
  serviceName?: string;
  instructions: string;
}

export interface VillageToAnywhereJourneyResult {
  fromInput: string;
  toInput: string;
  originVillage: {
    name: string;
    district?: string;
    state: string;
  };
  legs: JourneyLeg[];
  totalDistanceKm: string;
  totalDurationMinutes: number;
  transfersCount: number;
  confidenceScore: number;
  confidenceBadges: string[];
}

@Injectable()
export class VillageJourneyService {
  constructor(
    private readonly sequelize: Sequelize
  ) {}

  async planJourney(from: string, to: string): Promise<VillageToAnywhereJourneyResult> {
    if (!from || !from.trim() || !to || !to.trim()) {
      throw new BadRequestException('Both from and to location parameters are required.');
    }

    const cleanFrom = from.trim().toLowerCase();
    const cleanTo = to.trim().toLowerCase();

    // Query origin stop / village from Canonical Places
    let originPlace: any = null;
    const searchOrigin: any[] = await this.sequelize.query(
      `SELECT * FROM "places" WHERE LOWER("canonicalName") LIKE :q OR LOWER("normalizedName") LIKE :q LIMIT 1;`,
      { replacements: { q: `%${cleanFrom}%` }, type: QueryTypes.SELECT }
    );
    if (searchOrigin.length > 0) originPlace = searchOrigin[0];

    if (!originPlace) {
      throw new NotFoundException(`Origin location '${from}' was not found in the canonical graph database.`);
    }

    // Query destination stop / place from Canonical Places
    let destPlace: any = null;
    const searchDest: any[] = await this.sequelize.query(
      `SELECT * FROM "places" WHERE LOWER("canonicalName") LIKE :q OR LOWER("normalizedName") LIKE :q LIMIT 1;`,
      { replacements: { q: `%${cleanTo}%` }, type: QueryTypes.SELECT }
    );
    if (searchDest.length > 0) destPlace = searchDest[0];

    if (!destPlace) {
      throw new NotFoundException(`Destination location '${to}' was not found in the canonical graph database.`);
    }

    // Find connecting routes in PostgreSQL via placeId mapping
    const matchingRoutes: Array<{ id: string; longName: string; providerCode: string }> = await this.sequelize.query(
      `SELECT r."id", r."longName", r."providerCode"
       FROM "bus_routes" r
       JOIN "bus_route_stops" rs1 ON rs1."routeId" = r."id"
       JOIN "bus_stops" s1 ON s1."id" = rs1."stopId"
       JOIN "bus_route_stops" rs2 ON rs2."routeId" = r."id"
       JOIN "bus_stops" s2 ON s2."id" = rs2."stopId"
       WHERE s1."placeId" = :originPlaceId AND s2."placeId" = :destPlaceId
         AND rs1."sequence" < rs2."sequence"
       LIMIT 1;`,
      {
        replacements: { originPlaceId: originPlace.id, destPlaceId: destPlace.id },
        type: QueryTypes.SELECT,
      }
    );

    const mainRoute = matchingRoutes[0];
    if (!mainRoute) {
      throw new NotFoundException(`No connecting transport route found between '${originPlace.canonicalName}' and '${destPlace.canonicalName}' in database.`);
    }

    const legs: JourneyLeg[] = [
      {
        legNumber: 1,
        mode: 'WALK',
        fromName: `${originPlace.canonicalName} Area`,
        toName: originPlace.canonicalName,
        distanceKm: '0.5 km',
        durationMinutes: 6,
        instructions: `Walk to ${originPlace.canonicalName}`,
      },
      {
        legNumber: 2,
        mode: 'BUS',
        fromName: originPlace.canonicalName,
        toName: destPlace.canonicalName,
        distanceKm: '12.0 km',
        durationMinutes: 30,
        providerCode: mainRoute.providerCode,
        serviceName: mainRoute.longName,
        instructions: `Board ${mainRoute.longName} from ${originPlace.canonicalName} to ${destPlace.canonicalName}`,
      },
    ];

    const totalDuration = legs.reduce((s, leg) => s + leg.durationMinutes, 0);

    return {
      fromInput: from,
      toInput: to,
      originVillage: {
        name: originPlace.canonicalName,
        district: originPlace.districtId || undefined,
        state: 'West Bengal',
      },
      legs,
      totalDistanceKm: '12.5 km',
      totalDurationMinutes: totalDuration,
      transfersCount: 0,
      confidenceScore: originPlace.confidence ? parseFloat(originPlace.confidence) : 0.98,
      confidenceBadges: [mainRoute.providerCode, 'Canonical Graph ✓'],
    };
  }
}
