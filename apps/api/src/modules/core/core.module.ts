import { Module, Global } from '@nestjs/common';
import { ProvenanceService } from './services/provenance.service';

@Global()
@Module({
  providers: [ProvenanceService],
  exports: [ProvenanceService],
})
export class CoreModule {}
