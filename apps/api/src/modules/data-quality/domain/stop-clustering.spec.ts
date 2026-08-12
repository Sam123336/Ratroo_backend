import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { StopRow, clusterStops, nameKey } from './stop-clustering';

/**
 * Every literal in this file is a fixture — an input invented to exercise the
 * clustering rules. None of it is transit data, none of it is read by the app,
 * and none of it reaches a rider. Fixtures belong here and nowhere else.
 */
function stop(
  id: string,
  name: string,
  lat: number | null,
  lon: number | null,
  serviceCount = 0,
  state: string | null = 'WB',
): StopRow {
  return {
    id,
    name,
    latitude: lat === null ? null : String(lat),
    longitude: lon === null ? null : String(lon),
    state,
    provider: 'WBBUS',
    serviceCount,
  };
}

describe('nameKey', () => {
  test('ignores case and punctuation', () => {
    assert.equal(nameKey('C.R. Ave'), nameKey('CR AVE'));
    assert.equal(nameKey('Kolkata'), 'kolkata');
  });
});

describe('clusterStops', () => {
  test('the same stand under different casing collapses to one cluster', () => {
    const clusters = clusterStops([
      stop('a', 'KOLKATA', 22.5726, 88.3639, 40),
      stop('b', 'Kolkata', 22.5735, 88.3639, 5),
      stop('c', 'Kolkata', 22.5727, 88.3641, 2),
    ]);

    assert.equal(clusters.length, 1);
    // The busiest row survives: it already carries the most references, so
    // choosing it moves the fewest rows.
    assert.equal(clusters[0].survivor.id, 'a');
    assert.equal(clusters[0].absorbed.length, 2);
  });

  test('namesakes far apart are never merged', () => {
    // Operators name stops after the locality, so "Bazar" occurs all over West
    // Bengal. Merging two of those would hide a real stop and its services.
    const clusters = clusterStops([
      stop('a', 'Bazar', 22.5726, 88.3639, 10),
      stop('b', 'Bazar', 22.61, 88.3639, 10),
    ]);

    assert.equal(clusters.length, 0);
  });

  test('different names at the same point stay separate', () => {
    const clusters = clusterStops([
      stop('a', 'BB Ganguly Xing', 22.5726, 88.3639, 3),
      stop('b', 'BB Ganguly St.', 22.5726, 88.3639, 3),
    ]);

    assert.equal(clusters.length, 0);
  });

  test('stops without coordinates are left alone', () => {
    // Number(null) is 0, which is finite and sits in the Gulf of Guinea. Before
    // the null check every uncoordinated stop clustered with every other one.
    const clusters = clusterStops([
      stop('a', 'Kolkata', null, null, 1),
      stop('b', 'Kolkata', null, null, 1),
    ]);

    assert.equal(clusters.length, 0);
  });

  test('stops in different states are never merged', () => {
    const clusters = clusterStops([
      stop('a', 'Bazar', 22.5726, 88.3639, 5, 'WB'),
      stop('b', 'Bazar', 22.5727, 88.364, 5, 'KA'),
    ]);

    assert.equal(clusters.length, 0);
  });

  test('clusters measure from the survivor, not a drifting centroid', () => {
    // b is ~133 m from a; c is ~133 m from b but ~267 m from a. Only a and b
    // merge — a chain of near-neighbours must not walk a cluster across the map.
    const clusters = clusterStops([
      stop('a', 'Ghat', 22.5726, 88.3639, 9),
      stop('b', 'Ghat', 22.5738, 88.3639, 8),
      stop('c', 'Ghat', 22.575, 88.3639, 7),
    ]);

    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].absorbed.length, 1);
    assert.equal(clusters[0].absorbed[0].id, 'b');
  });
});
