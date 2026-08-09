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
  /** Set on transit legs so the client can open Route Details for that leg. */
  routeId?: string;
  /** Fare for this leg's service, where the operator publishes one. */
  fareINR?: number | null;
  /**
   * Scheduled "HH:MM" at the boarding and alighting stops. Null on walking
   * legs and on services whose operator publishes no timetable.
   */
  departureTime?: string | null;
  arrivalTime?: string | null;
  instructions: string;
}

/** A journey option other than the recommended one. */
export interface JourneyAlternativeDto {
  legs: JourneyLegDto[];
  totalDistanceKm: string;
  totalDurationMinutes: number;
  transfersCount: number;
  totalFare?: number | null;
  fareIncomplete?: boolean;
  fareSources?: string[];
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
  /** Sum of priced legs. Null when no leg has a fare — never 0, which reads as free. */
  totalFare?: number | null;
  /** True when some legs are unpriced, so totalFare is a lower bound. */
  fareIncomplete?: boolean;
  /** e.g. ESTIMATED_BY_DISTANCE. Most WBBus fares are derived, not official. */
  fareSources?: string[];
  confidenceScore: number;
  confidenceBadges: string[];
  /** Other ways to make the trip, fastest first. Empty when there is only one. */
  alternatives?: JourneyAlternativeDto[];
}
