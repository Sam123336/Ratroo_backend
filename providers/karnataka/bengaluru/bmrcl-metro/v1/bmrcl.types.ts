export interface BmrclDiscoveryItem {
  sourceKind: BmrclSourceKind;
  url: string;
  effectiveFrom?: string;
  metadata?: Record<string, unknown>;
}

export type BmrclSourceKind =
  | 'NETWORK'
  | 'LINES'
  | 'STATIONS'
  | 'TIMETABLE'
  | 'FARES'
  | 'SERVICE_ALERTS';

export interface BmrclRawPage {
  url: string;
  sourceKind: BmrclDiscoveryItem['sourceKind'];
  html: string;
  fetchedAt: string;
  contentHash?: string;
  rawRecordId?: string;
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
  rawRecordIds: string[];
  lines: BmrclParsedLine[];
  warnings: string[];
}
