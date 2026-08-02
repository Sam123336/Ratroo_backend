import { Module } from '@nestjs/common';
import { FavoritesController } from './controllers/favorites.controller';
import { FavoritesService } from './services/favorites.service';

@Module({
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
