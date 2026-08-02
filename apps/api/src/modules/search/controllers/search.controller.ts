import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { SearchService } from '../services/search.service';
import { SearchResponseDto } from '../dto/search-response.dto';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('search')
  async searchLocation(@Query('q') q: string): Promise<ApiResult<SearchResponseDto[]>> {
    if (!q || !q.trim()) throw new BadRequestException('Query parameter q is required.');
    return this.searchService.search(q);
  }
}
