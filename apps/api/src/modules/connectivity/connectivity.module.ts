import { Module } from '@nestjs/common';
import { ConnectivityController } from './controllers/connectivity.controller';
import { ConnectivityService } from './services/connectivity.service';

@Module({
  controllers: [ConnectivityController],
  providers: [ConnectivityService],
  exports: [ConnectivityService],
})
export class ConnectivityModule {}
