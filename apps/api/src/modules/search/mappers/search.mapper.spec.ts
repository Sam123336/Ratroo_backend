import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SearchMapper } from './search.mapper';

const mapper = new SearchMapper();

test('a route leads with the service number riders look for', () => {
  const dto = mapper.mapRouteToDto({
    id: 'r1',
    longName: 'Silk Board to Hebbal',
    providerCode: 'BMTC_OFFICIAL',
    metadata: { shortName: '500D' },
  });

  assert.equal(dto.title, '500D — Silk Board to Hebbal');
  assert.equal(dto.category, 'BUS_NUMBER');
});

test('a route with no published number is not given one', () => {
  const dto = mapper.mapRouteToDto({
    id: 'r2',
    longName: 'Howrah to Bongaon',
    providerCode: 'WBBUS',
    metadata: {},
  });

  assert.equal(dto.title, 'Howrah to Bongaon');
  assert.equal(dto.category, 'BUS_NAME');
});

test('a place is described by its own type, not a fixed label', () => {
  const place = { id: 'p1', name: 'Indiranagar', latitude: 12.97, longitude: 77.64, aliases: [] };

  assert.equal(mapper.mapPlaceToDto({ ...place, type: 'STATION' }).subtitle, 'Station');
  assert.equal(mapper.mapPlaceToDto({ ...place, type: 'VILLAGE' }).category, 'VILLAGE');
  // No type on the row must not become a confident "bus stop".
  assert.equal(mapper.mapPlaceToDto({ ...place, type: null }).category, 'LANDMARK');
});
