import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { normaliseTime } from './clean-stop-times';

/**
 * Fixtures only. A wrong conversion here moves a bus by twelve hours, so every
 * format the operators actually publish is pinned.
 */
describe('normaliseTime', () => {
  test('converts 12-hour times', () => {
    assert.equal(normaliseTime('4:25 AM'), '04:25');
    assert.equal(normaliseTime('1:05 PM'), '13:05');
    assert.equal(normaliseTime('11:59 PM'), '23:59');
  });

  test('midnight is 00 and noon stays 12', () => {
    // The two cases a naive "+12 for PM" gets backwards.
    assert.equal(normaliseTime('12:30 AM'), '00:30');
    assert.equal(normaliseTime('12:30 PM'), '12:30');
  });

  test('drops seconds and pads hours', () => {
    assert.equal(normaliseTime('05:55:00'), '05:55');
    assert.equal(normaliseTime('7:30:00'), '07:30');
    assert.equal(normaliseTime('9:05'), '09:05');
    assert.equal(normaliseTime('21:15'), '21:15');
  });

  test('refuses anything it cannot read rather than guessing', () => {
    // A guessed time is worse than no time: it sends a rider to an empty stop.
    for (const bad of [null, '_ _ : _ _', '25:00', '10:75', 'soon']) {
      assert.equal(normaliseTime(bad), null, `expected null for ${bad}`);
    }
  });
});
