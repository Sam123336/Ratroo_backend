import { DataTypes } from 'sequelize';
import type { MigrationFn } from '../migrate';

/** Separates operator submission from admin publication. */
export const up: MigrationFn = async ({ context: { queryInterface } }) => {
  await queryInterface.addColumn('operator_vehicles', 'reviewState', {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'PENDING',
  });
  await queryInterface.addColumn('operator_vehicles', 'reviewNote', {
    type: DataTypes.STRING(400),
    allowNull: true,
  });
  await queryInterface.addColumn('operator_routes', 'reviewNote', {
    type: DataTypes.STRING(400),
    allowNull: true,
  });
};

export const down: MigrationFn = async ({ context: { queryInterface } }) => {
  await queryInterface.removeColumn('operator_routes', 'reviewNote');
  await queryInterface.removeColumn('operator_vehicles', 'reviewNote');
  await queryInterface.removeColumn('operator_vehicles', 'reviewState');
};
