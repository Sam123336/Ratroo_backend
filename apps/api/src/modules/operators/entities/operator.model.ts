import {
  BeforeCreate, Column, CreatedAt, DataType, Default, HasMany, Index, Model,
  Table, UpdatedAt,
} from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';
import { OperatorStatus } from '../domain/operator-status';
import { OperatorRouteModel } from './operator-route.model';
import { OperatorVehicleModel } from './operator-vehicle.model';

/**
 * A transport business that registers its own services.
 *
 * Distinct from `providers`, which are the sources we scrape. An operator is a
 * first-party account: someone who owns buses and tells us directly what they
 * run, rather than a website we read.
 */
@Table({ tableName: 'operators', timestamps: true })
export class OperatorModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  /** The account that registered this operator and may edit it. */
  @Index('idx_operators_user')
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  /** Trading name, as a rider would see it on the vehicle. */
  @Column({ type: DataType.STRING(160), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(200), allowNull: true })
  declare legalName?: string;

  @Column({ type: DataType.STRING(160), allowNull: true })
  declare contactEmail?: string;

  @Column({ type: DataType.STRING(32), allowNull: true })
  declare contactPhone?: string;

  /**
   * The code this operator's data publishes under, so its rows are traceable
   * through the same provenance as any scraped source. Assigned by us, never
   * chosen by the operator.
   */
  @Index({ name: 'idx_operators_provider_code', unique: true })
  @Column({ type: DataType.STRING(64), allowNull: false })
  declare providerCode: string;

  @Default(OperatorStatus.PENDING)
  @Column({ type: DataType.STRING(16), allowNull: false })
  declare status: OperatorStatus;

  /** Free text from whoever reviewed the registration. */
  @Column({ type: DataType.STRING(400), allowNull: true })
  declare reviewNote?: string;

  @HasMany(() => OperatorVehicleModel)
  declare vehicles?: OperatorVehicleModel[];

  @HasMany(() => OperatorRouteModel)
  declare routes?: OperatorRouteModel[];

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: OperatorModel): void {
    model.id = ensureUuidV7(model.id);
  }
}
