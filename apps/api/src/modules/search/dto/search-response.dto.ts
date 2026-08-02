export type SearchCategory =
  | 'VILLAGE'
  | 'TOWN'
  | 'AREA'
  | 'LANDMARK'
  | 'HOSPITAL'
  | 'COLLEGE'
  | 'BUS_STOP'
  | 'METRO_STATION'
  | 'RAILWAY_STATION'
  | 'FERRY_TERMINAL'
  | 'TRAM_STOP'
  | 'BUS_NUMBER'
  | 'BUS_NAME'
  | 'ROUTE_NUMBER'
  | 'OPERATOR';

export class SearchResponseDto {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle?: string;
  latitude?: number;
  longitude?: number;
  district?: string;
  block?: string;
  providerCode: string;
  aliases: string[];
  relevanceScore: number;
}
