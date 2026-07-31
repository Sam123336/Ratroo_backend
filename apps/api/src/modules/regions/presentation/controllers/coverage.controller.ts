import { Controller, Get, Param } from '@nestjs/common';
import { GetRegionUseCase } from '../../application/GetRegionUseCase';
import { ListRegionsUseCase } from '../../application/ListRegionsUseCase';

@Controller('v1/coverage')
export class CoverageController {
  constructor(
    private readonly listRegions: ListRegionsUseCase,
    private readonly getRegion: GetRegionUseCase,
  ) {}

  @Get('regions')
  findAllRegions() {
    const regions = this.listRegions.execute();
    return {
      data: regions,
      count: regions.length,
    };
  }

  @Get('regions/:slug')
  findRegion(@Param('slug') slug: string) {
    return {
      data: this.getRegion.execute(slug),
    };
  }

  @Get('regions/:slug/providers')
  findRegionProviders(@Param('slug') slug: string) {
    const region = this.getRegion.execute(slug);
    return {
      data: region.providers,
      count: region.providers.length,
      region: {
        slug: region.slug,
        name: region.name,
        status: region.status,
      },
    };
  }
}

