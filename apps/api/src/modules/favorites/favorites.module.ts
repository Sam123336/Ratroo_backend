import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { RouteModel } from '../transit/infrastructure/sequelize/models';
import { FavoritesController } from './controllers/favorites.controller';
import { FavoriteModel } from './entities/favorite.model';
import { FavoritesService } from './services/favorites.service';

@Module({
  imports: [SequelizeModule.forFeature([FavoriteModel, RouteModel])],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
