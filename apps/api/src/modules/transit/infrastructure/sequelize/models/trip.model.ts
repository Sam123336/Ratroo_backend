import {
  BeforeCreate,
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  ForeignKey,
  HasMany,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';
import { RouteModel } from './route.model';
import { StopTimeModel } from './stop-time.model';

@Table({ tableName: 'trips', timestamps: true })
export class TripModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @ForeignKey(() => RouteModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare routeId: string;

  @BelongsTo(() => RouteModel)
  declare route?: RouteModel;

  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: 'UP' })
  declare direction: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare serviceId?: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare vehicleName?: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare vehicleRegistration?: string;

  @Column({ type: DataType.STRING(50), allowNull: false })
  declare provider: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare externalId?: string;

  @HasMany(() => StopTimeModel)
  declare stopTimes?: StopTimeModel[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: TripModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

