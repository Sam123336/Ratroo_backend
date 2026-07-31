export interface WBBusDiscoveryItem {
  externalId: string;
  sourceUrl: string;
}

export interface WBBusStoppage {
  slNo: string;
  upTime: string;
  stoppageName: string;
  downTime: string;
}

export interface WBBusRawBus {
  source: 'WBBUS';
  sourceUrl: string;
  name: string | null;
  alternateName: string | null;
  agencyName: string | null;
  registration: string | null;
  busType: string | null;
  contactNumber: string | null;
  alternateNumber: string | null;
  origin: string | null;
  destination: string | null;
  uploadedBy: string | null;
  schedule: WBBusStoppage[];
  notes: string | null;
  scrapedAt: string;
}

