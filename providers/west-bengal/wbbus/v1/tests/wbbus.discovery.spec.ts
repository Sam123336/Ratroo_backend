import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WBBusDirectoryParser } from '../../../../../../apps/api/src/modules/provider-ingestion/application/wbbus-static-network';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('WBBusDirectoryParser', () => {
  it('discovers bus detail links and next page', () => {
    const parser = new WBBusDirectoryParser();
    const result = parser.discoverBusLinks('https://wbbus.in/allbus', fixture('allbus-page-1.html'));

    expect(result.busUrls).toEqual([
      'https://wbbus.in/bus/arambagh-kharagpur-001',
      'https://wbbus.in/bus/howrah-salt-lake-002',
    ]);
    expect(result.nextPageUrl).toBe('https://wbbus.in/allbus?page=2');
  });
});
