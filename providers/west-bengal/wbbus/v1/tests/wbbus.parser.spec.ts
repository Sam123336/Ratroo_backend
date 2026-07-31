import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WBBusParser, sha256 } from '../../../../../../apps/api/src/modules/provider-ingestion/application/wbbus-static-network';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

describe('WBBusParser', () => {
  it('parses WBBus details and ordered stoppages', () => {
    const html = fixture('bus-arambagh-kharagpur.html');
    const bus = new WBBusParser().parseBusHtml(
      'https://wbbus.in/bus/arambagh-kharagpur-001',
      html,
      'raw-1',
      sha256(html),
    );

    expect(bus.name).toBe('Arambagh Kharagpur Local');
    expect(bus.registration).toBe('WB 29 A 1234');
    expect(bus.schedule.map(stop => stop.stoppageName)).toEqual(['Arambagh', 'Ghatal', 'Medinipur', 'Kharagpur']);
    expect(bus.schedule.map(stop => stop.upTime)).toEqual(['06:15', '07:05', '08:20', '09:10']);
    expect(bus.schedule.map(stop => stop.downTime)).toEqual(['18:30', '17:35', '16:20', '15:30']);
  });
});
