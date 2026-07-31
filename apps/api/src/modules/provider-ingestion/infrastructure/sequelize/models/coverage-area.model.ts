import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'coverage_areas', timestamps: true })
export class CoverageAreaModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(2), allowNull: false })
  declare countryCode: string;

  @Column({ type: DataType.STRING(16), allowNull: true })
  declare stateCode?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare stateName?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare districtName?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare cityName?: string;

  @Column({ type: DataType.STRING(40), allowNull: false })
  declare areaType: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare slug: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare metadata: Record<string, unknown>;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: CoverageAreaModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

function coverageMappingModel(tableName: string, ownerColumnName: string) {
  @Table({ tableName, modelName: tableName, timestamps: true })
  class CoverageMappingModel extends Model {
    @Column({ type: DataType.UUID, primaryKey: true })
    declare id: string;

    @Column({ type: DataType.UUID, allowNull: false, field: ownerColumnName })
    declare ownerId: string;

    @Column({ type: DataType.UUID, allowNull: false })
    declare coverageAreaId: string;

    @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'SERVES' })
    declare relationshipType: string;

    @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
    declare metadata: Record<string, unknown>;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;

    @BeforeCreate
    static assignId(model: CoverageMappingModel): void {
      model.id = ensureUuidV7(model.id);
    }
  }

  return CoverageMappingModel;
}

export const ProviderCoverageAreaModel = coverageMappingModel('provider_coverage_areas', 'providerId');
export const RouteCoverageAreaModel = coverageMappingModel('route_coverage_areas', 'routeId');
export const DatasetCoverageAreaModel = coverageMappingModel('dataset_coverage_areas', 'datasetId');
