import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { RouteEntity } from './route.entity';
import { StopTimeEntity } from './stop-time.entity';

@Entity('trips')
export class TripEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  routeId: string;

  @ManyToOne(() => RouteEntity, route => route.trips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routeId' })
  route: RouteEntity;

  @Column({ type: 'varchar', length: 10, default: 'UP' })
  direction: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  serviceId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  vehicleName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  vehicleRegistration: string;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId: string;

  @OneToMany(() => StopTimeEntity, stopTime => stopTime.trip)
  stopTimes: StopTimeEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
