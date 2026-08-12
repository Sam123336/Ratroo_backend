import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CreateRouteDto, RouteStopDto, SetPublishStateDto } from '../dto/operator.dto';
import { OperatorRoutesService } from '../services/operator-routes.service';

/** The services an operator runs, scoped to the signed-in account's business. */
@Controller('v1/operators/me/routes')
@UseGuards(JwtAuthGuard)
export class OperatorRoutesController {
  constructor(private readonly routes: OperatorRoutesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.routes.list(user.id);
  }

  @Get(':routeId')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('routeId', ParseUUIDPipe) routeId: string,
  ) {
    return this.routes.get(user.id, routeId);
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRouteDto) {
    return this.routes.create(user.id, dto);
  }

  /** PUT, not PATCH: a timetable is replaced wholesale, never merged. */
  @Put(':routeId/stops')
  async replaceStops(
    @CurrentUser() user: AuthenticatedUser,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() stops: RouteStopDto[],
  ) {
    return this.routes.replaceStops(user.id, routeId, stops);
  }

  @Put(':routeId/publish-state')
  async setPublishState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('routeId', ParseUUIDPipe) routeId: string,
    @Body() dto: SetPublishStateDto,
  ) {
    return this.routes.setPublishState(user.id, routeId, dto.publishState);
  }

  @Delete(':routeId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('routeId', ParseUUIDPipe) routeId: string,
  ) {
    return this.routes.remove(user.id, routeId);
  }
}
