import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OperatorStatus } from '../domain/operator-status';
import { ReviewOperatorDto, ReviewRouteDto, ReviewVehicleDto } from '../dto/operator.dto';
import { AdminModerationService } from '../services/admin-moderation.service';

/** API used exclusively by the standalone Ratroo admin website. */
@Controller('v1/admin/operators')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminModerationController {
  constructor(private readonly moderation: AdminModerationService) {}

  @Get()
  queue(@Query('status') status?: OperatorStatus) {
    return this.moderation.queue(status);
  }

  @Get(':operatorId')
  get(@Param('operatorId', ParseUUIDPipe) operatorId: string) {
    return this.moderation.get(operatorId);
  }

  @Patch(':operatorId/status')
  reviewOperator(
    @Param('operatorId', ParseUUIDPipe) operatorId: string,
    @Body() dto: ReviewOperatorDto,
  ) {
    return this.moderation.reviewOperator(operatorId, dto);
  }

  @Patch(':operatorId/vehicles/:vehicleId')
  reviewVehicle(
    @Param('operatorId', ParseUUIDPipe) operatorId: string,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: ReviewVehicleDto,
  ) {
    return this.moderation.reviewVehicle(operatorId, vehicleId, dto);
  }

  @Patch(':operatorId/routes/:routeId')
  reviewRoute(
    @Param('operatorId', ParseUUIDPipe) operatorId: string,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() dto: ReviewRouteDto,
  ) {
    return this.moderation.reviewRoute(operatorId, routeId, dto);
  }
}
