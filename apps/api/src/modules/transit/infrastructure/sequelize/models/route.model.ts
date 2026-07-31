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
import { AgencyModel } from './agency.model';
import { TripModel } from './trip.model';

@Table({ tableName: 'routes', timestamps: true })
export class RouteModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @ForeignKey(() => AgencyModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare agencyId: string;

  @BelongsTo(() => AgencyModel)
  declare agency?: AgencyModel;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare shortName?: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare longName: string;

  @Column({ type: DataType.UUID, allowNull: true })
  declare originStopId?: string;

  @Column({ type: DataType.UUID, allowNull: true })
  declare destinationStopId?: string;

  @Column({ type: DataType.STRING(50), allowNull: false, defaultValue: 'BUS' })
  declare routeType: string;

  @Column({ type: DataType.STRING(50), allowNull: false })
  declare provider: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare externalId?: string;

  @HasMany(() => TripModel)
  declare trips?: TripModel[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: RouteModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

