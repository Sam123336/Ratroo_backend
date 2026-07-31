import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'canonical_conflicts', timestamps: true })
export class CanonicalConflictModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare entityType: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare providerExternalId?: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare conflictType: string;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'OPEN' })
  declare status: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare details: Record<string, unknown>;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: CanonicalConflictModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

