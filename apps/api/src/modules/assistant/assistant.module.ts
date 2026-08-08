import { Module } from '@nestjs/common';
import { JourneyModule } from '../journey/journey.module';
import { SearchModule } from '../search/search.module';
import { AssistantController } from './controllers/assistant.controller';
import { AssistantService } from './services/assistant.service';

// Imports the modules whose services the tools call — the assistant owns no
// transit logic of its own, by design.
@Module({
  imports: [JourneyModule, SearchModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
