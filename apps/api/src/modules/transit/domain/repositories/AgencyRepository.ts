import { Agency } from '../entities/Agency';

export interface AgencyRepository {
  findById(id: string): Promise<Agency | null>;
  findByCode(code: string): Promise<Agency | null>;
  save(agency: Agency): Promise<Agency>;
}

export const AGENCY_REPOSITORY_TOKEN = Symbol('AgencyRepository');
