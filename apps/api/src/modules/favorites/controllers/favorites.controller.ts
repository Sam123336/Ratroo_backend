import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { ApiResult } from '../../core/dto/api-response.dto';
import { AuthenticatedUser, CurrentUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { FavoritesService } from '../services/favorites.service';

export class AddFavoriteDto {
  @IsUUID()
  routeId: string;
}

// Guard on the controller: every route here needs a logged-in user.
@Controller('v1/favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.favorites.listForUser(user.id);
  }

  @Post()
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddFavoriteDto,
  ): Promise<ApiResult<{ favorited: true }>> {
    return this.favorites.add(user.id, dto.routeId);
  }

  @Delete(':routeId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('routeId', ParseUUIDPipe) routeId: string,
  ): Promise<ApiResult<{ favorited: false }>> {
    return this.favorites.remove(user.id, routeId);
  }
}
