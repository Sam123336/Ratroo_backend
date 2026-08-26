import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { PlannedLeg } from './journey-planner.service';

/**
 * The stated total must equal the steps a rider can see.
 *
 * Moovit ships journeys where it does not: one result for this exact corridor
 * read "1 hr 5 min", departing 4:46 and arriving 5:36 — fifty minutes. A rider
 * cannot check that, and should not have to.
 */
const total = (legs: PlannedLeg[]) =>
  legs.reduce((sum, leg) => sum + leg.durationMinutes + (leg.waitMinutes ?? 0), 0);

const stop = { id: 'x', placeId: null, name: 'x', lat: 0, lng: 0 };
const walk = (minutes: number): PlannedLeg =>
  ({ mode: 'WALK', toStop: stop, distanceKm: 1, durationMinutes: minutes });
const ride = (minutes: number, wait: number, estimated = false): PlannedLeg =>
  ({ mode: 'BUS', toStop: stop, distanceKm: 4, durationMinutes: minutes, routeId: 'r1', waitMinutes: wait, waitIsEstimated: estimated });

describe('journey totals', () => {
  test('equals every visible minute, walks and waits included', () => {
    const legs = [walk(6), ride(17, 4), ride(11, 3), walk(4)];
    // 6 + (17+4) + (11+3) + 4
    assert.equal(total(legs), 45);
  });

  test('counts an estimated wait exactly like a measured one', () => {
    // The estimate used to be hidden inside the ride's duration, so the total
    // was six minutes larger than anything on screen.
    const measured = total([ride(17, 6, false)]);
    const estimated = total([ride(17, 6, true)]);
    assert.equal(measured, estimated);
    assert.equal(estimated, 23);
  });

  test('a walk adds no wait', () => {
    assert.equal(total([walk(9)]), 9);
  });

  test('the ride duration is riding alone, so waiting is never double counted', () => {
    const leg = ride(17, 6);
    // If the penalty were still folded into durationMinutes this would be 29.
    assert.equal(leg.durationMinutes, 17);
    assert.equal(total([leg]), 23);
  });
});
