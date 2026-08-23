import { BeforeCreate, Column, CreatedAt, DataType, Index, Model, Table } from 'sequelize-typescript';
import { uuidV7 } from '../../../shared/ids/uuid-v7';

@Table({ tableName: 'oauth_identities', timestamps: true, updatedAt: false })
export class OAuthIdentityModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Index('idx_oauth_identities_user')
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Index({ name: 'uq_oauth_provider_subject', unique: true })
  @Column({ type: DataType.STRING(40), allowNull: false })
  declare provider: string;

  @Index({ name: 'uq_oauth_provider_subject', unique: true })
  @Column({ type: DataType.STRING(255), allowNull: false })
  declare subject: string;

  @CreatedAt
  declare createdAt: Date;

  @BeforeCreate
  static assignId(instance: OAuthIdentityModel) {
    instance.id ??= uuidV7();
  }
}
