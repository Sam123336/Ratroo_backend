import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'A valid email address is required.' })
  @MaxLength(320)
  email: string;

  // 8 is the NIST floor. Length beats composition rules, so no symbol/digit
  // requirements here — they push users toward "Password1!" and nothing more.
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(200)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @MaxLength(200)
  password: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

export class AuthTokensDto {
  accessToken: string;
  refreshToken: string;
  /// Access token lifetime in seconds — clients refresh before this elapses.
  expiresIn: number;
  user: { id: string; email: string; displayName?: string };
}
