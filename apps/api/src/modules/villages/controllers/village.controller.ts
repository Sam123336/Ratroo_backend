import { Controller, Get, Param } from '@nestjs/common';
import { VillageService } from '../services/village.service';
import { VillageResponseDto } from '../dto/village-response.dto';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1')
export class VillageController {
  constructor(private readonly villageService: VillageService) {}

  @Get('location/:id/nearest')
  async getNearestTransportNodes(@Param('id') id: string) {
    return this.villageService.getNearestStopForLocation(id);
  }

  @Get('villages/:id')
  async getVillageCoverage(@Param('id') id: string): Promise<ApiResult<VillageResponseDto>> {
    return this.villageService.getVillageCoverageById(id);
  }
}
