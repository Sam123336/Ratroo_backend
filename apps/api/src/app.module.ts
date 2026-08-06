import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { postgresConnection } from './database/connection-options';
import { SequelizeModule } from '@nestjs/sequelize';
import { SequelizeModuleOptions } from '@nestjs/sequelize/dist/interfaces/sequelize-options.interface';
import { HealthController } from './modules/health/health.controller';
import { TransitModule } from './modules/transit/transit.module';
import { RegionsModule } from './modules/regions/regions.module';
import { WBBusModule } from './integrations/transit-providers/wbbus/wbbus.module';
import { TRANSIT_SEQUELIZE_MODELS } from './modules/transit/infrastructure/sequelize/models';
import { ProviderIngestionModule } from './modules/provider-ingestion/provider-ingestion.module';
import { PROVIDER_INGESTION_SEQUELIZE_MODELS } from './modules/provider-ingestion/infrastructure/sequelize/models';

function databaseConfig(config: ConfigService): SequelizeModuleOptions {
  const models = [
    ...TRANSIT_SEQUELIZE_MODELS,
    ...PROVIDER_INGESTION_SEQUELIZE_MODELS,
  ];
  const databaseUrl = config.get<string>('DATABASE_URL');
  // Once you have migrations, schema changes belong in them — leave this false.
  const synchronize = config.get<string>('DB_SYNCHRONIZE', databaseUrl ? 'false' : 'true') === 'true';

  return {
    dialect: 'postgres' as const,
    models,
    autoLoadModels: true,
    synchronize,
    logging: config.get<string>('DB_LOGGING', 'false') === 'true' ? console.log : false,
    ...postgresConnection((key, fallback) => config.get<string>(key, fallback as string)),
  };
}

import { SearchModule } from './modules/search/search.module';
import { RouteModule } from './modules/routes/route.module';
import { VillageModule } from './modules/villages/village.module';
import { NearbyModule } from './modules/nearby/nearby.module';
import { JourneyModule } from './modules/journey/journey.module';
import { CoreModule } from './modules/core/core.module';
import { PlacesModule } from './modules/places/places.module';
import { ConnectivityModule } from './modules/connectivity/connectivity.module';
import { FerryModule } from './modules/ferry/ferry.module';
import { RailwayModule } from './modules/rail/rail.module';
import { MetroModule } from './modules/metro/metro.module';
import { TramModule } from './modules/tram/tram.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    // Powers @Cron in ProviderSyncSchedulerService. No-op on serverless (Vercel)
    // where nothing stays resident — the Vercel Cron entry covers that case.
    ScheduleModule.forRoot(),
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    TransitModule,
    RegionsModule,
    ProviderIngestionModule,
    WBBusModule,
    CoreModule,
    SearchModule,
    RouteModule,
    VillageModule,
    NearbyModule,
    JourneyModule,
    PlacesModule,
    ConnectivityModule,
    FerryModule,
    RailwayModule,
    MetroModule,
    TramModule,
    FavoritesModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
