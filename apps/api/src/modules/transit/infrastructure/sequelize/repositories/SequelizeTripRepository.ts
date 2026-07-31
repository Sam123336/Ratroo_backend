import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Trip } from '../../../domain/entities/Trip';
import { TripRepository } from '../../../domain/repositories/TripRepository';
import { TripModel } from '../models';

@Injectable()
export class SequelizeTripRepository implements TripRepository {
  constructor(
    @InjectModel(TripModel)
    private readonly tripModel: typeof TripModel,
  ) {}

  async findById(id: string): Promise<Trip | null> {
    const model = await this.tripModel.findByPk(id);
    return model ? this.toDomain(model) : null;
  }

  async findByExternalId(externalId: string): Promise<Trip | null> {
    const model = await this.tripModel.findOne({ where: { externalId } });
    return model ? this.toDomain(model) : null;
  }

  async findByRouteId(routeId: string): Promise<Trip[]> {
    const models = await this.tripModel.findAll({ where: { routeId } });
    return models.map(model => this.toDomain(model));
  }

  async save(trip: Trip): Promise<Trip> {
    const model = await this.tripModel.create(this.toPersistence(trip));
    return this.toDomain(model);
  }

  private toDomain(model: TripModel): Trip {
    return new Trip({
      id: model.id,
      routeId: model.routeId,
      direction: model.direction as 'UP' | 'DOWN',
      serviceId: model.serviceId,
      vehicleName: model.vehicleName,
      vehicleRegistration: model.vehicleRegistration,
      provider: model.provider,
      externalId: model.externalId,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }

  private toPersistence(trip: Trip) {
    return {
      id: trip.id,
      routeId: trip.routeId,
      direction: trip.direction,
      serviceId: trip.serviceId,
      vehicleName: trip.vehicleName,
      vehicleRegistration: trip.vehicleRegistration,
      provider: trip.provider,
      externalId: trip.externalId,
    };
  }
}

