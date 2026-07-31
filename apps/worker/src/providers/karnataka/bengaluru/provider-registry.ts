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
    code: 'BMRCL_METRO',
    adapterKey: 'bmrcl-metro-provider',
    priority: 'P0',
    modes: ['METRO'],
    sourceUrls: [
      'https://www.bmrc.co.in/',
      'https://www.bmrc.co.in/metro-network/',
      'https://www.bmrc.co.in/metro-timings/',
      'https://www.bmrc.co.in/fare-rules/',
    ],
    access: 'Official metro HTML pages',
    status: 'ACTIVE_DEVELOPMENT',
    notes: ['Run and stabilize live import before adding fares, alerts, and train times.'],
  },
  {
    code: 'BMTC_OFFICIAL',
    adapterKey: 'bmtc-official-provider',
    priority: 'P0',
    modes: ['BUS'],
    sourceUrls: [
      'https://mybmtc.karnataka.gov.in/english',
      'https://mybmtc.karnataka.gov.in/33/bus-stations/en',
      'https://mybmtc.karnataka.gov.in/new-page/Metro%20Feeder%20Route%20details/en',
      'https://mybmtc.karnataka.gov.in/storage/pdf-files/VajraForm3Eng.pdf',
    ],
    access: 'Official HTML pages and PDFs',
    status: 'ACTIVE_DEVELOPMENT',
    notes: [
      'Use serviceClass for REGULAR, EXPRESS, LIMITED_STOP, AIRPORT, METRO_FEEDER, NIGHT, and PREMIUM.',
      'Do not create separate provider identities for feeder, airport, or premium BMTC services.',
    ],
  },
  {
    code: 'KSRTC_KARNATAKA',
    adapterKey: 'ksrtc-karnataka-provider',
    priority: 'P1',
    modes: ['INTERCITY_BUS'],
    sourceUrls: ['https://ksrtc.in/'],
    access: 'Official site and permission-aware reservation/search investigation',
    status: 'PLANNED',
    notes: ['Do not bypass authentication, CAPTCHA, anti-bot controls, or protected booking APIs.'],
  },
  {
    code: 'OSM_ROAD_NETWORK_BENGALURU',
    adapterKey: 'osm-road-network-bengaluru-provider',
    priority: 'P1',
    modes: ['WALKING', 'CYCLING', 'ROAD'],
    sourceUrls: ['https://www.openstreetmap.org/'],
    access: 'Approved routing graph pipeline only',
    status: 'PLANNED',
    notes: ['Do not scrape map tiles.', 'Do not model road-network data as ordinary transit routes.'],
  },
  {
    code: 'BENGALURU_AUTO',
    adapterKey: 'bengaluru-auto-provider',
    priority: 'P2',
    modes: ['AUTO'],
    sourceUrls: [],
    access: 'Moderated community/operator contribution source',
    status: 'PLANNED',
    notes: ['Do not invent route, fare, or frequency data.'],
  },
  {
    code: 'BENGALURU_SHUTTLE',
    adapterKey: 'bengaluru-shuttle-provider',
    priority: 'P2',
    modes: ['SHUTTLE'],
    sourceUrls: [],
    access: 'Moderated community/operator contribution source',
    status: 'PLANNED',
    notes: ['Do not publish unverified route, fare, or frequency data.'],
  },
];
