export interface CanonicalStop {
  id?: string;
  name: string;
  normalizedName: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  city?: string;
  district?: string;
  state?: string;
  provider: string;
  externalId?: string;
}