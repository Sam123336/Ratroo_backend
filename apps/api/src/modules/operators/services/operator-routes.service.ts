import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ApiResult } from '../../core/dto/api-response.dto';
import { canPublish } from '../domain/operator-status';
import { CreateRouteDto, RouteStopDto } from '../dto/operator.dto';
import { OperatorRouteStopModel } from '../entities/operator-route-stop.model';
import { OperatorRouteModel, RoutePublishState } from '../entities/operator-route.model';
import { OperatorVehicleModel } from '../entities/operator-vehicle.model';
import { OperatorsService } from './operators.service';

/**
 * The services an operator says they run.
 *
 * Everything here is scoped to the operator owned by the calling account. A
 * route and its stops are written in one transaction — a route with half its
 * stops would be published as a real service with a hole in the middle.
 */
@Injectable()
export class OperatorRoutesService {
  constructor(
    @InjectModel(OperatorRouteModel)
    private readonly routes: typeof OperatorRouteModel,
    @InjectModel(OperatorRouteStopModel)
    private readonly stops: typeof OperatorRouteStopModel,
    @InjectModel(OperatorVehicleModel)
    private readonly vehicles: typeof OperatorVehicleModel,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly operators: OperatorsService,
  ) {}

  async list(userId: string): Promise<ApiResult<OperatorRouteModel[]>> {
    const operator = await this.operators.requireOwned(userId);
    const rows = await this.routes.findAll({
      where: { operatorId: operator.id },
      include: [OperatorRouteStopModel],
      order: [
        ['createdAt', 'DESC'],
        [OperatorRouteStopModel, 'sequence', 'ASC'],
      ],
    });
    return new ApiResult(rows);
  }

  async get(userId: string, routeId: string): Promise<ApiResult<OperatorRouteModel>> {
    const route = await this.requireOwnedRoute(userId, routeId);
    return new ApiResult(route);
  }

  async create(userId: string, dto: CreateRouteDto): Promise<ApiResult<OperatorRouteModel>> {
    const operator = await this.operators.requireOwned(userId);
    assertTimesRunForward(dto.stops);

    if (dto.vehicleId) {
      const vehicle = await this.vehicles.findOne({
        where: { id: dto.vehicleId, operatorId: operator.id },
      });
      // A route may only name a vehicle on this operator's own fleet.
      if (!vehicle) throw new NotFoundException('No such vehicle on your fleet.');
    }

    const created = await this.sequelize.transaction(async transaction => {
      const route = await this.routes.create(
        {
          operatorId: operator.id,
          vehicleId: dto.vehicleId,
          name: dto.name.trim(),
          vehicleType: dto.vehicleType,
          fareINR: dto.fareINR,
          operatingDays: dto.operatingDays,
          notes: dto.notes?.trim(),
          // New routes start hidden, whatever the operator's status.
          publishState: RoutePublishState.DRAFT,
        },
        { transaction },
      );

      await this.stops.bulkCreate(
        dto.stops.map((stop, index) => ({
          operatorRouteId: route.id,
          sequence: index + 1,
          stopName: stop.stopName.trim(),
          latitude: stop.latitude,
          longitude: stop.longitude,
          departureTime: stop.departureTime,
          fareFromOriginINR: stop.fareFromOriginINR,
        })),
        { transaction },
      );

      return route;
    });

    return new ApiResult(await this.reload(created.id));
  }

  /** Replaces the stop list wholesale — editing a timetable is not a patch. */
  async replaceStops(
    userId: string,
    routeId: string,
    stops: RouteStopDto[],
  ): Promise<ApiResult<OperatorRouteModel>> {
    const route = await this.requireOwnedRoute(userId, routeId);
    assertTimesRunForward(stops);

    await this.sequelize.transaction(async transaction => {
      await this.stops.destroy({ where: { operatorRouteId: route.id }, transaction });
      await this.stops.bulkCreate(
        stops.map((stop, index) => ({
          operatorRouteId: route.id,
          sequence: index + 1,
          stopName: stop.stopName.trim(),
          latitude: stop.latitude,
          longitude: stop.longitude,
          departureTime: stop.departureTime,
          fareFromOriginINR: stop.fareFromOriginINR,
        })),
        { transaction },
      );
    });

    return new ApiResult(await this.reload(route.id));
  }

  async setPublishState(
    userId: string,
    routeId: string,
    publishState: RoutePublishState,
  ): Promise<ApiResult<OperatorRouteModel>> {
    const operator = await this.operators.requireOwned(userId);
    const route = await this.requireOwnedRoute(userId, routeId);

    // The trust decision is the operator's verification, checked here rather
    // than at write time — an operator verified after drafting can publish
    // what they already wrote.
    if (publishState === RoutePublishState.PUBLISHED && !canPublish(operator.status)) {
      throw new ForbiddenException(
        'This operator is not verified yet, so its routes cannot be published to riders.',
      );
    }

    await route.update({ publishState });
    return new ApiResult(await this.reload(route.id));
  }

  async remove(userId: string, routeId: string): Promise<ApiResult<{ removed: boolean }>> {
    const route = await this.requireOwnedRoute(userId, routeId);
    // Stops go with it; the FK is ON DELETE CASCADE, so this is one statement.
    await route.destroy();
    return new ApiResult({ removed: true });
  }

  private async requireOwnedRoute(userId: string, routeId: string): Promise<OperatorRouteModel> {
    const operator = await this.operators.requireOwned(userId);
    const route = await this.routes.findOne({
      where: { id: routeId, operatorId: operator.id },
      include: [OperatorRouteStopModel],
    });
    if (!route) throw new NotFoundException('No such route on this operator.');
    return route;
  }

  private async reload(routeId: string): Promise<OperatorRouteModel> {
    const route = await this.routes.findByPk(routeId, {
      include: [OperatorRouteStopModel],
      order: [[OperatorRouteStopModel, 'sequence', 'ASC']],
    });
    if (!route) throw new NotFoundException('Route disappeared while saving.');
    return route;
  }
}

/**
 * A timetable that goes backwards is a typo, and one that reaches riders sends
 * them to a stop the bus has already left.
 *
 * Only compares stops that carry a time; an operator may time the ends of a
 * route and leave the middle blank, which is honest and common.
 */
function assertTimesRunForward(stops: RouteStopDto[]): void {
  let previous: string | undefined;
  let previousIndex = 0;

  stops.forEach((stop, index) => {
    if (!stop.departureTime) return;
    if (previous && stop.departureTime < previous) {
      throw new BadRequestException(
        `Stop ${index + 1} (${stop.departureTime}) departs before stop ` +
          `${previousIndex + 1} (${previous}). If the service runs past midnight, ` +
          `split it into two routes.`,
      );
    }
    previous = stop.departureTime;
    previousIndex = index;
  });
}
