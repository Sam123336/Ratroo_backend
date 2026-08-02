import { Module } from '@nestjs/common';
import { NearbyService } from './services/nearby.service';

@Module({
  providers: [NearbyService],
  exports: [NearbyService],
})
export class NearbyModule {}
