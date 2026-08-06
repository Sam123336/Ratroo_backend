import { DataTypes } from 'sequelize';
import type { MigrationFn } from '../migrate';

/** create-auth-tables — users, refresh_tokens, favorites */
export const up: MigrationFn = async ({ context: { queryInterface } }) => {
  await queryInterface.createTable('users', {
    id: { type: DataTypes.UUID, primaryKey: true },
    email: { type: DataTypes.STRING(320), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    displayName: { type: DataTypes.STRING(120), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.createTable('refresh_tokens', {
    id: { type: DataTypes.UUID, primaryKey: true },
    // Deleting a user must not strand their tokens.
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('refresh_tokens', ['userId'], { name: 'idx_refresh_tokens_user' });

  await queryInterface.createTable('favorites', {
    id: { type: DataTypes.UUID, primaryKey: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    routeId: { type: DataTypes.UUID, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // Enforces "favourite once" in the database, not just in application code.
  await queryInterface.addIndex('favorites', ['userId', 'routeId'], {
    name: 'idx_favorites_user_route',
    unique: true,
  });
};

/** Must undo up() exactly — migrate:down relies on it. */
export const down: MigrationFn = async ({ context: { queryInterface } }) => {
  // Reverse order: refresh_tokens and favorites reference users.
  await queryInterface.dropTable('favorites');
  await queryInterface.dropTable('refresh_tokens');
  await queryInterface.dropTable('users');
};
