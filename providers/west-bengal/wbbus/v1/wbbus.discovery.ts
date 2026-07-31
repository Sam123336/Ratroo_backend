import { WBBusDiscoveryItem } from './wbbus.types';

export class WBBusDiscovery {
  async *discoverSeedPages(limit = 10): AsyncIterable<WBBusDiscoveryItem> {
    for (let page = 1; page <= limit; page += 1) {
      yield {
        externalId: `wbbus-page-${page}`,
        sourceUrl: `https://wbbus.in/allbus?page=${page}`,
      };
    }
  }
}

