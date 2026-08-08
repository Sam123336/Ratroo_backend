import { Body, Controller, Post } from '@nestjs/common';
import { IsLatitude, IsLongitude, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiResult } from '../../core/dto/api-response.dto';
import { AssistantService } from '../services/assistant.service';

export class AskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question: string;

  /**
   * Where the user is, when they have granted location. Lets "how do I get to
   * Digha" mean "from here" instead of prompting for a starting point.
   */
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

@Controller('v1/assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('ask')
  async ask(@Body() dto: AskDto): Promise<ApiResult<{ answer: string; toolCalls: string[]; model: string }>> {
    const origin =
      dto.lat !== undefined && dto.lng !== undefined ? { lat: dto.lat, lng: dto.lng } : undefined;

    return new ApiResult(await this.assistant.ask(dto.question, origin));
  }
}
