import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiResult } from '../core/dto/api-response.dto';
import { AuthService } from './auth.service';
import { AuthTokensDto, LoginDto, RefreshDto, RegisterDto } from './dto/auth.dto';
import { AuthenticatedUser, CurrentUser, JwtAuthGuard } from './jwt-auth.guard';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<ApiResult<AuthTokensDto>> {
    return new ApiResult(await this.auth.register(dto));
  }

  // 200, not 201 — logging in creates no resource.
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto): Promise<ApiResult<AuthTokensDto>> {
    return new ApiResult(await this.auth.login(dto));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto): Promise<ApiResult<AuthTokensDto>> {
    return new ApiResult(await this.auth.refresh(dto.refreshToken));
  }

  // Takes the refresh token, not the access token: the access token expires on
  // its own, the refresh token is what must be killed server-side.
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto): Promise<ApiResult<{ loggedOut: true }>> {
    return new ApiResult(await this.auth.logout(dto.refreshToken));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<ApiResult<AuthenticatedUser>> {
    return new ApiResult(user);
  }
}
