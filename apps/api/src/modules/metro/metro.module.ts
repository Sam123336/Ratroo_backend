import { Module } from '@nestjs/common';
import { MetroController } from './controllers/metro.controller';
import { MetroService } from './services/metro.service';

@Module({
  controllers: [MetroController],
  providers: [MetroService],
  exports: [MetroService],
})
export class MetroModule {}
