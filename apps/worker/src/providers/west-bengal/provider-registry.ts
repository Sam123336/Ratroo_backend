export interface WorkerProviderRegistryEntry {
  code: string;
  adapterKey: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  modes: string[];
  sourceUrls: string[];
  access: string;
  notes: string[];
}

export const WEST_BENGAL_WORKER_PROVIDER_REGISTRY: WorkerProviderRegistryEntry[] = [
  {
    code: 'WBBUS',
    adapterKey: 'wbbus-provider',
    priority: 'P0',
    modes: ['BUS'],
    sourceUrls: ['https://wbbus.in/', 'https://wbbus.in/allbus'],
    access: 'HTML + pagination',
    notes: ['Save raw HTML before parsing.', 'Treat as community/private source.'],
  },
  {
    code: 'WBTC',
    adapterKey: 'wbtc-provider',
    priority: 'P0',
    modes: ['BUS'],
    sourceUrls: ['https://wbtconline.in/wbtc-city-bus-routes', 'https://transport.wb.gov.in/transport-services/bus-services/'],
    access: 'HTML table',
    notes: ['Route-pattern source, not complete trip schedule source.'],
  },
  {
    code: 'NBSTC',
    adapterKey: 'nbstc-provider',
    priority: 'P0',
    modes: ['BUS'],
    sourceUrls: ['https://nbstc.in/', 'https://nbstc.in/bus-routes.php'],
    access: 'HTML route pages',
    notes: ['North Bengal priority source.'],
  },
  {
    code: 'KOLKATA_METRO',
    adapterKey: 'kolkata-metro-provider',
    priority: 'P0',
    modes: ['METRO'],
    sourceUrls: ['https://mtp.indianrailways.gov.in/'],
    access: 'Official HTML timetable, fare, and alert pages',
    notes: ['Version by effective date.', 'Do not hard-code only Blue and Green lines.'],
  },
  {
    code: 'SBSTC',
    adapterKey: 'sbstc-provider',
    priority: 'P0',
    modes: ['BUS'],
    sourceUrls: ['https://sbstc.co.in/', 'https://sbstconline.co.in/reservation-home'],
    access: 'Public pages plus permission-aware schedule investigation',
    notes: ['Do not bypass authentication, CAPTCHA, or anti-bot controls.'],
  },
  {
    code: 'WB_FERRY',
    adapterKey: 'wb-ferry-provider',
    priority: 'P1',
    modes: ['FERRY'],
    sourceUrls: ['https://transport.wb.gov.in/transport-services/ferry-services/ferry-routes/'],
    access: 'Official route directory',
    notes: ['Old notices are observations, not automatically active service.'],
  },
  {
    code: 'EASTERN_RAILWAY_SUBURBAN',
    adapterKey: 'eastern-railway-suburban-provider',
    priority: 'P2',
    modes: ['SUBURBAN_RAIL'],
    sourceUrls: ['https://er.indianrailways.gov.in/'],
    access: 'Official search, notices, and topology PDFs',
    notes: ['Use old PDFs for topology discovery only.'],
  },
  {
    code: 'KOLKATA_AUTO',
    adapterKey: 'kolkata-auto-provider',
    priority: 'P2',
    modes: ['SHARED_AUTO'],
    sourceUrls: ['https://transport.wb.gov.in/wp-content/uploads/2017/04/2017-03-31-notification-on-auto-routes-n-maximum-permits-in-Kolkata-1276.pdf'],
    access: 'PDF notifications',
    notes: ['Notification is not proof of current frequency or fare.'],
  },
  {
    code: 'KOLKATA_TRAM',
    adapterKey: 'kolkata-tram-provider',
    priority: 'P3',
    modes: ['TRAM'],
    sourceUrls: ['https://transport.wb.gov.in/transport-services/tram-route/'],
    access: 'Official route page and notifications',
    notes: ['Treat as historical/reference until active status is verified.'],
  },
];
