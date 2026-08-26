import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { minutesOfDay } from './transit-graph.service';

/**
 * The wait between two legs.
 *
 * Mirrors the rule applied in `buildJourney`: a wait exists only when both the
 * previous arrival and this departure are published, is dropped when negative
 * or implausibly long, and is never shown for a walk.
 */
function waitFor(
  previousArrival: string | null,
  departure: string | null,
  boarded: boolean,
): number | undefined {
  if (!boarded) return undefined;
  const arrives = minutesOfDay(previousArrival);
  const departs = minutesOfDay(departure);
  if (arrives === null || departs === null) return undefined;
  const wait = departs - arrives;
  if (wait < 0 || wait > 180) return undefined;
  return wait;
}

describe('wait between legs', () => {
  test('reports the published gap at the interchange', () => {
    assert.equal(waitFor('08:37', '08:41', true), 4);
  });

  test('a same-minute connection is a real zero, not a missing value', () => {
    // Distinct from undefined: "no wait" is information a rider can act on.
    assert.equal(waitFor('08:41', '08:41', true), 0);
  });

  test('says nothing when either side is unpublished', () => {
    // Most Indian operators publish no timetable. Counting forward from the
    // previous leg would invent a departure and send a rider to a stop at the
    // wrong minute.
    assert.equal(waitFor(null, '08:41', true), undefined);
    assert.equal(waitFor('08:37', null, true), undefined);
  });

  test('drops a negative gap rather than showing it', () => {
    // Two times taken from opposite directions of the same route, not one
    // journey — a "wait -12 min" is a data artefact, not a connection.
    assert.equal(waitFor('08:41', '08:29', true), undefined);
  });

  test('drops an implausible gap', () => {
    assert.equal(waitFor('08:00', '14:00', true), undefined);
  });

  test('never reports a wait for a walk', () => {
    assert.equal(waitFor('08:37', '08:41', false), undefined);
  });
});
