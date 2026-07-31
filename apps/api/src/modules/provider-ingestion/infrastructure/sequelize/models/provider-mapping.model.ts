import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

function mappingModel(tableName: string, canonicalColumnName: string) {
  @Table({ tableName, modelName: tableName, timestamps: true })
  class ProviderMappingModel extends Model {
    @Column({ type: DataType.UUID, primaryKey: true })
    declare id: string;

    @Column({ type: DataType.STRING(80), allowNull: false })
    declare providerCode: string;

    @Column({ type: DataType.TEXT, allowNull: false })
    declare providerExternalId: string;

    @Column({ type: DataType.UUID, allowNull: true, field: canonicalColumnName })
    declare canonicalId?: string;

    @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'NEEDS_REVIEW' })
    declare resolutionStatus: string;

    @Column({ type: DataType.DECIMAL(4, 3), allowNull: false, defaultValue: 0 })
    declare confidence: number;

    @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
    declare evidence: Record<string, unknown>;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;

    @BeforeCreate
    static assignId(model: ProviderMappingModel): void {
      model.id = ensureUuidV7(model.id);
    }
  }

  return ProviderMappingModel;
}

export const ProviderAgencyMappingModel = mappingModel('provider_agency_mappings', 'agencyId');
export const ProviderNodeMappingModel = mappingModel('provider_node_mappings', 'nodeId');
export const ProviderRouteMappingModel = mappingModel('provider_route_mappings', 'routeId');
export const ProviderTripMappingModel = mappingModel('provider_trip_mappings', 'tripId');
