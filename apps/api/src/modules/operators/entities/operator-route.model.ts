import {
  BeforeCreate, BelongsTo, Column, CreatedAt, DataType, Default, ForeignKey,
  HasMany, Index, Model, Table, UpdatedAt,
} from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';
import { VehicleType } from '../domain/vehicle-type';
import { OperatorRouteStopModel } from './operator-route-stop.model';
import { OperatorModel } from './operator.model';
import { OperatorVehicleModel } from './operator-vehicle.model';

/** Whether riders can see this route yet. */
export enum RoutePublishState {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  NEEDS_CHANGES = 'NEEDS_CHANGES',
  PUBLISHED = 'PUBLISHED',
  WITHDRAWN = 'WITHDRAWN',
}

/**
 * A service an operator runs, as they describe it.
 *
 * Deliberately separate from the `routes` table the app reads. This is the
 * operator's submission; it becomes a rider-facing route only by going through
 * the same staging and promotion the scraped providers use. Writing straight
 * into `routes` would skip canonical stop resolution and provenance, and give
 * operator data a private path that every future feature would have to know
 * about.
 */
@Table({ tableName: 'operator_routes', timestamps: true })
export class OperatorRouteModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @ForeignKey(() => OperatorModel)
  @Index('idx_operator_routes_operator')
  @Column({ type: DataType.UUID, allowNull: false })
  declare operatorId: string;

  @BelongsTo(() => OperatorModel)
  declare operator?: OperatorModel;

  /** Optional: which vehicle usually runs it. */
  @ForeignKey(() => OperatorVehicleModel)
  @Column({ type: DataType.UUID, allowNull: true })
  declare vehicleId?: string;

  @BelongsTo(() => OperatorVehicleModel)
  declare vehicle?: OperatorVehicleModel;

  /** "Arambagh – Tarakeswar via Kamarpukur", in the operator's own words. */
  @Column({ type: DataType.STRING(200), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare vehicleType: VehicleType;

  @Default(RoutePublishState.DRAFT)
  @Column({ type: DataType.STRING(16), allowNull: false })
  declare publishState: RoutePublishState;

  /**
   * Whole-journey fare, when the operator charges a flat rate. Stage fares
   * live on the stops instead; both may be absent, and absent means we say
   * nothing about the fare rather than estimating one.
   */
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare fareINR?: number;

  /** Which days it runs, as ISO weekday numbers 1–7. Empty means daily. */
  @Column({ type: DataType.ARRAY(DataType.INTEGER), allowNull: true })
  declare operatingDays?: number[];

  @Column({ type: DataType.STRING(500), allowNull: true })
  declare notes?: string;

  /** Plain-language feedback shown to the operator after review. */
  @Column({ type: DataType.STRING(400), allowNull: true })
  declare reviewNote?: string;

  @HasMany(() => OperatorRouteStopModel)
  declare stops?: OperatorRouteStopModel[];

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: OperatorRouteModel): void {
    model.id = ensureUuidV7(model.id);
  }
}
