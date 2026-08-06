import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiResult } from '../../core/dto/api-response.dto';
import { PlaceDetailDto, PlacesService } from '../services/places.service';

@Controller('v1/places')
export class PlacesController {
  constructor(private readonly service: PlacesService) {}

  // ParseUUIDPipe -> 400 rather than a Postgres cast error surfacing as a 500.
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ApiResult<PlaceDetailDto>> {
    return this.service.findById(id);
  }
}
