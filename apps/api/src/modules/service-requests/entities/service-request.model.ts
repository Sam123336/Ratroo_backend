import {
  BeforeCreate, Column, CreatedAt, DataType, Default, Index, Model, Table, UpdatedAt,
} from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';

/**
 * Someone asking us to cover where they live.
 *
 * Ratroo holds West Bengal and part of Karnataka. Everyone else opens the app,
 * finds nothing, and leaves — and we never learn that they came. This is the
 * record of that visit: which state, and a number to tell when we arrive.
 *
 * Deliberately the smallest thing that works. A phone number and a state are
 * enough to rank where to expand next; anything more is a form nobody fills in.
 */
@Table({ tableName: 'service_requests', timestamps: true })
export class ServiceRequestModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  /** ISO-3166-2 state code the device resolved to: WB, KA, BR, OD. */
  @Index('idx_service_requests_state')
  @Column({ type: DataType.STRING(8), allowNull: false })
  declare stateCode: string;

  /** What the rider would call it — "Bihar", not "BR". */
  @Column({ type: DataType.STRING(120), allowNull: true })
  declare regionName?: string;

  /**
   * Stored as given. Indian numbers arrive with and without +91, with spaces
   * and dashes; rejecting a real person over formatting loses the signal we
   * are collecting.
   */
  @Column({ type: DataType.STRING(32), allowNull: false })
  declare phone: string;

  /** Where they were, so expansion can be planned by city rather than state. */
  @Column({ type: DataType.DECIMAL(10, 7), allowNull: true })
  declare latitude?: number;

  @Column({ type: DataType.DECIMAL(10, 7), allowNull: true })
  declare longitude?: number;

  @Column({ type: DataType.STRING(120), allowNull: true })
  declare city?: string;

  /** Set when the state goes live and we have told them. */
  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare notified: boolean;

  @CreatedAt declare createdAt: Date;
  @UpdatedAt declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: ServiceRequestModel): void {
    model.id = ensureUuidV7(model.id);
  }
}
