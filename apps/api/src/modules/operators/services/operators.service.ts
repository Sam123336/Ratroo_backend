import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ApiResult } from '../../core/dto/api-response.dto';
import { OperatorStatus } from '../domain/operator-status';
import {
  CreateVehicleDto, RegisterOperatorDto, UpdateOperatorDto,
} from '../dto/operator.dto';
import { OperatorModel } from '../entities/operator.model';
import { OperatorVehicleModel } from '../entities/operator-vehicle.model';

/**
 * Operator accounts and their fleet.
 *
 * Every method is scoped by the userId from the verified JWT, never from the
 * body — the same rule the favourites service follows. One account owns one
 * operator; a second registration is a conflict, not a second business.
 */
@Injectable()
export class OperatorsService {
  constructor(
    @InjectModel(OperatorModel)
    private readonly operators: typeof OperatorModel,
    @InjectModel(OperatorVehicleModel)
    private readonly vehicles: typeof OperatorVehicleModel,
  ) {}

  async register(
    userId: string,
    dto: RegisterOperatorDto,
  ): Promise<ApiResult<OperatorModel>> {
    const existing = await this.operators.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException(
        'This account already has an operator. Edit it instead of registering another.',
      );
    }

    const operator = await this.operators.create({
      userId,
      name: dto.name.trim(),
      legalName: dto.legalName?.trim(),
      contactEmail: dto.contactEmail?.trim().toLowerCase(),
      contactPhone: dto.contactPhone?.trim(),
      providerCode: await this.allocateProviderCode(dto.name),
      // Nothing an operator submits reaches riders until a human verifies them.
      status: OperatorStatus.PENDING,
    });

    return new ApiResult(operator);
  }

  async mine(userId: string): Promise<ApiResult<OperatorModel | null>> {
    const operator = await this.operators.findOne({
      where: { userId },
      include: [OperatorVehicleModel],
    });
    return new ApiResult(operator);
  }

  async update(
    userId: string,
    dto: UpdateOperatorDto,
  ): Promise<ApiResult<OperatorModel>> {
    const operator = await this.requireOwned(userId);

    // Status and providerCode are ours to set, so they are not in the DTO and
    // cannot be smuggled in through it.
    await operator.update({
      name: dto.name?.trim() ?? operator.name,
      legalName: dto.legalName?.trim() ?? operator.legalName,
      contactEmail: dto.contactEmail?.trim().toLowerCase() ?? operator.contactEmail,
      contactPhone: dto.contactPhone?.trim() ?? operator.contactPhone,
    });

    return new ApiResult(operator);
  }

  async addVehicle(
    userId: string,
    dto: CreateVehicleDto,
  ): Promise<ApiResult<OperatorVehicleModel>> {
    const operator = await this.requireOwned(userId);
    const registrationNumber = normaliseRegistration(dto.registrationNumber);

    const clash = await this.vehicles.findOne({
      where: { operatorId: operator.id, registrationNumber },
    });
    if (clash) {
      throw new ConflictException(
        `Vehicle ${registrationNumber} is already on your fleet.`,
      );
    }

    const vehicle = await this.vehicles.create({
      operatorId: operator.id,
      registrationNumber,
      vehicleType: dto.vehicleType,
      displayName: dto.displayName?.trim(),
      seatCapacity: dto.seatCapacity,
    });

    return new ApiResult(vehicle);
  }

  async listVehicles(userId: string): Promise<ApiResult<OperatorVehicleModel[]>> {
    const operator = await this.requireOwned(userId);
    const rows = await this.vehicles.findAll({
      where: { operatorId: operator.id },
      order: [['registrationNumber', 'ASC']],
    });
    return new ApiResult(rows);
  }

  async removeVehicle(userId: string, vehicleId: string): Promise<ApiResult<{ removed: true }>> {
    const operator = await this.requireOwned(userId);
    const removed = await this.vehicles.destroy({
      where: { id: vehicleId, operatorId: operator.id },
    });

    if (!removed) throw new NotFoundException('No such vehicle on your fleet.');
    return new ApiResult({ removed: true });
  }

  /** The operator this account owns, or a refusal. Used by every write path. */
  async requireOwned(userId: string): Promise<OperatorModel> {
    const operator = await this.operators.findOne({ where: { userId } });
    if (!operator) {
      throw new NotFoundException(
        'No operator registered on this account. Register one first.',
      );
    }
    if (operator.status === OperatorStatus.SUSPENDED) {
      throw new ForbiddenException(
        'This operator is suspended. Contact support to restore it.',
      );
    }
    return operator;
  }

  /**
   * A stable, readable code the operator's data publishes under — OP_ARAMBAGH,
   * OP_ARAMBAGH_2 if that is taken.
   *
   * Derived from the name rather than random so a row's provenance is legible
   * in the database without a join.
   */
  private async allocateProviderCode(name: string): Promise<string> {
    const base =
      'OP_' +
      (name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'OPERATOR');

    for (let suffix = 0; suffix < 100; suffix++) {
      const candidate = suffix === 0 ? base : `${base}_${suffix + 1}`;
      const taken = await this.operators.findOne({ where: { providerCode: candidate } });
      if (!taken) return candidate;
    }

    throw new BadRequestException(
      'Could not allocate a provider code for that name. Try a more distinctive name.',
    );
  }
}

/** "wb39a1234" and "WB 39 A 1234" are the same vehicle. */
function normaliseRegistration(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
