import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgencyEntity } from './database/entities/agency.entity';
import { StopEntity } from './database/entities/stop.entity';
import { RouteEntity } from './database/entities/route.entity';
import { TripEntity } from './database/entities/trip.entity';
import { StopTimeEntity } from './database/entities/stop-time.entity';
import { TransitSourceRecordEntity } from './database/entities/transit-source-record.entity';
import { HealthController } from './modules/health/health.controller';
import { TransitModule } from './modules/transit/transit.module';
import { RegionsModule } from './modules/regions/regions.module';
import { WBBusModule } from './integrations/transit-providers/wbbus/wbbus.module';
import { ImportWBBusService } from './database/seeds/import-wbbus.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'transit_admin'),
        password: config.get<string>('DB_PASSWORD', 'transit_password'),
        database: config.get<string>('DB_NAME', 'transit_db'),
        entities: [
          AgencyEntity,
          StopEntity,
          RouteEntity,
          TripEntity,
          StopTimeEntity,
          TransitSourceRecordEntity,
        ],
        synchronize: true, // dev auto-migration
      }),
    }),
    TransitModule,
    RegionsModule,
    WBBusModule,
  ],
  controllers: [HealthController],
  providers: [ImportWBBusService],
  exports: [ImportWBBusService],
})
export class AppModule {}
