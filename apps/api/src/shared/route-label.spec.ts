import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { routeLabel } from './route-label';

test('the service number leads the name', () => {
  assert.equal(routeLabel('335-E', 'Kadugodi Bus Station ⇔ Kempegowda Bus Station'),
    '335-E — Kadugodi Bus Station ⇔ Kempegowda Bus Station');
});

test('a route with no published number is shown by name alone', () => {
  assert.equal(routeLabel(null, 'Howrah to Bongaon'), 'Howrah to Bongaon');
  assert.equal(routeLabel('   ', 'Howrah to Bongaon'), 'Howrah to Bongaon');
});

test('a provider publishing only a code does not repeat it twice', () => {
  assert.equal(routeLabel('KBS-ANK', 'KBS-ANK'), 'KBS-ANK');
});

test('a number with no name still identifies the bus', () => {
  assert.equal(routeLabel('500-CK', null), '500-CK');
});

test('endpoints repeated with different punctuation are shown once', () => {
  // WBTC: shortName "Sealdah - Sankrail", longName "Sealdah to Sankrail".
  assert.equal(
    routeLabel('Sealdah - Sankrail Bharat Co-Op', 'Sealdah to Sankrail Bharat Co-Op'),
    'Sealdah to Sankrail Bharat Co-Op',
  );
  assert.equal(
    routeLabel('Howrah Maidan - Rajabazar Tram Depot', 'Howrah Maidan to Rajabazar Tram Depot'),
    'Howrah Maidan to Rajabazar Tram Depot',
  );
});

test('a real service number is never mistaken for a repeated name', () => {
  assert.equal(routeLabel('500-CK', 'Kadugodi to Banashankari'), '500-CK — Kadugodi to Banashankari');
  assert.equal(routeLabel('333-C', 'Basavanagara to Kempegowda'), '333-C — Basavanagara to Kempegowda');
});
