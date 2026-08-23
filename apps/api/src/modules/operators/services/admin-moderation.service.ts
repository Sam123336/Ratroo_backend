import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ApiResult } from '../../core/dto/api-response.dto';
import { OperatorStatus } from '../domain/operator-status';
import { SubmissionReviewState } from '../domain/submission-review-state';
import { RouteReviewDecision, ReviewOperatorDto, ReviewRouteDto, ReviewVehicleDto } from '../dto/operator.dto';
import { OperatorModel } from '../entities/operator.model';
import { OperatorVehicleModel } from '../entities/operator-vehicle.model';
import { OperatorRouteModel, RoutePublishState } from '../entities/operator-route.model';
import { OperatorRouteStopModel } from '../entities/operator-route-stop.model';

@Injectable()
export class AdminModerationService {
  constructor(
    @InjectModel(OperatorModel) private readonly operators: typeof OperatorModel,
    @InjectModel(OperatorVehicleModel) private readonly vehicles: typeof OperatorVehicleModel,
    @InjectModel(OperatorRouteModel) private readonly routes: typeof OperatorRouteModel,
  ) {}

  async queue(status?: OperatorStatus) {
    const rows = await this.operators.findAll({
      where: status ? { status } : undefined,
      include: [
        OperatorVehicleModel,
        { model: OperatorRouteModel, include: [OperatorRouteStopModel, OperatorVehicleModel] },
      ],
      order: [['updatedAt', 'DESC']],
    });
    return new ApiResult(rows);
  }

  async get(operatorId: string) {
    const row = await this.operators.findByPk(operatorId, {
      include: [
        OperatorVehicleModel,
        { model: OperatorRouteModel, include: [OperatorRouteStopModel, OperatorVehicleModel] },
      ],
      order: [[OperatorRouteModel, OperatorRouteStopModel, 'sequence', 'ASC']],
    });
    if (!row) throw new NotFoundException('Operator submission not found.');
    return new ApiResult(row);
  }

  async reviewOperator(operatorId: string, dto: ReviewOperatorDto) {
    const row = await this.operators.findByPk(operatorId);
    if (!row) throw new NotFoundException('Operator submission not found.');
    await row.update({ status: dto.status, reviewNote: dto.reviewNote?.trim() || null });

    if (dto.status === OperatorStatus.SUSPENDED) {
      await this.routes.update(
        { publishState: RoutePublishState.WITHDRAWN },
        { where: { operatorId } },
      );
    }
    return this.get(operatorId);
  }

  async reviewVehicle(operatorId: string, vehicleId: string, dto: ReviewVehicleDto) {
    const row = await this.vehicles.findOne({ where: { id: vehicleId, operatorId } });
    if (!row) throw new NotFoundException('Vehicle submission not found.');
    await row.update({ reviewState: dto.reviewState, reviewNote: dto.reviewNote?.trim() || null });
    return new ApiResult(row);
  }

  async reviewRoute(operatorId: string, routeId: string, dto: ReviewRouteDto) {
    const route = await this.routes.findOne({
      where: { id: routeId, operatorId },
      include: [OperatorRouteStopModel, OperatorVehicleModel],
    });
    if (!route) throw new NotFoundException('Route submission not found.');
    if (route.publishState !== RoutePublishState.SUBMITTED && route.publishState !== RoutePublishState.NEEDS_CHANGES) {
      throw new BadRequestException('Only a route sent for review can be approved or returned.');
    }

    if (dto.decision === RouteReviewDecision.APPROVE) {
      const operator = await this.operators.findByPk(operatorId);
      if (operator?.status !== OperatorStatus.VERIFIED) {
        throw new BadRequestException('Verify the operator before approving a route.');
      }
      if (route.vehicleId && route.vehicle?.reviewState !== SubmissionReviewState.APPROVED) {
        throw new BadRequestException('Approve the assigned vehicle before approving this route.');
      }
      await route.update({ publishState: RoutePublishState.PUBLISHED, reviewNote: dto.reviewNote?.trim() || null });
    } else {
      if (!dto.reviewNote?.trim()) {
        throw new BadRequestException('Tell the operator what needs to change.');
      }
      await route.update({ publishState: RoutePublishState.NEEDS_CHANGES, reviewNote: dto.reviewNote.trim() });
    }

    return this.get(operatorId);
  }
}
