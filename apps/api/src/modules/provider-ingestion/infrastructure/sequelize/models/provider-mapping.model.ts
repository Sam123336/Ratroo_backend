import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

abstract class BaseProviderMappingModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare providerExternalId: string;

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
  static assignId(model: BaseProviderMappingModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

@Table({ tableName: 'provider_agency_mappings', timestamps: true })
export class ProviderAgencyMappingModel extends BaseProviderMappingModel {
  @Column({ type: DataType.UUID, allowNull: true, field: 'agencyId' })
  declare canonicalId?: string;
}

@Table({ tableName: 'provider_node_mappings', timestamps: true })
export class ProviderNodeMappingModel extends BaseProviderMappingModel {
  @Column({ type: DataType.UUID, allowNull: true, field: 'nodeId' })
  declare canonicalId?: string;
}

@Table({ tableName: 'provider_route_mappings', timestamps: true })
export class ProviderRouteMappingModel extends BaseProviderMappingModel {
  @Column({ type: DataType.UUID, allowNull: true, field: 'routeId' })
  declare canonicalId?: string;
}

@Table({ tableName: 'provider_trip_mappings', timestamps: true })
export class ProviderTripMappingModel extends BaseProviderMappingModel {
  @Column({ type: DataType.UUID, allowNull: true, field: 'tripId' })
  declare canonicalId?: string;
}
