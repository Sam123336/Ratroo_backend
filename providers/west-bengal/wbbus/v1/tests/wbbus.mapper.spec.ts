import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  WBBusMapper,
  WBBusParser,
  sha256,
} from '../../../../../../apps/api/src/modules/provider-ingestion/application/wbbus-static-network';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('WBBusMapper', () => {
  it('maps UP and DOWN route patterns, trips, stop times, and observations', () => {
    const html = fixture('bus-arambagh-kharagpur.html');
    const bus = new WBBusParser().parseBusHtml(
      'https://wbbus.in/bus/arambagh-kharagpur-001',
      html,
      'raw-1',
      sha256(html),
    );
    const canonical = new WBBusMapper().map([bus]);

    expect(canonical.agencies).toHaveLength(1);
    expect(canonical.nodes).toHaveLength(4);
    expect(canonical.routePatterns).toHaveLength(2);
    expect(canonical.trips).toHaveLength(2);
    expect(canonical.sourceObservations).toHaveLength(1);
    expect(canonical.routePatterns.find(route => route.directionId === 'UP')?.stops.map(stop => stop.name)).toEqual([
      'Arambagh',
      'Ghatal',
      'Medinipur',
      'Kharagpur',
    ]);
    expect(canonical.routePatterns.find(route => route.directionId === 'DOWN')?.stops.map(stop => stop.name)).toEqual([
      'Kharagpur',
      'Medinipur',
      'Ghatal',
      'Arambagh',
    ]);
  });
});
