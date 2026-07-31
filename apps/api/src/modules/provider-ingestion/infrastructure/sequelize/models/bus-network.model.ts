import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'bus_routes', timestamps: true })
export class BusRouteModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare externalId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare longName: string;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare directionId?: string;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' })
  declare operationalStatus: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare metadata: Record<string, unknown>;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: BusRouteModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

@Table({ tableName: 'bus_stops', timestamps: true })
export class BusStopModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare externalId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare normalizedName: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare metadata: Record<string, unknown>;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: BusStopModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

@Table({ tableName: 'bus_route_stops', timestamps: true })
export class BusRouteStopModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare routeId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare stopId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare sequence: number;

  @Column({ type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: BusRouteStopModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

@Table({ tableName: 'bus_trips', timestamps: true })
export class BusTripModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare externalId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare routeId: string;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare direction?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare vehicleRegistration?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare vehicleName?: string;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' })
  declare operationalStatus: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare metadata: Record<string, unknown>;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: BusTripModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

@Table({ tableName: 'bus_stop_times', timestamps: true })
export class BusStopTimeModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare tripId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare stopId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare sequence: number;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare arrivalTime?: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare departureTime?: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: BusStopTimeModel): void {
    model.id = ensureUuidV7(model.id);
  }
}
