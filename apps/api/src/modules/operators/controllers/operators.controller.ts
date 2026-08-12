import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CreateVehicleDto, RegisterOperatorDto, UpdateOperatorDto } from '../dto/operator.dto';
import { OperatorsService } from '../services/operators.service';

/**
 * A transport business managing its own account and fleet.
 *
 * Guard on the controller: everything here belongs to a signed-in account, and
 * the operator is looked up from that account rather than named in the path —
 * there is no route here that can reach someone else's business.
 */
@Controller('v1/operators')
@UseGuards(JwtAuthGuard)
export class OperatorsController {
  constructor(private readonly operators: OperatorsService) {}

  @Post()
  async register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterOperatorDto) {
    return this.operators.register(user.id, dto);
  }

  /** The operator on this account, or null when they have not registered one. */
  @Get('me')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.operators.mine(user.id);
  }

  @Patch('me')
  async update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOperatorDto) {
    return this.operators.update(user.id, dto);
  }

  @Get('me/vehicles')
  async listVehicles(@CurrentUser() user: AuthenticatedUser) {
    return this.operators.listVehicles(user.id);
  }

  @Post('me/vehicles')
  async addVehicle(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVehicleDto) {
    return this.operators.addVehicle(user.id, dto);
  }

  @Delete('me/vehicles/:vehicleId')
  async removeVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.operators.removeVehicle(user.id, vehicleId);
  }
}
