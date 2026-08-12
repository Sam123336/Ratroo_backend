import {
  BeforeCreate, BelongsTo, Column, CreatedAt, DataType, ForeignKey, Index,
  Model, Table, UpdatedAt,
} from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';
import { OperatorRouteModel } from './operator-route.model';

/**
 * One call on an operator's route: where, when, and what it costs to get there.
 *
 * The operator names the stop in their own words and, where they can, drops a
 * pin. Matching that to a canonical place is the resolution engine's job at
 * promotion time, not the operator's — asking a bus owner to pick from 7,930
 * database rows is not a thing anyone will do.
 */
@Table({ tableName: 'operator_route_stops', timestamps: true })
export class OperatorRouteStopModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @ForeignKey(() => OperatorRouteModel)
  @Index({ name: 'idx_operator_route_stops_seq', unique: true })
  @Column({ type: DataType.UUID, allowNull: false })
  declare operatorRouteId: string;

  @BelongsTo(() => OperatorRouteModel)
  declare route?: OperatorRouteModel;

  /** Order of travel, 1-based. Unique within the route. */
  @Index({ name: 'idx_operator_route_stops_seq', unique: true })
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare sequence: number;

  @Column({ type: DataType.STRING(200), allowNull: false })
  declare stopName: string;

  @Column({ type: DataType.DECIMAL(10, 7), allowNull: true })
  declare latitude?: number;

  @Column({ type: DataType.DECIMAL(10, 7), allowNull: true })
  declare longitude?: number;

  /**
   * Resolved canonical place, filled by the resolution engine once this route
   * is promoted. Null until then — and null is honest: we have not yet decided
   * which existing stop this is.
   */
  @Column({ type: DataType.UUID, allowNull: true })
  declare placeId?: string;

  /** "HH:MM", the operator's own scheduled departure. */
  @Column({ type: DataType.STRING(5), allowNull: true })
  declare departureTime?: string;

  /** Fare from the first stop to this one, where the operator charges by stage. */
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare fareFromOriginINR?: number;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: OperatorRouteStopModel): void {
    model.id = ensureUuidV7(model.id);
  }
}
