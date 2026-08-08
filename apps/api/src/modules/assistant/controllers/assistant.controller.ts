import { Body, Controller, Post } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiResult } from '../../core/dto/api-response.dto';
import { AssistantService } from '../services/assistant.service';

export class AskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question: string;
}

@Controller('v1/assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('ask')
  async ask(@Body() dto: AskDto): Promise<ApiResult<{ answer: string; toolCalls: string[]; model: string }>> {
    return new ApiResult(await this.assistant.ask(dto.question));
  }
}
