import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Sequelize } from 'sequelize-typescript';
import { BusRouteModel, BusStopTimeModel, BusTripModel } from '../infrastructure/sequelize/models/bus-network.model';
import { fareCoverageSql, timetableCoverageSql } from './data-quality-gate.service';

/**
 * These gates run as raw SQL, so nothing tells them when a model is renamed —
 * the timetable gate spent its whole life querying a column that did not exist,
 * throwing every run, and reporting zero rows as a clean dataset.
 *
 * Registering the models initialises them without opening a connection, which
 * is enough to read the real table and column names back out.
 */
new Sequelize({ dialect: 'postgres', models: [BusRouteModel, BusStopTimeModel, BusTripModel] });

const columns = (model: { getAttributes(): Record<string, unknown> }) => Object.keys(model.getAttributes());

test('timetable gate reads columns that exist, quoted as Postgres needs them', () => {
  const sql = timetableCoverageSql("'WBBUS'");

  assert.ok(columns(BusStopTimeModel).includes('departureTime'));
  assert.ok(columns(BusTripModel).includes('providerCode'));
  assert.equal(BusStopTimeModel.getTableName(), 'bus_stop_times');
  assert.equal(BusTripModel.getTableName(), 'bus_trips');

  assert.match(sql, /FROM bus_stop_times/);
  assert.match(sql, /"departureTime"/);
  // Unquoted camelCase folds to lower case and the query throws.
  assert.doesNotMatch(sql, /[^"]departure_time/);
  // Every other gate is scoped to the provider list; this one must be too.
  assert.match(sql, /"providerCode" IN \('WBBUS'\)/);
});

test('fare gate reads the metadata key estimate-route-fares actually writes', () => {
  const sql = fareCoverageSql("'WBBUS'");

  assert.equal(BusRouteModel.getTableName(), 'bus_routes');
  assert.ok(columns(BusRouteModel).includes('metadata'));
  assert.match(sql, /metadata->>'fareINR'/);
});
