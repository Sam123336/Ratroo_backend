import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toTeleCmiNumber } from './telecmi';

test('the shapes a rider actually types are all the same number', () => {
  for (const written of ['9800000000', '+91 98000 00000', '098000-00000', '919800000000']) {
    assert.equal(toTeleCmiNumber(written), 919800000000, written);
  }
});

test('a ten-digit number opening 91 is a mobile, not a country code', () => {
  assert.equal(toTeleCmiNumber('9100000000'), 919100000000);
});

test('numbers that cannot ring a phone are refused rather than dialled', () => {
  for (const bad of ['1234567890', '033 2345 6789', '+1 415 555 0123', '', '98000000000']) {
    assert.throws(() => toTeleCmiNumber(bad), /Not an Indian mobile number/, bad);
  }
});
