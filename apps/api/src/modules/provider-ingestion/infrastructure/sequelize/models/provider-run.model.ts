import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'provider_runs', timestamps: true })
export class ProviderRunModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.STRING(40), allowNull: false })
  declare providerVersion: string;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'PENDING' })
  declare status: string;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'FULL' })
  declare runType: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare checkpoint?: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare metrics: Record<string, unknown>;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare errorMessage?: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: ProviderRunModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

