import { Module } from '@nestjs/common';
import { WBBusClient } from './wbbus.client';
import { WBBusParser } from './wbbus.parser';
import { WBBusMapper } from './wbbus.mapper';

@Module({
  providers: [WBBusClient, WBBusParser, WBBusMapper],
  exports: [WBBusClient, WBBusParser, WBBusMapper],
})
export class WBBusModule {}
