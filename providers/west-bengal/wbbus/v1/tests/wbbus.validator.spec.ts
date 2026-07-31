import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  WBBusParser,
  WBBusValidator,
  sha256,
} from '../../../../../../apps/api/src/modules/provider-ingestion/application/wbbus-static-network';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('WBBusValidator', () => {
  it('rejects buses with fewer than two stops', () => {
    const html = fixture('bus-invalid.html');
    const bus = new WBBusParser().parseBusHtml('https://wbbus.in/bus/invalid', html, 'raw-invalid', sha256(html));
    const validation = new WBBusValidator().validate([bus]);

    expect(validation.isValid).toBe(false);
    expect(validation.errors.join(' ')).toContain('fewer than two valid stops');
  });
});
