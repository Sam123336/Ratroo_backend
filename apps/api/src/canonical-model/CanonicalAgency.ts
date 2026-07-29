export interface CanonicalAgency {
  id?: string;
  name: string;
  code: string;
  state?: string;
  city?: string;
  country?: string;
  provider: string;
  createdAt?: Date;
  updatedAt?: Date;
}