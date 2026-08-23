import { DataTypes } from 'sequelize';
import type { MigrationFn } from '../migrate';

export const up: MigrationFn = async ({ context: { queryInterface } }) => {
  await queryInterface.createTable('oauth_identities', {
    id: { type: DataTypes.UUID, primaryKey: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    provider: { type: DataTypes.STRING(40), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
  await queryInterface.addIndex('oauth_identities', ['userId'], { name: 'idx_oauth_identities_user' });
  await queryInterface.addIndex('oauth_identities', ['provider', 'subject'], { name: 'uq_oauth_provider_subject', unique: true });
};

export const down: MigrationFn = async ({ context: { queryInterface } }) => {
  await queryInterface.dropTable('oauth_identities');
};
