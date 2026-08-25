import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { ageInSeconds } from './LiveVehicleService';

describe('BMTC fix timestamps', () => {
  // 16-08-2026 17:55:55 IST === 12:25:55 UTC.
  const noonUtc = Date.UTC(2026, 7, 16, 12, 30, 55);

  test('reads day-first, the way BMTC writes it', () => {
    assert.equal(ageInSeconds('16-08-2026 17:55:55', noonUtc), 300);
  });

  test('does not read an ambiguous date as month-first', () => {
    // `new Date('08-06-2026 …')` reads this as 6 August; BMTC means 8 June.
    // Two months of drift would make a stale fix look fresh.
    const june = Date.UTC(2026, 5, 8, 12, 30, 0);
    assert.equal(ageInSeconds('08-06-2026 18:00:00', june), 0);
  });

  test('reports no age rather than guessing one', () => {
    // A missing or unexpected stamp must not become "0 seconds old", which
    // would draw a stale bus as though it had just reported.
    assert.equal(ageInSeconds(undefined), null);
    assert.equal(ageInSeconds(''), null);
    assert.equal(ageInSeconds('2026-08-16T17:55:55Z'), null);
  });

  test('is positive for the past and grows with staleness', () => {
    const older = ageInSeconds('16-08-2026 17:00:00', noonUtc)!;
    const newer = ageInSeconds('16-08-2026 17:55:55', noonUtc)!;
    assert.ok(older > newer, 'an earlier fix must read as older');
    assert.ok(newer > 0);
  });
});
