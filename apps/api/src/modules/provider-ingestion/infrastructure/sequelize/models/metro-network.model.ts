import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';

@Table({ tableName: 'metro_lines', timestamps: true })
export class MetroLineModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare externalId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(40), allowNull: true })
  declare color?: string;

  @Column({ type: DataType.STRING(40), allowNull: false, defaultValue: 'UNKNOWN' })
  declare operationalStatus: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: MetroLineModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

@Table({ tableName: 'metro_stations', timestamps: true })
export class MetroStationModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.STRING(80), allowNull: false })
  declare providerCode: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare externalId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  declare normalizedName: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isInterchange: boolean;

  @Column({ type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare metadata: Record<string, unknown>;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: MetroStationModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

@Table({ tableName: 'metro_line_stations', timestamps: true })
export class MetroLineStationModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare lineId: string;

  @Column({ type: DataType.UUID, allowNull: false })
  declare stationId: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare sequence: number;

  @Column({ type: DataType.UUID, allowNull: false })
  declare datasetVersionId: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(model: MetroLineStationModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

