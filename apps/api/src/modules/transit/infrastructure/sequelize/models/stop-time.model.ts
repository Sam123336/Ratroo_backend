import {
  BeforeCreate,
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  ForeignKey,
  Index,
  Model,
  Table,
} from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../../../shared/ids/uuid-v7';
import { StopModel } from './stop.model';
import { TripModel } from './trip.model';

@Table({ tableName: 'stop_times', timestamps: false })
export class StopTimeModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Index('idx_stop_times_trip_id')
  @ForeignKey(() => TripModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare tripId: string;

  @BelongsTo(() => TripModel)
  declare trip?: TripModel;

  @Index('idx_stop_times_stop_id')
  @ForeignKey(() => StopModel)
  @Column({ type: DataType.UUID, allowNull: false })
  declare stopId: string;

  @BelongsTo(() => StopModel)
  declare stop?: StopModel;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare stopSequence: number;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare arrivalTime?: string;

  @Column({ type: DataType.STRING(20), allowNull: true })
  declare departureTime?: string;

  /**
   * SCRAPED, INTERPOLATED or OFFICIAL. The column existed but the model did
   * not declare it, so anything writing through the ORM dropped it silently —
   * and an estimate that loses its label becomes indistinguishable from an
   * operator's published time.
   */
  @Column({ type: DataType.STRING(32), allowNull: true })
  declare timeSource?: string;

  @CreatedAt
  declare createdAt: Date;

  @BeforeCreate
  static assignId(model: StopTimeModel): void {
    model.id = ensureUuidV7(model.id);
  }
}

