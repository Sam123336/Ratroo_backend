export type RegionType = 'country' | 'state' | 'city' | 'district' | 'global';
export type RegionStatus = 'planned' | 'research' | 'beta' | 'live';

export interface RegionScope {
  country?: string;
  state?: string;
  district?: string;
  city?: string;
  providerCodes: string[];
}

export interface RegionProvider {
  code: string;
  name: string;
  modes: string[];
  status: RegionStatus;
  adapterKey: string;
  notes?: string;
}

export interface LaunchRegion {
  slug: string;
  name: string;
  type: RegionType;
  status: RegionStatus;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  scope: RegionScope;
  providers: RegionProvider[];
  supportedApis: string[];
  notes?: string;
}

