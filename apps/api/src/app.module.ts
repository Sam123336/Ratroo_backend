import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { HealthController } from './modules/health/health.controller';
import { TransitModule } from './modules/transit/transit.module';
import { RegionsModule } from './modules/regions/regions.module';
import { WBBusModule } from './integrations/transit-providers/wbbus/wbbus.module';
import { TRANSIT_SEQUELIZE_MODELS } from './modules/transit/infrastructure/sequelize/models';
import { ProviderIngestionModule } from './modules/provider-ingestion/provider-ingestion.module';
import { PROVIDER_INGESTION_SEQUELIZE_MODELS } from './modules/provider-ingestion/infrastructure/sequelize/models';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        dialect: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'transit_admin'),
        password: config.get<string>('DB_PASSWORD', 'transit_password'),
        database: config.get<string>('DB_NAME', 'transit_db'),
        models: [
          ...TRANSIT_SEQUELIZE_MODELS,
          ...PROVIDER_INGESTION_SEQUELIZE_MODELS,
        ],
        autoLoadModels: true,
        synchronize: true,
      }),
    }),
    TransitModule,
    RegionsModule,
    ProviderIngestionModule,
    WBBusModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
