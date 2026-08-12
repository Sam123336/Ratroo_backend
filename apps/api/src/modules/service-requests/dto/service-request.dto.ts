import {
  IsLatitude, IsLongitude, IsOptional, IsString, Length, Matches, MaxLength,
} from 'class-validator';

export class CreateServiceRequestDto {
  @IsString() @Length(2, 8)
  stateCode: string;

  @IsOptional() @IsString() @MaxLength(120)
  regionName?: string;

  // Loose on purpose: 10 digits, optionally +91, optionally spaced. Anything
  // stricter turns a real person in Bihar into a validation error.
  @Matches(/^(\+?91[\s-]?)?[6-9]\d{9}$/, {
    message: 'Enter a 10-digit Indian mobile number.',
  })
  phone: string;

  @IsOptional() @IsLatitude()
  latitude?: number;

  @IsOptional() @IsLongitude()
  longitude?: number;

  @IsOptional() @IsString() @MaxLength(120)
  city?: string;
}
