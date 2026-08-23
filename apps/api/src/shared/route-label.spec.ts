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
