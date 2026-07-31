import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { FindOptions, Includeable, Op } from 'sequelize';
import { Route } from '../../../domain/entities/Route';
import { RouteRepository } from '../../../domain/repositories/RouteRepository';
import { TransitQueryScope } from '../../../domain/repositories/StopRepository';
import { AgencyModel, RouteModel } from '../models';

@Injectable()
export class SequelizeRouteRepository implements RouteRepository {
  constructor(
    @InjectModel(RouteModel)
    private readonly routeModel: typeof RouteModel,
  ) {}

  async findById(id: string): Promise<Route | null> {
    const model = await this.routeModel.findByPk(id);
    return model ? this.toDomain(model) : null;
  }

  async findByExternalId(externalId: string): Promise<Route | null> {
    const model = await this.routeModel.findOne({ where: { externalId } });
    return model ? this.toDomain(model) : null;
  }

  async findAll(
    page = 1,
    limit = 50,
    search?: string,
    scope?: TransitQueryScope,
  ): Promise<{ items: Route[]; total: number }> {
    const where: Record<string | symbol, unknown> = {};
    const include: Includeable[] = [];

    if (search) {
      where[Op.or] = [
        { longName: { [Op.iLike]: `%${search}%` } },
        { shortName: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (scope?.providerCodes?.length) {
      where.provider = { [Op.in]: scope.providerCodes };
    }

    if (scope?.state || scope?.city) {
      include.push({
        model: AgencyModel,
        required: true,
        where: {
          ...(scope.state ? { state: scope.state } : {}),
          ...(scope.city ? { city: scope.city } : {}),
        },
      });
    }

    const options: FindOptions = {
      where,
      include,
      offset: (page - 1) * limit,
      limit,
      order: [['longName', 'ASC']],
    };

    const result = await this.routeModel.findAndCountAll(options);

    return {
      items: result.rows.map(model => this.toDomain(model)),
      total: result.count,
    };
  }

  async save(route: Route): Promise<Route> {
    const [model] = await this.routeModel.upsert(this.toPersistence(route), { returning: true });
    return this.toDomain(model);
  }

  private toDomain(model: RouteModel): Route {
    return new Route({
      id: model.id,
      agencyId: model.agencyId,
      shortName: model.shortName,
      longName: model.longName,
      originStopId: model.originStopId,
      destinationStopId: model.destinationStopId,
      routeType: model.routeType,
      provider: model.provider,
      externalId: model.externalId,
    });
  }

  private toPersistence(route: Route) {
    return {
      id: route.id,
      agencyId: route.agencyId,
      shortName: route.shortName,
      longName: route.longName,
      originStopId: route.originStopId,
      destinationStopId: route.destinationStopId,
      routeType: route.routeType,
      provider: route.provider,
      externalId: route.externalId,
    };
  }
}
