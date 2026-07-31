import { BmrclDiscoveryItem } from './bmrcl.types';

export class BmrclDiscovery {
  async *discoverStaticNetwork(): AsyncIterable<BmrclDiscoveryItem> {
    yield {
      externalId: 'bmrcl-network',
      sourceUrl: 'https://www.bmrc.co.in/',
      sourceRole: 'NETWORK',
    };
    yield {
      externalId: 'bmrcl-timings',
      sourceUrl: 'https://www.bmrc.co.in/metro-timings/',
      sourceRole: 'TIMINGS',
    };
    yield {
      externalId: 'bmrcl-tickets',
      sourceUrl: 'https://www.bmrc.co.in/tickets/',
      sourceRole: 'TICKETS',
    };
    yield {
      externalId: 'bmrcl-fares',
      sourceUrl: 'https://www.bmrc.co.in/fare-rules/',
      sourceRole: 'FARES',
    };
  }
}

