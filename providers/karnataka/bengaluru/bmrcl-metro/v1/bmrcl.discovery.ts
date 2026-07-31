import { BmrclDiscoveryItem } from './bmrcl.types';

export class BmrclDiscovery {
  async *discoverStaticNetwork(): AsyncIterable<BmrclDiscoveryItem> {
    yield {
      sourceKind: 'LINES',
      url: 'https://www.bmrc.co.in/metro-network/',
      metadata: {
        sourceName: 'BMRCL official metro network page',
      },
    };
    yield {
      sourceKind: 'STATIONS',
      url: 'https://www.bmrc.co.in/',
      metadata: {
        sourceName: 'BMRCL official home and fare station selector page',
      },
    };
  }
}
