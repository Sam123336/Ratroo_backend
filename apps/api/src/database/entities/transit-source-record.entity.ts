import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('transit_source_records')
export class TransitSourceRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  @Index('idx_source_records_provider')
  provider: string;

  @Column({ type: 'varchar', length: 255 })
  externalId: string;

  @Column({ type: 'text', nullable: true })
  sourceUrl: string;

  @Column({ type: 'jsonb' })
  rawData: any;

  @Column({ type: 'varchar', length: 64, nullable: true })
  contentHash: string;

  @CreateDateColumn()
  fetchedAt: Date;

  @Column({ type: 'varchar', length: 50, default: '1.0' })
  parserVersion: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;
}
