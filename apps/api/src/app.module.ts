import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { postgresConnection } from './database/connection-options';
import { AuthModule } from './modules/auth/auth.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { AUTH_SEQUELIZE_MODELS } from './modules/auth/entities';
import { FAVORITES_SEQUELIZE_MODELS } from './modules/favorites/entities/favorite.model';
import { SequelizeModule } from '@nestjs/sequelize';
import { SequelizeModuleOptions } from '@nestjs/sequelize/dist/interfaces/sequelize-options.interface';
import { HealthController } from './modules/health/controllers/health.controller';
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
    ...AUTH_SEQUELIZE_MODELS,
    ...FAVORITES_SEQUELIZE_MODELS,
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
    // Sized for serverless, where every warm container holds its own pool and
    // there may be hundreds of them. Sequelize defaults to max 5, which against
    // a pooled Postgres multiplies into connection exhaustion under any load.
    // `acquire` bounds the wait for a slot so a saturated pool errors rather
    // than hanging the request.
    pool: {
      max: Number(config.get<string>('DB_POOL_MAX', '2')),
      min: 0,
      idle: 10_000,
      acquire: 15_000,
    },
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
import { DataQualityModule } from './modules/data-quality/data-quality.module';
import { OperatorsModule } from './modules/operators/operators.module';
import { ServiceRequestsModule } from './modules/service-requests/service-requests.module';

@Module({
  imports: [
    ServiceRequestsModule,
    OperatorsModule,
    DataQualityModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    // Powers @Cron in ProviderSyncSchedulerService. No-op on serverless (Vercel)
    // where nothing stays resident — the Vercel Cron entry covers that case.
    ScheduleModule.forRoot(),
    AuthModule,
    AssistantModule,
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
