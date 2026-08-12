import { DataTypes } from 'sequelize';
import type { MigrationFn } from '../migrate';

/**
 * create-operator-tables — first-party operators, their fleet and their routes.
 *
 * Separate from `routes`/`stops` on purpose: this is what an operator submits.
 * It becomes rider-facing only by going through the same staging and promotion
 * every scraped provider uses.
 */
export const up: MigrationFn = async ({ context: { queryInterface } }) => {
  await queryInterface.createTable('operators', {
    id: { type: DataTypes.UUID, primaryKey: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    name: { type: DataTypes.STRING(160), allowNull: false },
    legalName: { type: DataTypes.STRING(200), allowNull: true },
    contactEmail: { type: DataTypes.STRING(160), allowNull: true },
    contactPhone: { type: DataTypes.STRING(32), allowNull: true },
    providerCode: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'PENDING' },
    reviewNote: { type: DataTypes.STRING(400), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // One operator per account, enforced by the database rather than only by the
  // service — a second registration is a data error, not a race to lose.
  await queryInterface.addIndex('operators', ['userId'], {
    name: 'idx_operators_user',
    unique: true,
  });

  await queryInterface.createTable('operator_vehicles', {
    id: { type: DataTypes.UUID, primaryKey: true },
    operatorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'operators', key: 'id' },
      onDelete: 'CASCADE',
    },
    registrationNumber: { type: DataTypes.STRING(32), allowNull: false },
    vehicleType: { type: DataTypes.STRING(16), allowNull: false },
    displayName: { type: DataTypes.STRING(120), allowNull: true },
    seatCapacity: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  // Unique per operator, not globally: two businesses can legitimately hold
  // records for the same second-hand vehicle at different times.
  await queryInterface.addIndex('operator_vehicles', ['operatorId', 'registrationNumber'], {
    name: 'idx_operator_vehicles_reg',
    unique: true,
  });

  await queryInterface.createTable('operator_routes', {
    id: { type: DataTypes.UUID, primaryKey: true },
    operatorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'operators', key: 'id' },
      onDelete: 'CASCADE',
    },
    // A scrapped vehicle must not delete the route it used to run.
    vehicleId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'operator_vehicles', key: 'id' },
      onDelete: 'SET NULL',
    },
    name: { type: DataTypes.STRING(200), allowNull: false },
    vehicleType: { type: DataTypes.STRING(16), allowNull: false },
    publishState: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'DRAFT' },
    fareINR: { type: DataTypes.INTEGER, allowNull: true },
    operatingDays: { type: DataTypes.ARRAY(DataTypes.INTEGER), allowNull: true },
    notes: { type: DataTypes.STRING(500), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('operator_routes', ['operatorId'], {
    name: 'idx_operator_routes_operator',
  });

  await queryInterface.createTable('operator_route_stops', {
    id: { type: DataTypes.UUID, primaryKey: true },
    operatorRouteId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'operator_routes', key: 'id' },
      onDelete: 'CASCADE',
    },
    sequence: { type: DataTypes.INTEGER, allowNull: false },
    stopName: { type: DataTypes.STRING(200), allowNull: false },
    latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    placeId: { type: DataTypes.UUID, allowNull: true },
    departureTime: { type: DataTypes.STRING(5), allowNull: true },
    fareFromOriginINR: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });

  await queryInterface.addIndex('operator_route_stops', ['operatorRouteId', 'sequence'], {
    name: 'idx_operator_route_stops_seq',
    unique: true,
  });
};

export const down: MigrationFn = async ({ context: { queryInterface } }) => {
  // Children first: the foreign keys forbid any other order.
  await queryInterface.dropTable('operator_route_stops');
  await queryInterface.dropTable('operator_routes');
  await queryInterface.dropTable('operator_vehicles');
  await queryInterface.dropTable('operators');
};
