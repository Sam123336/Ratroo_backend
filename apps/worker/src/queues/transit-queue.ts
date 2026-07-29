export const TRANSIT_QUEUE = 'transit-import';
export interface ImportJob {
  provider: string;
  type: 'FULL' | 'INCREMENTAL';
  timestamp: number;
}
