import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { JourneyService } from '../services/journey.service';
import { PlanJourneyDto, JourneyResponseDto } from '../dto/journey.dto';
import { ApiResult } from '../../core/dto/api-response.dto';

@Controller('v1/journey')
export class JourneyController {
  constructor(private readonly journeyService: JourneyService) {}

  @Post()
  async planJourney(@Body() dto: PlanJourneyDto): Promise<ApiResult<JourneyResponseDto>> {
    if (!dto || !dto.from || !dto.to) {
      throw new BadRequestException('Body must contain non-empty from and to parameters.');
    }
    // Coordinates are passed through untouched; the service prefers a named
    // place and only falls back to the point when the name resolves to nothing.
    return this.journeyService.planJourney(dto.from, dto.to, {
      fromLat: dto.fromLat,
      fromLng: dto.fromLng,
      toLat: dto.toLat,
      toLng: dto.toLng,
    });
  }
}
