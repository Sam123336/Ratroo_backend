import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { AgencyEntity } from './agency.entity';
import { TripEntity } from './trip.entity';

@Entity('routes')
export class RouteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  agencyId: string;

  @ManyToOne(() => AgencyEntity, agency => agency.routes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agencyId' })
  agency: AgencyEntity;

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

  @OneToMany(() => TripEntity, trip => trip.route)
  trips: TripEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
