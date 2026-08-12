import {
  BeforeCreate, BelongsTo, Column, CreatedAt, DataType, ForeignKey, Index,
  Model, Table, UpdatedAt,
} from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';
import { VehicleType } from '../domain/vehicle-type';
import { OperatorModel } from './operator.model';

/**
 * One vehicle in an operator's fleet.
 *
 * Registration number is what a rider can actually check against the vehicle
 * in front of them, which is why it is unique per operator and why the display
 * name — what is painted on the side — is stored separately.
 */
@Table({ tableName: 'operator_vehicles', timestamps: true })
export class OperatorVehicleModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @ForeignKey(() => OperatorModel)
  @Index({ name: 'idx_operator_vehicles_reg', unique: true })
  @Column({ type: DataType.UUID, allowNull: false })
  declare operatorId: string;

  @BelongsTo(() => OperatorModel)
  declare operator?: OperatorModel;

  /** "WB 39 A 1234". Unique within the operator, not globally. */
  @Index({ name: 'idx_operator_vehicles_reg', unique: true })
  @Column({ type: DataType.STRING(32), allowNull: false })
  declare registrationNumber: string;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare vehicleType: VehicleType;

  /** The name painted on the bus, which is how riders identify it. */
  @Column({ type: DataType.STRING(120), allowNull: true })
  declare displayName?: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare seatCapacity?: number;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: OperatorVehicleModel): void {
    model.id = ensureUuidV7(model.id);
  }
}
