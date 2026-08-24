import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { firstMileLeg } from './journey-planner.service';
import { GraphStop } from './transit-graph.service';

/**
 * The mile at each end of a journey — reaching the first stop, and leaving the
 * last one. Needs no graph and no network, so it is tested directly rather
 * than through a planned journey.
 */
const stop: GraphStop = {
  id: 'kasavanahalli',
  placeId: 'kasavanahalli',
  name: 'Kasavanahalli',
  lat: 12.9081,
  lng: 77.6476,
};

describe('first and last mile', () => {
  test('recommends walking when the stop is close', () => {
    // The real Kasavanahalli stop is 373 m from the rider in the screenshot.
    const leg = firstMileLeg(373, { toStop: stop });

    assert.equal(leg.mode, 'WALK');
    assert.equal(leg.options!.find(option => option.recommended)?.mode, 'WALK');
    // The ride is still listed — someone with luggage or a late connection
    // should be able to see it rather than be told to walk.
    assert.ok(leg.options!.some(option => option.mode === 'AUTO'));
  });

  test('recommends a ride when the stop is 5 km away', () => {
    // 5 km is the access-radius ceiling, and 5 km at 4.5 km/h is 67 minutes.
    // Presenting that as the only way to reach the first stop is what made the
    // plan unusable.
    const leg = firstMileLeg(5000, { toStop: stop });

    assert.equal(leg.mode, 'AUTO');
    const recommended = leg.options!.find(option => option.recommended)!;
    assert.equal(recommended.mode, 'AUTO');
    assert.ok(recommended.durationMinutes < 25, 'the ride must clearly beat the walk');

    const walk = leg.options!.find(option => option.mode === 'WALK')!;
    assert.ok(walk.durationMinutes > 60, 'the walk is still reported honestly');
    assert.equal(walk.recommended, false);
    // The leg reports the recommendation, not the walk.
    assert.equal(leg.durationMinutes, recommended.durationMinutes);
  });

  test('names apps a rider already has, and quotes no fare', () => {
    const auto = firstMileLeg(5000, { toStop: stop }).options!
      .find(option => option.mode === 'AUTO')!;

    assert.match(auto.label, /Rapido/);
    // Ratroo has no fare feed for Rapido, Ola, Uber or a metered auto, so no
    // number is quoted. Every option is a distance-over-speed estimate.
    assert.equal((auto as unknown as Record<string, unknown>).fareINR, undefined);
    assert.equal(auto.isEstimate, true);
  });

  test('exactly one option is recommended, either side of the threshold', () => {
    for (const metres of [100, 1199, 1200, 1201, 5000]) {
      const recommended = firstMileLeg(metres, { toStop: stop })
        .options!.filter(option => option.recommended);
      assert.equal(recommended.length, 1, `${metres} m recommended ${recommended.length}`);
    }
  });

  test('carries both ends through, so the egress leg keeps its origin stop', () => {
    const leg = firstMileLeg(800, { fromStop: stop, toStop: stop });
    assert.equal(leg.fromStop?.id, 'kasavanahalli');
    assert.equal(leg.distanceKm, 0.8);
  });
});
