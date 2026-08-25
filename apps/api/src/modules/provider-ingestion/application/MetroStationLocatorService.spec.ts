import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { matchStations, normalizeStationName, distanceKm, stopAliases } from './MetroStationLocatorService';

const station = (name: string) => ({ externalId: `x-${name}`, name });
const stop = (name: string, latitude: number, longitude: number) => ({ name, latitude, longitude });

describe('metro station name normalisation', () => {
  test('bridges the two sources naming conventions', () => {
    // BMRCL writes "Indiranagar"; BMTC writes "Indiranagar Bus Stop".
    assert.equal(normalizeStationName('Indiranagar'), normalizeStationName('Indiranagar Bus Stop'));
    assert.equal(normalizeStationName('Trinity'), normalizeStationName('Trinity Metro Station'));
    assert.equal(normalizeStationName('K.R. Pura'), 'k r pura');
  });

  test('does not collapse genuinely different places', () => {
    assert.notEqual(normalizeStationName('Baiyappanahalli'), normalizeStationName('Old Baiyappanahalli'));
    assert.notEqual(normalizeStationName('Whitefield'), normalizeStationName('Whitefiled ACP Police'));
  });
});

describe('matching stations to stops', () => {
  test('locates a station from an unambiguous stop of the same name', () => {
    const report = matchStations([station('Trinity')], [stop('Trinity', 12.9732, 77.6168)]);

    assert.equal(report.located.length, 1);
    assert.equal(report.located[0].latitude, 12.9732);
    // Provenance travels with it — a derived coordinate must stay auditable.
    assert.deepEqual(report.located[0].sourceStops, ['Trinity']);
  });

  test('averages a tight cluster of same-named stops', () => {
    // Several boarding points for one place: the centroid is within metres.
    const report = matchStations(
      [station('Garudacharpalya')],
      [stop('Garudacharpalya', 12.994, 77.7016), stop('Garudacharpalya', 12.9942, 77.7018)],
    );

    assert.equal(report.located.length, 1);
    assert.ok(Math.abs(report.located[0].latitude - 12.9941) < 1e-4);
    assert.ok(report.located[0].spreadKm < 0.05);
  });

  test('refuses a spread-out cluster instead of averaging it', () => {
    // Real case: "Hosahalli" matches ten BMTC stops across 49 km. The mean of
    // those is a field, and writing it would look exactly like a surveyed
    // position to everything downstream.
    const report = matchStations(
      [station('Hosahalli')],
      [stop('Hosahalli', 12.97, 77.54), stop('Hosahalli', 13.35, 77.9)],
    );

    assert.equal(report.located.length, 0);
    assert.equal(report.ambiguous.length, 1);
    assert.ok(report.ambiguous[0].spreadKm > 40);
  });

  test('leaves a station unmatched rather than accepting a near miss', () => {
    // The only BMTC stop resembling Whitefield is a misspelt police station,
    // and the only one resembling Baiyappanahalli is a different stop.
    const report = matchStations(
      [station('Whitefield'), station('Baiyappanahalli')],
      [stop('Whitefiled ACP Police Station', 12.97, 77.75), stop('Old Baiyappanahalli', 12.99, 77.65)],
    );

    assert.equal(report.located.length, 0);
    assert.deepEqual(report.unmatched, ['Whitefield', 'Baiyappanahalli']);
  });

  test('every station lands in exactly one bucket', () => {
    const stations = ['Trinity', 'Hosahalli', 'Whitefield'].map(station);
    const stops = [
      stop('Trinity', 12.9732, 77.6168),
      stop('Hosahalli', 12.97, 77.54),
      stop('Hosahalli', 13.35, 77.9),
    ];
    const report = matchStations(stations, stops);

    assert.equal(
      report.located.length + report.ambiguous.length + report.unmatched.length,
      stations.length,
    );
  });
});

describe('distance', () => {
  test('measures a known Bengaluru span', () => {
    // Majestic to Indiranagar is roughly 6 km.
    const km = distanceKm(12.9767, 77.5713, 12.9784, 77.6408);
    assert.ok(km > 7 && km < 8, `expected ~7.5 km, got ${km.toFixed(2)}`);
  });
});

describe('bracketed aliases', () => {
  test('reads the operator own alternative names', () => {
    // BMTC's actual spelling for the Purple/Green interchange.
    assert.deepEqual(
      stopAliases('Kempegowda Bus Station(Majestic/KBS)'),
      ['Kempegowda Bus Station(Majestic/KBS)', 'Majestic', 'KBS'],
    );
  });

  test('recovers Majestic, which no exact name reaches', () => {
    const report = matchStations(
      [station('Majestic')],
      [stop('Kempegowda Bus Station(Majestic/KBS)', 12.9779, 77.5739)],
    );

    assert.equal(report.located.length, 1);
    assert.equal(report.located[0].viaAlias, true, 'must be recorded as an alias match');
  });

  test('an alias never displaces a clean exact match', () => {
    // Aliases widen every bucket, so applied everywhere they turn good matches
    // ambiguous. The exact hit must win and the alias pass must not even run.
    const report = matchStations(
      [station('Trinity')],
      [stop('Trinity', 12.9732, 77.6168), stop('Somewhere Else(Trinity)', 13.4, 77.9)],
    );

    assert.equal(report.located.length, 1);
    assert.equal(report.located[0].viaAlias, false);
    assert.equal(report.located[0].latitude, 12.9732);
  });
});
