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
import { TypeOrmAgencyEntity } from './typeorm-agency.entity';
import { TypeOrmTripEntity } from './typeorm-trip.entity';

@Entity('routes')
export class TypeOrmRouteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  agencyId: string;

  @ManyToOne(() => TypeOrmAgencyEntity, agency => agency.routes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agencyId' })
  agency: TypeOrmAgencyEntity;

  @Column({ type: 'varchar', length: 100, nullable: true })
  shortName: string;

  @Column({ type: 'varchar', length: 255 })
  longName: string;

  @Column({ type: 'uuid', nullable: true })
  originStopId: string;

  @Column({ type: 'uuid', nullable: true })
  destinationStopId: string;

  @Column({ type: 'varchar', length: 50, default: 'BUS' })
  routeType: string;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId: string;

  @OneToMany(() => TypeOrmTripEntity, trip => trip.route)
  trips: TypeOrmTripEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
