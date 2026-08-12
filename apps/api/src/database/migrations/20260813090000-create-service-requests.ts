import { DataTypes } from 'sequelize';
import type { MigrationFn } from '../migrate';

/** create-service-requests — waitlist for states Ratroo does not cover yet. */
export const up: MigrationFn = async ({ context: { queryInterface } }) => {
  await queryInterface.createTable('service_requests', {
    id: { type: DataTypes.UUID, primaryKey: true },
    stateCode: { type: DataTypes.STRING(8), allowNull: false },
    regionName: { type: DataTypes.STRING(120), allowNull: true },
    phone: { type: DataTypes.STRING(32), allowNull: false },
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    city: { type: DataTypes.STRING(120), allowNull: true },
    notified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // One row per person per state: asking twice is the same ask.
  await queryInterface.addIndex('service_requests', ['phone', 'stateCode'], {
    name: 'idx_service_requests_phone_state',
    unique: true,
  });

  await queryInterface.addIndex('service_requests', ['stateCode'], {
    name: 'idx_service_requests_state',
  });
};

export const down: MigrationFn = async ({ context: { queryInterface } }) => {
  await queryInterface.dropTable('service_requests');
};
