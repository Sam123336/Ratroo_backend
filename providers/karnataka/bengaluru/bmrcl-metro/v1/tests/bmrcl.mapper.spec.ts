import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BmrclStaticNetworkMapper } from '../bmrcl.mapper';
import { BmrclStaticNetworkParser } from '../bmrcl.parser';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('BmrclStaticNetworkMapper', () => {
  it('maps interchanges and source observations', () => {
    const network = new BmrclStaticNetworkParser().parse([
      {
        sourceKind: 'LINES',
        url: 'fixture://lines',
        html: fixture('lines.html'),
        fetchedAt: '2026-08-01T00:00:00.000Z',
        contentHash: 'lines-hash',
        rawRecordId: 'raw-lines',
      },
      {
        sourceKind: 'STATIONS',
        url: 'fixture://stations',
        html: fixture('stations.html'),
        fetchedAt: '2026-08-01T00:00:00.000Z',
        contentHash: 'stations-hash',
        rawRecordId: 'raw-stations',
      },
    ]);
    const canonical = new BmrclStaticNetworkMapper().map(network);

    expect(canonical.agencies).toHaveLength(1);
    expect(canonical.routePatterns).toHaveLength(2);
    expect(canonical.sourceObservations).toHaveLength(2);
    expect(canonical.nodes.some(node => node.name === 'Majestic' && node.nodeType === 'INTERCHANGE')).toBe(true);
  });
});
