import { IsString, IsNotEmpty, IsOptional, IsLatitude, IsLongitude } from 'class-validator';
import { Type } from 'class-transformer';

export class PlanJourneyDto {
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;

  /**
   * Where the rider actually is, when the name alone will not resolve.
   *
   * A reverse-geocoded label — "Kasavanahalli, Bengaluru, Karnataka" — is not a
   * canonical place, so a name-only lookup 404s and the rider is told no route
   * exists when in fact there are stops 373 m away. With a coordinate the
   * planner snaps to the nearest stops and covers the gap with a walk or a
   * hailed ride, which is the honest answer.
   *
   * Optional on purpose: a caller that has a real place name still gets the
   * named lookup, which carries aliases the coordinate cannot.
   */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  fromLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  fromLng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  toLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  toLng?: number;
}

/** One way to cover a first or last mile. Mirrors the planner's own shape. */
export interface JourneyLegOptionDto {
  mode: 'WALK' | 'AUTO';
  durationMinutes: number;
  recommended: boolean;
  label: string;
  /** Always true: these are distance-over-speed estimates, not timetables. */
  isEstimate: boolean;
}

export interface JourneyLegDto {
  legNumber: number;
  /** AUTO is a hailed first/last mile — auto, bike taxi or cab, not a service. */
  mode: 'WALK' | 'AUTO' | 'BUS' | 'SUBURBAN_RAIL' | 'METRO' | 'FERRY';
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
  /**
   * Set on the first and last legs only: the ways to cover that mile. Present
   * even when walking is recommended, so a rider who would rather ride can see
   * the alternative instead of being told to walk.
   */
  options?: JourneyLegOptionDto[];
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
