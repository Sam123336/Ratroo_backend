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

  test('the page overrides the maintained status when the two disagree', () => {
    // Purple Line is maintained ACTIVE; the page here says otherwise and wins.
    const parsed = new BmrclStaticNetworkParser().parse(page('The Purple Line is under construction.'));

    assert.equal(parsed.lines.find(line => line.name === 'Purple Line')?.operationalStatus, 'UNDER_CONSTRUCTION');
    assert.ok(parsed.warnings.some(w => w.includes('Purple Line') && w.includes('update the list')));
  });

  test('silence falls back to the maintained status and records that it did', () => {
    const parsed = new BmrclStaticNetworkParser().parse(page('Green Line runs to Silk Institute.'));

    // BMRCL rarely states this in prose the parser can reach, and reporting a
    // running metro as UNKNOWN forever is the worse of the two failures.
    assert.equal(parsed.lines.find(line => line.name === 'Purple Line')?.operationalStatus, 'ACTIVE');
    assert.ok(
      parsed.warnings.some(w => w.includes('Purple Line') && w.includes('maintained status') && w.includes('checked')),
      'the maintained claim must be auditable in the warnings',
    );
  });

  test('a source contradicting itself does not decide, and falls back', () => {
    const body =
      'The Green Line is operational today. ' +
      `${'x'.repeat(400)} ` +
      'The Green Line extension remains under construction.';
    const parsed = new BmrclStaticNetworkParser().parse(page(body));
    const green = parsed.lines.find(line => line.name === 'Green Line');

    assert.equal(green?.operationalStatus, 'ACTIVE');
    assert.ok(parsed.warnings.some(w => w.includes('Green Line') && w.includes('maintained status')));
  });

  test('a distant phrase does not decide a status', () => {
    // "under construction" here belongs to whatever the filler describes, so it
    // must not override the maintained ACTIVE.
    const body = `Yellow Line stations are listed. ${'x'.repeat(400)} under construction`;
    assert.equal(statusOf(body, 'Yellow Line'), 'ACTIVE');
  });

  test('Yellow Line is not reported as unknown while it is running', () => {
    // The regression this whole change exists to prevent.
    assert.equal(statusOf('Namma Metro network.', 'Yellow Line'), 'ACTIVE');
  });
});

/**
 * The structured path is the primary one — the fallback only runs when it finds
 * nothing — and it used to stamp ACTIVE on every line it parsed.
 */
describe('BMRCL line status from structured markup', () => {
  const section = (attrs: string) =>
    page(
      `<section data-bmrcl-line="Yellow Line" ${attrs}>` +
        '<ol><li data-station-name="RV Road" data-sequence="1"></li>' +
        '<li data-station-name="Bommasandra" data-sequence="2"></li></ol>' +
        '</section>',
    );

  const parseOne = (attrs: string) => new BmrclStaticNetworkParser().parse(section(attrs));

  test('data-status is taken as the source stating it', () => {
    assert.equal(parseOne('data-status="ACTIVE"').lines[0].operationalStatus, 'ACTIVE');
    assert.equal(parseOne('data-status="under-construction"').lines[0].operationalStatus, 'UNDER_CONSTRUCTION');
  });

  test('markup that declares no status is not assumed to be running', () => {
    // Previously this returned ACTIVE for anything the fixture happened to hold.
    assert.equal(parseOne('').lines[0].operationalStatus, 'UNKNOWN');
  });

  test('an unrecognised data-status becomes UNKNOWN rather than ACTIVE', () => {
    const parsed = parseOne('data-status="probably-fine"');

    assert.equal(parsed.lines[0].operationalStatus, 'UNKNOWN');
    assert.ok(parsed.warnings.some(warning => warning.includes('probably-fine')));
  });

  test('prose beside the block answers for a line that declares nothing', () => {
    const parsed = new BmrclStaticNetworkParser().parse(
      page(
        '<p>The Yellow Line is operational between RV Road and Bommasandra.</p>' +
          '<section data-bmrcl-line="Yellow Line">' +
          '<ol><li data-station-name="RV Road" data-sequence="1"></li>' +
          '<li data-station-name="Bommasandra" data-sequence="2"></li></ol>' +
          '</section>',
      ),
    );

    assert.equal(parsed.lines[0].operationalStatus, 'ACTIVE');
  });
});
