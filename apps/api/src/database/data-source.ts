import { DataSource, DataSourceOptions } from 'typeorm';
import { TypeOrmStopEntity } from '../modules/transit/infrastructure/typeorm/entities/typeorm-stop.entity';
import { TypeOrmRouteEntity } from '../modules/transit/infrastructure/typeorm/entities/typeorm-route.entity';
import { TypeOrmTripEntity } from '../modules/transit/infrastructure/typeorm/entities/typeorm-trip.entity';
import { TypeOrmAgencyEntity } from '../modules/transit/infrastructure/typeorm/entities/typeorm-agency.entity';
import { TypeOrmStopTimeEntity } from '../modules/transit/infrastructure/typeorm/entities/typeorm-stop-time.entity';
import { AgencyEntity } from './entities/agency.entity';
import { StopEntity } from './entities/stop.entity';
import { RouteEntity } from './entities/route.entity';
import { TripEntity } from './entities/trip.entity';
import { StopTimeEntity } from './entities/stop-time.entity';
import { TransitSourceRecordEntity } from './entities/transit-source-record.entity';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'transit_admin',
  password: process.env.DB_PASSWORD || 'transit_password',
  database: process.env.DB_NAME || 'transit_db',
  entities: [
    AgencyEntity,
    StopEntity,
    RouteEntity,
    TripEntity,
    StopTimeEntity,
    TransitSourceRecordEntity,
    TypeOrmAgencyEntity,
    TypeOrmStopEntity,
    TypeOrmRouteEntity,
    TypeOrmTripEntity,
    TypeOrmStopTimeEntity,
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
