import { DataTypes } from 'sequelize';
import type { MigrationFn } from '../migrate';

/**
 * add-coverage-area-boundary
 *
 * Gives `coverage_areas` a polygon, so "which region is this rider in" is a
 * point-in-polygon test instead of "whichever stop nearest them happens to
 * carry a state label".
 *
 * That nearest-stop heuristic is why a rider standing in Bengaluru saw "Bus,
 * ferry, rail and tram across West Bengal": two KOLKATA_TRAM stops named
 * "Central" and "MG Road" — names that exist in both cities — hold Bengaluru
 * coordinates, and before Bengaluru had stops of its own they were the closest
 * labelled stops. One mis-geocoded row could flip the whole home screen.
 *
 * MultiPolygon, not Polygon: a state's coverage is genuinely disjoint (in West
 * Bengal, Darjeeling is not contiguous with Kolkata), and collapsing that into
 * one hull would claim coverage across several hundred km of gap.
 */
export const up: MigrationFn = async ({ context: { queryInterface, sequelize } }) => {
  await sequelize.query(
    `ALTER TABLE coverage_areas
       ADD COLUMN IF NOT EXISTS boundary geometry(MultiPolygon, 4326)`,
  );

  // GIST, because every read of this column is ST_Contains against a point.
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS coverage_areas_boundary_gist
       ON coverage_areas USING GIST (boundary)`,
  );

  // One row per area type per place, so rebuilding is an upsert rather than a
  // delete-and-insert that leaves the table empty if the rebuild fails.
  await sequelize.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS coverage_areas_place_unique
       ON coverage_areas ("countryCode", "stateCode", "areaType", coalesce("cityName", ''))`,
  );

  await queryInterface.addColumn('coverage_areas', 'stopCount', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });

  await queryInterface.addColumn('coverage_areas', 'boundaryBuiltAt', {
    type: DataTypes.DATE,
    allowNull: true,
  });
};

/** Must undo up() exactly — migrate:down relies on it. */
export const down: MigrationFn = async ({ context: { queryInterface, sequelize } }) => {
  await sequelize.query(`DROP INDEX IF EXISTS coverage_areas_place_unique`);
  await sequelize.query(`DROP INDEX IF EXISTS coverage_areas_boundary_gist`);
  await queryInterface.removeColumn('coverage_areas', 'boundaryBuiltAt');
  await queryInterface.removeColumn('coverage_areas', 'stopCount');
  await sequelize.query(`ALTER TABLE coverage_areas DROP COLUMN IF EXISTS boundary`);
};
