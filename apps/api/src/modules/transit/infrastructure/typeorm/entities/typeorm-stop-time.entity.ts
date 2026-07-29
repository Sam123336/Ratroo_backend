import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TypeOrmTripEntity } from './typeorm-trip.entity';
import { TypeOrmStopEntity } from './typeorm-stop.entity';

@Entity('stop_times')
export class TypeOrmStopTimeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index('idx_stop_times_trip_id')
  tripId: string;

  @ManyToOne(() => TypeOrmTripEntity, trip => trip.stopTimes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tripId' })
  trip: TypeOrmTripEntity;

  @Column({ type: 'uuid' })
  @Index('idx_stop_times_stop_id')
  stopId: string;

  @ManyToOne(() => TypeOrmStopEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'stopId' })
  stop: TypeOrmStopEntity;

  @Column({ type: 'int' })
  stopSequence: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  arrivalTime: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  departureTime: string;

  @CreateDateColumn()
  createdAt: Date;
}
