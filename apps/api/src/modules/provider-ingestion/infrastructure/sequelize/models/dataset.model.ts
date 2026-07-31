import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'datasets', timestamps: true })
export class DatasetModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.STRING(160), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'DRAFT' })
  declare status: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: DatasetModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

