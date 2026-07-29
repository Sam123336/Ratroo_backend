import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { TypeOrmRouteEntity } from './typeorm-route.entity';
import { TypeOrmStopTimeEntity } from './typeorm-stop-time.entity';

@Entity('trips')
export class TypeOrmTripEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  routeId: string;

  @ManyToOne(() => TypeOrmRouteEntity, route => route.trips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routeId' })
  route: TypeOrmRouteEntity;

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

  @OneToMany(() => TypeOrmStopTimeEntity, stopTime => stopTime.trip)
  stopTimes: TypeOrmStopTimeEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
