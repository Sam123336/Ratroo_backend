import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'source_observations', timestamps: true })
export class SourceObservationModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.STRING(40), allowNull: false })
  declare providerVersion: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare rawSourceRecordId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare sourceUrl: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare contentHash: string;

  @Column({ type: DataType.DECIMAL(4, 3), allowNull: false, defaultValue: 0 })
  declare confidence: number;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'UNVERIFIED' })
  declare verificationStatus: string;

  @Column({ type: DataType.ARRAY(DataType.STRING), allowNull: false, defaultValue: [] })
  declare warnings: string[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: SourceObservationModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

