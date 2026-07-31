import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

function stagedModel(tableName: string) {
  @Table({ tableName, modelName: tableName, timestamps: true })
  class StagedCanonicalModel extends Model {
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
    static assignId(model: StagedCanonicalModel): void {
      model.id = ensureUuidV7(model.id);
    }
  }

  return StagedCanonicalModel;
}

export const StagedAgencyModel = stagedModel('staged_agencies');
export const StagedNodeModel = stagedModel('staged_nodes');
export const StagedRouteModel = stagedModel('staged_routes');
export const StagedRouteStopModel = stagedModel('staged_route_stops');
export const StagedTripModel = stagedModel('staged_trips');
export const StagedStopTimeModel = stagedModel('staged_stop_times');
export const StagedFareModel = stagedModel('staged_fares');
