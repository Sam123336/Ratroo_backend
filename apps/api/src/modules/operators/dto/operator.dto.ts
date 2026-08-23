import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsEnum, IsInt, IsLatitude,
  IsLongitude, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
  ValidateNested,
} from 'class-validator';
import { VehicleType } from '../domain/vehicle-type';
import { RoutePublishState } from '../entities/operator-route.model';
import { OperatorStatus } from '../domain/operator-status';
import { SubmissionReviewState } from '../domain/submission-review-state';

export class RegisterOperatorDto {
  @IsString() @MinLength(2) @MaxLength(160)
  name: string;

  @IsOptional() @IsString() @MaxLength(200)
  legalName?: string;

  @IsOptional() @IsEmail() @MaxLength(160)
  contactEmail?: string;

  // Kept loose on purpose: Indian numbers arrive with and without +91, with
  // spaces and dashes. Rejecting a real operator over formatting is worse than
  // storing what they typed.
  @IsOptional() @IsString() @MaxLength(32)
  contactPhone?: string;
}

export class UpdateOperatorDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160)
  name?: string;

  @IsOptional() @IsString() @MaxLength(200)
  legalName?: string;

  @IsOptional() @IsEmail() @MaxLength(160)
  contactEmail?: string;

  @IsOptional() @IsString() @MaxLength(32)
  contactPhone?: string;
}

export class CreateVehicleDto {
  @IsString() @MinLength(4) @MaxLength(32)
  registrationNumber: string;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @IsOptional() @IsString() @MaxLength(120)
  displayName?: string;

  @IsOptional() @IsInt() @Min(1) @Max(200)
  seatCapacity?: number;
}

export class RouteStopDto {
  @IsString() @MinLength(2) @MaxLength(200)
  stopName: string;

  @IsOptional() @IsLatitude()
  latitude?: number;

  @IsOptional() @IsLongitude()
  longitude?: number;

  /** 24-hour "HH:MM". One format in, so nothing downstream has to guess. */
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'departureTime must be HH:MM in 24-hour time, e.g. 06:30',
  })
  departureTime?: string;

  @IsOptional() @IsInt() @Min(0) @Max(10000)
  fareFromOriginINR?: number;
}

export class CreateRouteDto {
  @IsString() @MinLength(3) @MaxLength(200)
  name: string;

  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @IsOptional() @IsString()
  vehicleId?: string;

  @IsOptional() @IsInt() @Min(0) @Max(10000)
  fareINR?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(7)
  @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true })
  operatingDays?: number[];

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;

  // A route needs both ends to be a route at all.
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RouteStopDto)
  stops: RouteStopDto[];
}

export class SetPublishStateDto {
  @IsEnum(RoutePublishState)
  publishState: RoutePublishState;
}

export class ReviewOperatorDto {
  @IsEnum(OperatorStatus)
  status: OperatorStatus;

  @IsOptional() @IsString() @MaxLength(400)
  reviewNote?: string;
}

export class ReviewVehicleDto {
  @IsEnum(SubmissionReviewState)
  reviewState: SubmissionReviewState;

  @IsOptional() @IsString() @MaxLength(400)
  reviewNote?: string;
}

export enum RouteReviewDecision {
  APPROVE = 'APPROVE',
  NEEDS_CHANGES = 'NEEDS_CHANGES',
}

export class ReviewRouteDto {
  @IsEnum(RouteReviewDecision)
  decision: RouteReviewDecision;

  @IsOptional() @IsString() @MaxLength(400)
  reviewNote?: string;
}
