import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, QueryTypes, Sequelize } from 'sequelize';
import { Stop } from '../../../domain/entities/Stop';
import {
  NearbyStopResult,
  StopRepository,
  TransitQueryScope,
} from '../../../domain/repositories/StopRepository';
import { Coordinates } from '../../../domain/value-objects/Coordinates';
import { StopModel } from '../models';

interface NearbyStopRow {
  id: string;
  name: string;
  normalizedName: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  district?: string;
  state?: string;
  provider: string;
  externalId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  distanceMeters: string;
}

@Injectable()
export class SequelizeStopRepository implements StopRepository {
  constructor(
    @InjectModel(StopModel)
    private readonly stopModel: typeof StopModel,
    private readonly sequelize: Sequelize,
  ) {}

  async findById(id: string): Promise<Stop | null> {
    const model = await this.stopModel.findByPk(id);
    return model ? this.toDomain(model) : null;
  }

  async findByNormalizedName(normalizedName: string): Promise<Stop | null> {
    const model = await this.stopModel.findOne({ where: { normalizedName } });
    return model ? this.toDomain(model) : null;
  }

  async findNearby(
    coordinates: Coordinates,
    radiusMeters: number,
    scope?: TransitQueryScope,
  ): Promise<NearbyStopResult[]> {
    const rows = await this.sequelize.query<NearbyStopRow>(
      `
        SELECT
          id,
          name,
          "normalizedName",
          latitude,
          longitude,
          city,
          district,
          state,
          provider,
          "externalId",
          "createdAt",
          "updatedAt",
          ST_Distance(location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography) AS "distanceMeters"
        FROM stops
        WHERE location IS NOT NULL
          AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)
          ${this.scopeSql(scope)}
        ORDER BY "distanceMeters" ASC
        LIMIT 100
      `,
      {
        replacements: {
          lat: coordinates.latitude,
          lng: coordinates.longitude,
          radius: radiusMeters,
          providerCodes: scope?.providerCodes || [],
          state: scope?.state,
          district: scope?.district,
          city: scope?.city,
        },
        type: QueryTypes.SELECT,
      },
    );

    return rows.map(row => ({
      stop: this.toDomain(row),
      distanceMeters: Number(row.distanceMeters),
    }));
  }

  async findAll(
    page = 1,
    limit = 50,
    search?: string,
    scope?: TransitQueryScope,
  ): Promise<{ items: Stop[]; total: number }> {
    const where: Record<string | symbol, unknown> = {};

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { normalizedName: { [Op.iLike]: `%${search}%` } },
      ];
    }

    this.applyScope(where, scope);

    const result = await this.stopModel.findAndCountAll({
      where,
      offset: (page - 1) * limit,
      limit,
      order: [['name', 'ASC']],
    });

    return {
      items: result.rows.map(model => this.toDomain(model)),
      total: result.count,
    };
  }

  async save(stop: Stop): Promise<Stop> {
    const [model] = await this.stopModel.upsert(this.toPersistence(stop), { returning: true });
    return this.toDomain(model);
  }

  private toDomain(record: StopModel | NearbyStopRow): Stop {
    const latitude = record.latitude === undefined || record.latitude === null
      ? undefined
      : Number(record.latitude);
    const longitude = record.longitude === undefined || record.longitude === null
      ? undefined
      : Number(record.longitude);

    return new Stop({
      id: record.id,
      name: record.name,
      normalizedName: record.normalizedName,
      coordinates: latitude !== undefined && longitude !== undefined
        ? new Coordinates(latitude, longitude)
        : undefined,
      city: record.city,
      district: record.district,
      state: record.state,
      provider: record.provider,
      externalId: record.externalId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private toPersistence(stop: Stop) {
    const latitude = stop.coordinates?.latitude;
    const longitude = stop.coordinates?.longitude;

    return {
      id: stop.id,
      name: stop.name,
      normalizedName: stop.normalizedName,
      latitude,
      longitude,
      location: latitude !== undefined && longitude !== undefined
        ? { type: 'Point', coordinates: [longitude, latitude] }
        : undefined,
      city: stop.city,
      district: stop.district,
      state: stop.state,
      provider: stop.provider,
      externalId: stop.externalId,
    };
  }

  private applyScope(where: Record<string | symbol, unknown>, scope?: TransitQueryScope): void {
    if (!scope) {
      return;
    }

    if (scope.providerCodes?.length) {
      where.provider = { [Op.in]: scope.providerCodes };
    }

    if (scope.state) {
      where.state = scope.state;
    }

    if (scope.district) {
      where.district = scope.district;
    }

    if (scope.city) {
      where.city = scope.city;
    }
  }

  private scopeSql(scope?: TransitQueryScope): string {
    if (!scope) {
      return '';
    }

    const clauses: string[] = [];

    if (scope.providerCodes?.length) {
      clauses.push('provider IN (:providerCodes)');
    }

    if (scope.state) {
      clauses.push('state = :state');
    }

    if (scope.district) {
      clauses.push('district = :district');
    }

    if (scope.city) {
      clauses.push('city = :city');
    }

    return clauses.length ? `AND ${clauses.join(' AND ')}` : '';
  }
}
