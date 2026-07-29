import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TripEntity } from './trip.entity';
import { StopEntity } from './stop.entity';

@Entity('stop_times')
export class StopTimeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('idx_stop_times_trip_id')
  tripId: string;

  @ManyToOne(() => TripEntity, trip => trip.stopTimes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tripId' })
  trip: TripEntity;

  @Column({ type: 'uuid' })
  @Index('idx_stop_times_stop_id')
  stopId: string;

  @ManyToOne(() => StopEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stopId' })
  stop: StopEntity;

  @Column({ type: 'int' })
  stopSequence: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  arrivalTime: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  departureTime: string;

  @CreateDateColumn()
  createdAt: Date;
}
