import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'provider_item_checkpoints', timestamps: true })
export class ProviderItemCheckpointModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare providerRunId: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare externalId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare sourceUrl: string;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'PENDING' })
  declare status: string;

  @Column({ type: DataType.STRING(80), allowNull: true })
  declare contentHash?: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare errorMessage?: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: ProviderItemCheckpointModel): void {
    model.id = ensureUuidV7(model.id);
  }
}
