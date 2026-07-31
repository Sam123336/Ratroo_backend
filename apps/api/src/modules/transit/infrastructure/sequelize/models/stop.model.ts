import { BeforeCreate, Column, CreatedAt, DataType, Index, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'stops', timestamps: true })
export class StopModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  declare name: string;

  @Index('idx_stops_normalized_name')
  @Column({ type: DataType.STRING(255), allowNull: false })
  declare normalizedName: string;

  @Column({ type: DataType.DECIMAL(10, 7), allowNull: true })
  declare latitude?: number;

  @Column({ type: DataType.DECIMAL(10, 7), allowNull: true })
  declare longitude?: number;

  @Index('idx_stops_location')
  @Column({ type: DataType.GEOMETRY('POINT', 4326), allowNull: true })
  declare location?: unknown;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare city?: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare district?: string;

  @Column({ type: DataType.STRING(100), allowNull: true })
  declare state?: string;

  @Column({ type: DataType.STRING(50), allowNull: false })
  declare provider: string;

  @Column({ type: DataType.STRING(255), allowNull: true })
  declare externalId?: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: StopModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

