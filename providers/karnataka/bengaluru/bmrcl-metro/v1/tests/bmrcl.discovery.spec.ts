import { BmrclDiscovery } from '../bmrcl.discovery';

describe('BmrclDiscovery', () => {
  it('enables only lines and stations for the first import milestone', async () => {
    const discovery = new BmrclDiscovery();
    const items = [];

    for await (const item of discovery.discoverStaticNetwork()) {
      items.push(item);
    }

    expect(items.map(item => item.sourceKind)).toEqual(['LINES', 'STATIONS']);
    expect(items.every(item => item.url.startsWith('https://www.bmrc.co.in/'))).toBe(true);
  });
});
