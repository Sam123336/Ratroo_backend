import { DataTypes } from 'sequelize';
import type { MigrationFn } from '../migrate';

/**
 * add-stop-time-source
 *
 * Marks where a stop time came from. Interpolated times are estimates and must
 * never be presented with the same confidence as a time scraped from the
 * operator — this column is what lets the API and UI tell them apart.
 */
export const up: MigrationFn = async ({ context: { queryInterface, sequelize } }) => {
  for (const table of ['bus_stop_times', 'stop_times']) {
    await queryInterface.addColumn(table, 'timeSource', {
      type: DataTypes.STRING(16),
      allowNull: true,
    });
  }

  // Everything that already has a time came from a provider page.
  await sequelize.query(
    `UPDATE bus_stop_times SET "timeSource" = 'SCRAPED' WHERE "arrivalTime" IS NOT NULL`,
  );
  await sequelize.query(
    `UPDATE stop_times SET "timeSource" = 'SCRAPED' WHERE "arrivalTime" IS NOT NULL`,
  );
};

/** Must undo up() exactly — migrate:down relies on it. */
export const down: MigrationFn = async ({ context: { queryInterface } }) => {
  await queryInterface.removeColumn('bus_stop_times', 'timeSource');
  await queryInterface.removeColumn('stop_times', 'timeSource');
};
