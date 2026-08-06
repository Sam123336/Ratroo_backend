import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { ApiResult } from '../../core/dto/api-response.dto';
import { RouteModel } from '../../transit/infrastructure/sequelize/models';
import { FavoriteModel } from '../entities/favorite.model';

/**
 * Every method is scoped by userId, which comes from the verified JWT — never
 * from the request body. A client cannot read or edit another user's favourites.
 */
@Injectable()
export class FavoritesService {
  constructor(
    @InjectModel(FavoriteModel) private readonly favorites: typeof FavoriteModel,
    @InjectModel(RouteModel) private readonly routes: typeof RouteModel,
  ) {}

  async listForUser(userId: string): Promise<ApiResult<RouteModel[]>> {
    const rows = await this.favorites.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
    const routeIds = rows.map(row => row.routeId);

    if (!routeIds.length) {
      return new ApiResult([]);
    }

    return new ApiResult(await this.routes.findAll({ where: { id: routeIds } }));
  }

  async add(userId: string, routeId: string): Promise<ApiResult<{ favorited: true }>> {
    // Idempotent: re-favouriting is a success, not a 409.
    await this.favorites.findOrCreate({ where: { userId, routeId }, defaults: { userId, routeId } });
    return new ApiResult({ favorited: true as const });
  }

  async remove(userId: string, routeId: string): Promise<ApiResult<{ favorited: false }>> {
    await this.favorites.destroy({ where: { userId, routeId } });
    return new ApiResult({ favorited: false as const });
  }
}
