import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
  const synchronize = config.get<string>('DB_SYNCHRONIZE', databaseUrl ? 'false' : 'true') === 'true';
  const common = {
    dialect: 'postgres' as const,
    models,
    autoLoadModels: true,
    synchronize,
  };
  const sslEnabled = config.get<string>('DB_SSL', databaseUrl ? 'true' : 'false') === 'true';
  const dialectOptions = sslEnabled
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : undefined;

  if (databaseUrl) {
    const parsedUrl = new URL(databaseUrl);

    return {
      ...common,
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port || 5432),
      username: decodeURIComponent(parsedUrl.username),
      password: decodeURIComponent(parsedUrl.password),
      database: decodeURIComponent(parsedUrl.pathname.replace(/^\//, '')),
      dialectOptions,
    };
  }

  return {
    ...common,
    host: config.get<string>('DB_HOST', 'localhost'),
    port: Number(config.get<string>('DB_PORT', '5432')),
    username: config.get<string>('DB_USER', 'transit_admin'),
    password: config.get<string>('DB_PASSWORD', 'transit_password'),
    database: config.get<string>('DB_NAME', 'transit_db'),
    dialectOptions,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    TransitModule,
    RegionsModule,
    ProviderIngestionModule,
    WBBusModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
