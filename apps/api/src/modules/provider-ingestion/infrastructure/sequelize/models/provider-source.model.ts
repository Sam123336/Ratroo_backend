import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'provider_sources', timestamps: true })
export class ProviderSourceModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare sourceUrl: string;

  @Column({ type: DataType.STRING(80), allowNull: false, defaultValue: 'DISCOVERY' })
  declare sourceRole: string;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'ACTIVE' })
  declare status: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare metadata: Record<string, unknown>;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: ProviderSourceModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

