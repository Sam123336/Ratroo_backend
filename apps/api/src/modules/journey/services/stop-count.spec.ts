import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { PlannedLeg } from './journey-planner.service';

/**
 * Stops travelled per leg.
 *
 * The planner merges consecutive hops on one service into a single leg, so the
 * count has to accumulate during that merge — it is not derivable afterwards,
 * because a merged leg only remembers where it started and where it ended.
 */
function mergeHops(hops: Array<{ routeId?: string }>): PlannedLeg[] {
  const legs: PlannedLeg[] = [];
  for (const hop of hops) {
    const previous = legs[legs.length - 1];
    if (previous && hop.routeId && previous.routeId === hop.routeId) {
      previous.stopCount = (previous.stopCount ?? 1) + 1;
      continue;
    }
    legs.push({
      mode: hop.routeId ? 'BUS' : 'WALK',
      toStop: { id: 'x', placeId: null, name: 'x', lat: 0, lng: 0 },
      distanceKm: 1,
      durationMinutes: 5,
      routeId: hop.routeId,
      stopCount: hop.routeId ? 1 : undefined,
    });
  }
  return legs;
}

describe('stops travelled per leg', () => {
  test('one hop is the very next stop', () => {
    const [leg] = mergeHops([{ routeId: 'r1' }]);
    assert.equal(leg.stopCount, 1);
  });

  test('accumulates across every merged hop of the same service', () => {
    // Board, pass three stops, alight at the fourth.
    const [leg] = mergeHops([{ routeId: 'r1' }, { routeId: 'r1' }, { routeId: 'r1' }, { routeId: 'r1' }]);
    assert.equal(leg.stopCount, 4);
  });

  test('restarts on a change of service', () => {
    const legs = mergeHops([{ routeId: 'r1' }, { routeId: 'r1' }, { routeId: 'r2' }]);
    assert.equal(legs.length, 2);
    assert.equal(legs[0].stopCount, 2);
    assert.equal(legs[1].stopCount, 1);
  });

  test('a walk passes no stops, so it reports none', () => {
    // Zero would read as "get off immediately"; absent reads as "not applicable".
    const [leg] = mergeHops([{}]);
    assert.equal(leg.stopCount, undefined);
  });
});
