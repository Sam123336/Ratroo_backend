import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

abstract class BaseStagedCanonicalModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare providerExternalId?: string;

  @Column({ type: DataType.UUID, allowNull: true })
  declare sourceObservationId?: string;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'PENDING' })
  declare validationStatus: string;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' })
  declare operationalStatus: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare effectiveFrom?: string;

  @Column({ type: DataType.DATEONLY, allowNull: true })
  declare effectiveUntil?: string;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lastObservedAt?: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare lastVerifiedAt?: Date;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare canonicalPayload: Record<string, unknown>;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: BaseStagedCanonicalModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

@Table({ tableName: 'staged_agencies', timestamps: true })
export class StagedAgencyModel extends BaseStagedCanonicalModel {}

@Table({ tableName: 'staged_nodes', timestamps: true })
export class StagedNodeModel extends BaseStagedCanonicalModel {}

@Table({ tableName: 'staged_routes', timestamps: true })
export class StagedRouteModel extends BaseStagedCanonicalModel {}

@Table({ tableName: 'staged_route_stops', timestamps: true })
export class StagedRouteStopModel extends BaseStagedCanonicalModel {}

@Table({ tableName: 'staged_trips', timestamps: true })
export class StagedTripModel extends BaseStagedCanonicalModel {}

@Table({ tableName: 'staged_stop_times', timestamps: true })
export class StagedStopTimeModel extends BaseStagedCanonicalModel {}

@Table({ tableName: 'staged_fares', timestamps: true })
export class StagedFareModel extends BaseStagedCanonicalModel {}
