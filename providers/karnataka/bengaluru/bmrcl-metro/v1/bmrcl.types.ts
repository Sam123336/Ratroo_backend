export interface BmrclDiscoveryItem {
  externalId: string;
  sourceUrl: string;
  sourceRole: 'NETWORK' | 'TIMINGS' | 'TICKETS' | 'FARES';
}

export interface BmrclRawPage {
  sourceUrl: string;
  sourceRole: BmrclDiscoveryItem['sourceRole'];
  html: string;
  fetchedAt: string;
}

export interface BmrclParsedStation {
  name: string;
  lineName?: string;
  sequence?: number;
  isInterchange?: boolean;
}

export interface BmrclParsedLine {
  name: string;
  color?: string;
  operationalStatus: 'ACTIVE' | 'PLANNED' | 'UNDER_CONSTRUCTION' | 'UNKNOWN';
  stations: BmrclParsedStation[];
}

export interface BmrclParsedNetwork {
  sourceUrl: string;
  fetchedAt: string;
  contentHash: string;
  rawRecordId: string;
  lines: BmrclParsedLine[];
  warnings: string[];
}
