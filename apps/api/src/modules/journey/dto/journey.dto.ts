import { IsString, IsNotEmpty } from 'class-validator';

export class PlanJourneyDto {
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;
}

export interface JourneyLegDto {
  legNumber: number;
  mode: 'WALK' | 'BUS' | 'SUBURBAN_RAIL' | 'METRO' | 'FERRY';
  fromName: string;
  toName: string;
  distanceKm: string;
  durationMinutes: number;
  providerCode?: string;
  serviceName?: string;
  instructions: string;
}

export class JourneyResponseDto {
  fromInput: string;
  toInput: string;
  originVillage: {
    name: string;
    district?: string;
    state: string;
  };
  legs: JourneyLegDto[];
  totalDistanceKm: string;
  totalDurationMinutes: number;
  transfersCount: number;
  confidenceScore: number;
  confidenceBadges: string[];
}
