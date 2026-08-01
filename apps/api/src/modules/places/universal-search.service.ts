import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

export type SearchCategory =
  | 'VILLAGE'
  | 'TOWN'
  | 'AREA'
  | 'LANDMARK'
  | 'HOSPITAL'
  | 'COLLEGE'
  | 'BUS_STOP'
  | 'METRO_STATION'
  | 'RAILWAY_STATION'
  | 'FERRY_TERMINAL'
  | 'TRAM_STOP'
  | 'BUS_NUMBER'
  | 'BUS_NAME'
  | 'ROUTE_NUMBER'
  | 'OPERATOR';

export interface SearchResultItem {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  latitude?: number;
  longitude?: number;
  district?: string;
  block?: string;
  providerCode: string;
  aliases: string[];
  relevanceScore: number;
}

@Injectable()
export class UniversalSearchService {
  constructor(private readonly sequelize: Sequelize) {}

  async search(query: string, categoryFilter?: SearchCategory): Promise<SearchResultItem[]> {
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];

    // Query bus_stops from PostgreSQL database
    const stopsRes: Array<{
      id: string;
      name: string;
      providerCode: string;
      metadata: any;
    }> = await this.sequelize.query(
      `SELECT "id", "name", "providerCode", "metadata"
       FROM "bus_stops"
       WHERE LOWER("name") LIKE :query OR LOWER("normalizedName") LIKE :query
       LIMIT 10;`,
      {
        replacements: { query: `%${q}%` },
        type: QueryTypes.SELECT,
      }
    );

    // Query bus_routes from PostgreSQL database
    const routesRes: Array<{
      id: string;
      longName: string;
      providerCode: string;
      metadata: any;
    }> = await this.sequelize.query(
      `SELECT "id", "longName", "providerCode", "metadata"
       FROM "bus_routes"
       WHERE LOWER("longName") LIKE :query
       LIMIT 10;`,
      {
        replacements: { query: `%${q}%` },
        type: QueryTypes.SELECT,
      }
    );

    const results: SearchResultItem[] = [];

    stopsRes.forEach((stop) => {
      results.push({
        id: stop.id,
        category: 'BUS_STOP',
        title: stop.name,
        subtitle: `${stop.providerCode} Bus Stop`,
        latitude: (stop.metadata as any)?.latitude,
        longitude: (stop.metadata as any)?.longitude,
        district: (stop.metadata as any)?.district,
        block: (stop.metadata as any)?.block,
        providerCode: stop.providerCode,
        aliases: [],
        relevanceScore: 0.95,
      });
    });

    routesRes.forEach((route) => {
      results.push({
        id: route.id,
        category: 'BUS_NAME',
        title: route.longName,
        subtitle: `${route.providerCode} Route`,
        providerCode: route.providerCode,
        aliases: [],
        relevanceScore: 0.90,
      });
    });

    return results;
  }
}
