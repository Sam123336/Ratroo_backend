import { BeforeCreate, Column, CreatedAt, DataType, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { uuidV7 } from '../../../shared/ids/uuid-v7';

@Table({ tableName: 'users', timestamps: true })
export class UserModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  // Stored lowercased and trimmed — see AuthService.normalizeEmail.
  @Column({ type: DataType.STRING(320), allowNull: false, unique: true })
  declare email: string;

  /// `scrypt$N$r$p$salt$hash`. Never a plaintext password, never reversible.
  @Column({ type: DataType.STRING(255), allowNull: false })
  declare passwordHash: string;

  @Column({ type: DataType.STRING(120), allowNull: true })
  declare displayName?: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;

  @BeforeCreate
  static assignId(instance: UserModel) {
    instance.id ??= uuidV7();
  }
}
