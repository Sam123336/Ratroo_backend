import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BmrclStaticNetworkParser } from '../bmrcl.parser';
import { BmrclStaticNetworkValidator } from '../bmrcl.validator';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('BmrclStaticNetworkValidator', () => {
  it('rejects duplicate station sequence numbers', () => {
    const parser = new BmrclStaticNetworkParser();
    const validator = new BmrclStaticNetworkValidator();
    const network = parser.parse([
      {
        sourceKind: 'LINES',
        url: 'fixture://malformed-stations',
        html: fixture('malformed-stations.html'),
        fetchedAt: '2026-08-01T00:00:00.000Z',
        contentHash: 'bad-hash',
        rawRecordId: 'raw-bad',
      },
    ]);

    const validation = validator.validate(network);

    expect(validation.isValid).toBe(false);
    expect(validation.errors.join(' ')).toContain('duplicate station sequence 1');
  });
});
