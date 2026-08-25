import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { JourneyService } from './journey.service';

/**
 * Resolving an endpoint that no canonical place matches.
 *
 * A reverse-geocoded label — what the app puts in the box when a rider taps
 * "use my current location" — is not a place name, so the named lookup finds
 * nothing. Before the coordinate fallback that was a 404 and the rider was
 * told no route exists, with BMTC stops a few hundred metres away.
 */
const service = (found: unknown[], stations: unknown[] = []) =>
  new JourneyService(
    {
      findPlacesByName: async () => found,
      findStationsByName: async () => stations,
    } as never,
    { planAll: async () => [] } as never,
  );

/** `resolveEndpoint` is private; exercised the way planJourney reaches it. */
const resolve = (svc: JourneyService, name: string, lat?: number, lng?: number) =>
  (svc as unknown as {
    resolveEndpoint(
      name: string, lat?: number, lng?: number, label?: string,
    ): Promise<any[]>;
  }).resolveEndpoint(name, lat, lng, 'Origin');

describe('journey endpoint resolution', () => {
  test('prefers the named place when one matches', async () => {
    // A canonical place carries aliases the coordinate cannot, so a real match
    // must win even when coordinates are supplied.
    const place = { id: 'p1', canonicalName: 'Indiranagar', confidence: 0.9 };
    const resolved = await resolve(service([place]), 'Indiranagar', 12.97, 77.64);

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].id, 'p1');
    assert.equal(resolved[0].confidence, 0.9);
  });

  test('falls back to the coordinate when the name matches nothing', async () => {
    const resolved = await resolve(
      service([]), 'Kasavanahalli, Bengaluru, Karnataka', 12.9081, 77.6476,
    );

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].latitude, 12.9081);
    assert.equal(resolved[0].longitude, 77.6476);
    // No canonical id: nothing in `places` backs this point.
    assert.equal(resolved[0].id, null);
    // A dropped pin is a weaker claim than a curated place, and the response
    // reports this number to the rider.
    assert.equal(resolved[0].confidence, 0.5);
  });

  test('falls back to a station when no place matches', async () => {
    // `places` is built from the bus imports, so a metro-only station is absent
    // from it: Whitefield has no place row and no stop of that name, only a
    // metro_stations row. It was reported as not found while sitting in the
    // graph the whole time.
    const station = {
      id: null, canonicalName: 'Whitefield', normalizedName: 'whitefield',
      latitude: null, longitude: null, confidence: 0.7,
    };
    const resolved = await resolve(service([], [station]), 'Whitefield');

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].canonicalName, 'Whitefield');
    // Null coordinates are not fatal: the planner matches stops by name too,
    // so an unlocated station is still a usable endpoint.
    assert.equal(resolved[0].latitude, null);
  });

  test('prefers a station over the callers coordinates', async () => {
    // A named station is a better reading of intent than a dropped pin.
    const station = {
      id: null, canonicalName: 'Whitefield', normalizedName: 'whitefield',
      latitude: 12.99, longitude: 77.75, confidence: 0.7,
    };
    const resolved = await resolve(service([], [station]), 'Whitefield', 12.90, 77.60);

    assert.equal(resolved[0].canonicalName, 'Whitefield');
    assert.equal(resolved[0].latitude, 12.99);
  });

  test('still refuses when there is neither a match nor a coordinate', async () => {
    // Inventing a point here would plan a journey from the Gulf of Guinea.
    await assert.rejects(
      () => resolve(service([]), 'Nowhere At All'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });

  test('refuses a half-supplied coordinate rather than guessing the other half', async () => {
    await assert.rejects(() => resolve(service([]), 'Somewhere', 12.9081, undefined));
    await assert.rejects(() => resolve(service([]), 'Somewhere', undefined, 77.6476));
    // Number(null) is 0, which would look like a valid point at 0,0.
    await assert.rejects(
      () => resolve(service([]), 'Somewhere', null as never, null as never),
    );
  });
});
