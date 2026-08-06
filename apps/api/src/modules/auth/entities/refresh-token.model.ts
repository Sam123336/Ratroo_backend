import { BeforeCreate, Column, CreatedAt, DataType, Index, Model, Table } from 'sequelize-typescript';
import { uuidV7 } from '../../../shared/ids/uuid-v7';

/**
 * One row per issued refresh token.
 *
 * Only the SHA-256 of the token is stored: a database leak must not hand an
 * attacker usable tokens. Rows are kept after revocation so a replayed token can
 * be recognised as stolen rather than merely unknown.
 */
// timestamps + updatedAt:false — Sequelize fills createdAt, and there is no
// updatedAt column. Plain `timestamps: false` leaves createdAt null and the
// NOT NULL constraint rejects the insert.
@Table({ tableName: 'refresh_tokens', timestamps: true, updatedAt: false })
export class RefreshTokenModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  @Index('idx_refresh_tokens_user')
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Index({ name: 'idx_refresh_tokens_hash', unique: true })
  @Column({ type: DataType.STRING(64), allowNull: false })
  declare tokenHash: string;

  @Column({ type: DataType.DATE, allowNull: false })
  declare expiresAt: Date;

  /// Set when rotated or logged out. A token presented after this is a replay.
  @Column({ type: DataType.DATE, allowNull: true })
  declare revokedAt?: Date;

  @CreatedAt
  declare createdAt: Date;

  @BeforeCreate
  static assignId(instance: RefreshTokenModel) {
    instance.id ??= uuidV7();
  }
}
