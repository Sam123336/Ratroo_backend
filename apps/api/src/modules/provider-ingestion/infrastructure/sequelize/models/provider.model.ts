import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'providers', timestamps: true })
export class ProviderModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false, unique: true })
  declare code: string;

  @Column({ type: DataType.STRING(160), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(40), allowNull: false })
  declare sourceType: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare website: string;

  @Column({ type: DataType.STRING(40), allowNull: false })
  declare version: string;

  @Column({ type: DataType.ARRAY(DataType.STRING), allowNull: false, defaultValue: [] })
  declare transportModes: string[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: ProviderModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

