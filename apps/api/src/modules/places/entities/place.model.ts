import { Column, DataType, Model, Table, PrimaryKey, Default, IsUUID, ForeignKey, BelongsTo, HasMany, Index, CreatedAt } from 'sequelize-typescript';

export enum PlaceType {
  STOP = 'STOP',
  STATION = 'STATION',
  VILLAGE = 'VILLAGE',
  GRAM_PANCHAYAT = 'GRAM_PANCHAYAT',
  BLOCK = 'BLOCK',
  SUBDIVISION = 'SUBDIVISION',
  DISTRICT = 'DISTRICT',
  STATE = 'STATE',
  OTHER = 'OTHER',
}

@Table({
  tableName: 'places',
  timestamps: true,
  underscored: false,
})
export class PlaceModel extends Model<PlaceModel> {
  @IsUUID(4)
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @Index
  @Column(DataType.STRING)
  canonicalName!: string;

  @Index
  @Column(DataType.STRING)
  normalizedName!: string;

  @Column(DataType.ENUM(...Object.values(PlaceType)))
  type!: PlaceType;

  // Hierarchical Self-References
  @ForeignKey(() => PlaceModel)
  @Column(DataType.UUID)
  stateId!: string | null;

  @ForeignKey(() => PlaceModel)
  @Column(DataType.UUID)
  districtId!: string | null;

  @ForeignKey(() => PlaceModel)
  @Column(DataType.UUID)
  subdivisionId!: string | null;

  @ForeignKey(() => PlaceModel)
  @Column(DataType.UUID)
  blockId!: string | null;

  @ForeignKey(() => PlaceModel)
  @Column(DataType.UUID)
  gramPanchayatId!: string | null;

  @ForeignKey(() => PlaceModel)
  @Column(DataType.UUID)
  villageId!: string | null;

  @Column(DataType.FLOAT)
  latitude!: number | null;

  @Column(DataType.FLOAT)
  longitude!: number | null;

  @Column(DataType.STRING)
  providerSource!: string | null;

  @Column(DataType.STRING)
  coordinateSource!: string | null;

  @Column(DataType.FLOAT)
  coordinateConfidence!: number | null;

  @Column(DataType.DATE)
  coordinateUpdatedAt!: Date | null;

  @Default(0)
  @Column(DataType.FLOAT)
  confidence!: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  verified!: boolean;

  // Relations
  @HasMany(() => PlaceAliasModel)
  aliases!: PlaceAliasModel[];
}

@Table({
  tableName: 'place_aliases',
  timestamps: true,
  underscored: false,
})
export class PlaceAliasModel extends Model<PlaceAliasModel> {
  @IsUUID(4)
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => PlaceModel)
  @Column(DataType.UUID)
  placeId!: string;

  @Column(DataType.STRING)
  providerCode!: string;

  @Column(DataType.STRING)
  alias!: string;

  @Index
  @Column(DataType.STRING)
  normalizedAlias!: string;

  @Default(0)
  @Column(DataType.FLOAT)
  confidence!: number;

  @BelongsTo(() => PlaceModel)
  place!: PlaceModel;
}

@Table({
  tableName: 'place_merge_history',
  timestamps: true,
  underscored: false,
})
export class PlaceMergeHistoryModel extends Model<PlaceMergeHistoryModel> {
  @IsUUID(4)
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id!: string;

  @ForeignKey(() => PlaceModel)
  @Column(DataType.UUID)
  sourcePlaceId!: string;

  @ForeignKey(() => PlaceModel)
  @Column(DataType.UUID)
  targetPlaceId!: string;

  @Column(DataType.STRING)
  reason!: string;

  @Column(DataType.STRING)
  mergedBy!: string;

  @CreatedAt
  @Column(DataType.DATE)
  mergedAt!: Date;

  @BelongsTo(() => PlaceModel, 'sourcePlaceId')
  sourcePlace!: PlaceModel;

  @BelongsTo(() => PlaceModel, 'targetPlaceId')
  targetPlace!: PlaceModel;
}
