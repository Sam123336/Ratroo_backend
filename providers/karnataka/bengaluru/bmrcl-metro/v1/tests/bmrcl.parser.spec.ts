import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BmrclStaticNetworkParser } from '../bmrcl.parser';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('BmrclStaticNetworkParser', () => {
  it('preserves station order', () => {
    const parser = new BmrclStaticNetworkParser();
    const network = parser.parse([
      {
        sourceKind: 'LINES',
        url: 'fixture://lines',
        html: fixture('lines.html'),
        fetchedAt: '2026-08-01T00:00:00.000Z',
        contentHash: 'lines-hash',
        rawRecordId: 'raw-lines',
      },
    ]);

    expect(network.lines[0].stations.map(station => station.name)).toEqual(['Whitefield', 'Hopefarm', 'Majestic']);
    expect(network.lines[0].stations.map(station => station.sequence)).toEqual([1, 2, 3]);
  });
});
