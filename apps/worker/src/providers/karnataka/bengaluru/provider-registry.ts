export interface WorkerBengaluruProviderRegistryEntry {
  code: string;
  adapterKey: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  modes: string[];
  sourceUrls: string[];
  access: string;
  status: string;
  notes: string[];
}

export const BENGALURU_WORKER_PROVIDER_REGISTRY: WorkerBengaluruProviderRegistryEntry[] = [
  {
    code: 'BMTC_OFFICIAL',
    adapterKey: 'bmtc-official-provider',
    priority: 'P0',
    modes: ['BUS'],
    sourceUrls: [
      'https://mybmtc.karnataka.gov.in/english',
      'https://mybmtc.karnataka.gov.in/33/bus-stations/en',
      'https://mybmtc.karnataka.gov.in/new-page/Metro%20Feeder%20Route%20details/en',
    ],
    access: 'Official HTML pages and PDFs',
    status: 'ACTIVE_DEVELOPMENT',
    notes: ['Raw-source-first ingestion.', 'Facilities are not route stops until resolved.'],
  },
  {
    code: 'BMRCL',
    adapterKey: 'bmrcl-metro-provider',
    priority: 'P0',
    modes: ['METRO'],
    sourceUrls: [
      'https://www.bmrc.co.in/',
      'https://www.bmrc.co.in/metro-timings/',
      'https://www.bmrc.co.in/tickets/',
      'https://www.bmrc.co.in/fare-rules/',
    ],
    access: 'Official metro HTML pages',
    status: 'ACTIVE_DEVELOPMENT',
    notes: ['Do not mark planned lines active.', 'Include operational status and effective dates.'],
  },
  {
    code: 'BMTC_METRO_FEEDER',
    adapterKey: 'bmtc-metro-feeder-provider',
    priority: 'P0',
    modes: ['BUS'],
    sourceUrls: ['https://mybmtc.karnataka.gov.in/new-page/Metro%20Feeder%20Route%20details/en'],
    access: 'Official feeder route page',
    status: 'ACTIVE_DEVELOPMENT',
    notes: ['Critical for BMTC to Metro interchanges.'],
  },
  {
    code: 'OSM_BENGALURU',
    adapterKey: 'osm-bengaluru-network-provider',
    priority: 'P0',
    modes: ['WALKING', 'CYCLING', 'ROAD'],
    sourceUrls: ['https://www.openstreetmap.org/'],
    access: 'Routing engine import only',
    status: 'PLANNED',
    notes: ['Do not scrape map tiles.', 'Use OSRM, GraphHopper, or Valhalla.'],
  },
  {
    code: 'NAMMA_BMTC_AVLS',
    adapterKey: 'namma-bmtc-avls-provider',
    priority: 'P0',
    modes: ['BUS', 'REALTIME_BUS'],
    sourceUrls: ['https://nammabmtcapp.karnataka.gov.in/'],
    access: 'Access review required',
    status: 'RESEARCH_REQUIRES_ACCESS_REVIEW',
    notes: ['Do not bypass authentication, tokens, CAPTCHA, rate limits, or technical restrictions.'],
  },
];

