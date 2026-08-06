import { BeforeCreate, Column, CreatedAt, DataType, Index, Model, Table } from 'sequelize-typescript';
import { uuidV7 } from '../../../shared/ids/uuid-v7';

// See refresh-token.model.ts — createdAt is managed, updatedAt does not exist.
@Table({ tableName: 'favorites', timestamps: true, updatedAt: false })
export class FavoriteModel extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  declare id: string;

  // Composite unique with routeId — favouriting twice is a no-op, not a duplicate row.
  @Index({ name: 'idx_favorites_user_route', unique: true })
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @Index({ name: 'idx_favorites_user_route', unique: true })
  @Column({ type: DataType.UUID, allowNull: false })
  declare routeId: string;

  @CreatedAt
  declare createdAt: Date;

  @BeforeCreate
  static assignId(instance: FavoriteModel) {
    instance.id ??= uuidV7();
  }
}

export const FAVORITES_SEQUELIZE_MODELS = [FavoriteModel];
