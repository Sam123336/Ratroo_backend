import { BeforeCreate, Column, CreatedAt, DataType, Index, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'raw_source_records', timestamps: true })
export class RawSourceRecordModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Index('idx_raw_source_records_provider')
  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare providerRunId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare sourceUrl: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare contentHash: string;

  @Column({ type: DataType.STRING(120), allowNull: true })
  declare contentType?: string;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare statusCode?: number;

  @Column({ type: DataType.JSONB, allowNull: false })
  declare rawPayload: unknown;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare metadata: Record<string, unknown>;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'RAW_SAVED' })
  declare status: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare fetchedAt: Date;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: RawSourceRecordModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

