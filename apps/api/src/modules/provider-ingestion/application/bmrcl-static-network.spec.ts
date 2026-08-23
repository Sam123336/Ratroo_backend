import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { BmrclStaticNetworkParser } from './bmrcl-static-network';

/**
 * The fallback used to hardcode Yellow Line to UNKNOWN and the rest to ACTIVE,
 * so a line that opened stayed wrong until someone edited this file. Status now
 * comes from the fetched page, and these pin the three answers that matter:
 * what it says, what it does not say, and what it says twice over.
 */
function page(body: string) {
  return [
    {
      sourceKind: 'NETWORK' as const,
      url: 'https://english.bmrc.co.in/',
      html: `<html><body>BMRCL Namma Metro. ${body}</body></html>`,
      fetchedAt: '2026-08-23T00:00:00.000Z',
      contentHash: 'hash',
      rawRecordId: 'raw-1',
    },
  ];
}

const statusOf = (body: string, lineName: string) =>
  new BmrclStaticNetworkParser().parse(page(body)).lines.find(line => line.name === lineName)?.operationalStatus;

describe('BMRCL line status', () => {
  test('a line the source calls operational is ACTIVE', () => {
    const body = 'The Yellow Line is operational between RV Road and Bommasandra.';
    assert.equal(statusOf(body, 'Yellow Line'), 'ACTIVE');
  });

  test('a line the source calls under construction is not reported as running', () => {
    assert.equal(statusOf('Work on the Yellow Line is under construction.', 'Yellow Line'), 'UNDER_CONSTRUCTION');
  });

  test('a future promise is not read as a running service', () => {
    assert.equal(statusOf('The Yellow Line is planned to be operational soon.', 'Yellow Line'), 'PLANNED');
  });

  test('silence about a line is UNKNOWN, not ACTIVE', () => {
    // The old ternary asserted ACTIVE here for every line except Yellow.
    assert.equal(statusOf('Green Line runs to Silk Institute.', 'Purple Line'), 'UNKNOWN');
  });

  test('a source contradicting itself leaves the line UNKNOWN and says why', () => {
    const body =
      'The Green Line is operational today. ' +
      `${'x'.repeat(400)} ` +
      'The Green Line extension remains under construction.';
    const parsed = new BmrclStaticNetworkParser().parse(page(body));

    assert.equal(parsed.lines.find(line => line.name === 'Green Line')?.operationalStatus, 'UNKNOWN');
    assert.ok(parsed.warnings.some(warning => warning.includes('Green Line') && warning.includes('UNKNOWN')));
  });

  test('a distant phrase does not decide a status', () => {
    // "under construction" here belongs to whatever the filler describes.
    const body = `Yellow Line stations are listed. ${'x'.repeat(400)} under construction`;
    assert.equal(statusOf(body, 'Yellow Line'), 'UNKNOWN');
  });
});
