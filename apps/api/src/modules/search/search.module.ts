import { Module } from '@nestjs/common';
import { SearchController } from './controllers/search.controller';
import { SearchService } from './services/search.service';
import { SearchRepository } from './repositories/search.repository';
import { SearchMapper } from './mappers/search.mapper';

@Module({
  controllers: [SearchController],
  providers: [SearchService, SearchRepository, SearchMapper],
  exports: [SearchService],
})
export class SearchModule {}
