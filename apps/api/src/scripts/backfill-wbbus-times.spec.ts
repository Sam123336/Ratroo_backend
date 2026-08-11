import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { toHHMM } from './backfill-wbbus-times';

/**
 * Fixtures only — the two time formats the WBBus page mixes, plus the shapes
 * that must not slip through. A wrong conversion writes a bus into the
 * timetable at the wrong hour.
 */
describe('toHHMM', () => {
  test('converts the formats the page publishes', () => {
    assert.equal(toHHMM('5:30 AM'), '05:30');
    assert.equal(toHHMM('4:10 PM'), '16:10');
    assert.equal(toHHMM('11:59 PM'), '23:59');
  });

  test('midnight is 00 and noon stays 12', () => {
    assert.equal(toHHMM('12:05 AM'), '00:05');
    assert.equal(toHHMM('12:05 PM'), '12:05');
  });

  test('refuses anything it cannot read rather than guessing', () => {
    for (const bad of ['', null, '5:70 AM', 'soon']) {
      assert.equal(toHHMM(bad), null, `expected null for ${JSON.stringify(bad)}`);
    }
  });
});
