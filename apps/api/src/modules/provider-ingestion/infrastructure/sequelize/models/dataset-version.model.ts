import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'dataset_versions', timestamps: true })
export class DatasetVersionModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare datasetId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare providerRunId: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare contentHash: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare validationSummary: Record<string, unknown>;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'DISCOVERING' })
  declare status: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: DatasetVersionModel): void {
    model.id = ensureUuidV7(model.id);
  }
}
