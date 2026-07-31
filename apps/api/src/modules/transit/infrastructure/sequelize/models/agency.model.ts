import {
  BeforeCreate,
  Column,
  CreatedAt,
  DataType,
  HasMany,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';
import { RouteModel } from './route.model';

@Table({ tableName: 'agencies', timestamps: true })
export class AgencyModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(50), allowNull: false, unique: true })
  declare code: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare state?: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare city?: string;

  @Column({ type: DataType.STRING(100), allowNull: false, defaultValue: 'India' })
  declare country: string;

  @Column({ type: DataType.STRING(50), allowNull: false })
  declare provider: string;

  @HasMany(() => RouteModel)
  declare routes?: RouteModel[];

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: AgencyModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

