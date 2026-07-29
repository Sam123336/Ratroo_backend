import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgencyEntity } from '../entities/agency.entity';
import { StopEntity } from '../entities/stop.entity';
import { RouteEntity } from '../entities/route.entity';
import { TripEntity } from '../entities/trip.entity';
import { StopTimeEntity } from '../entities/stop-time.entity';
import { TransitSourceRecordEntity } from '../entities/transit-source-record.entity';
import { WBBusScrapedBus } from '../../integrations/transit-providers/wbbus/wbbus.types';
import { WBBusMapper } from '../../integrations/transit-providers/wbbus/wbbus.mapper';

@Injectable()
export class ImportWBBusService {
  private readonly logger = new Logger(ImportWBBusService.name);

  constructor(
    @InjectRepository(AgencyEntity)
    private readonly agencyRepo: Repository<AgencyEntity>,
    @InjectRepository(StopEntity)
    private readonly stopRepo: Repository<StopEntity>,
    @InjectRepository(RouteEntity)
    private readonly routeRepo: Repository<RouteEntity>,
    @InjectRepository(TripEntity)
    private readonly tripRepo: Repository<TripEntity>,
    @InjectRepository(StopTimeEntity)
    private readonly stopTimeRepo: Repository<StopTimeEntity>,
    @InjectRepository(TransitSourceRecordEntity)
    private readonly sourceRecordRepo: Repository<TransitSourceRecordEntity>,
    private readonly wbbusMapper: WBBusMapper,
  ) {}

  async importScrapedBuses(scrapedBuses: WBBusScrapedBus[]) {
    this.logger.log(`Starting database ingestion for ${scrapedBuses.length} WBBus items...`);

    // 1. Save raw source records
    for (const bus of scrapedBuses) {
      await this.sourceRecordRepo.save({
        provider: 'WBBUS',
        externalId: bus.sourceUrl,
        sourceUrl: bus.sourceUrl,
        rawData: bus,
        status: 'PROCESSED',
      });
    }

    // 2. Normalize data
    const normalized = this.wbbusMapper.mapToNormalizedTransitData(scrapedBuses);

    // 3. Upsert Agency
    let agency = await this.agencyRepo.findOne({ where: { code: normalized.agency.code } });
    if (!agency) {
      agency = await this.agencyRepo.save({
        name: normalized.agency.name,
        code: normalized.agency.code,
        state: normalized.agency.state,
        city: normalized.agency.city,
        provider: 'WBBUS',
      });
    }

    // 4. Upsert Stops
    const stopEntityMap = new Map<string, StopEntity>();
    for (const stopDto of normalized.stops) {
      let stop = await this.stopRepo.findOne({ where: { normalizedName: stopDto.normalizedName } });
      if (!stop) {
        stop = await this.stopRepo.save({
          name: stopDto.name,
          normalizedName: stopDto.normalizedName,
          provider: 'WBBUS',
          city: stopDto.city,
          state: stopDto.state || 'West Bengal',
        });
      }
      stopEntityMap.set(stopDto.normalizedName, stop);
    }

    // 5. Upsert Routes
    const routeEntityMap = new Map<string, RouteEntity>();
    for (const routeDto of normalized.routes) {
      let route = await this.routeRepo.findOne({ where: { externalId: routeDto.externalId } });
      const originStop = stopEntityMap.get(routeDto.originStopName.toLowerCase());
      const destStop = stopEntityMap.get(routeDto.destinationStopName.toLowerCase());

      if (!route) {
        route = await this.routeRepo.save({
          agencyId: agency.id,
          longName: routeDto.longName,
          shortName: routeDto.shortName || routeDto.longName,
          originStopId: originStop?.id,
          destinationStopId: destStop?.id,
          routeType: 'BUS',
          provider: 'WBBUS',
          externalId: routeDto.externalId,
        });
      }
      routeEntityMap.set(routeDto.externalId, route);
    }

    // 6. Save Trips & StopTimes
    let totalTrips = 0;
    let totalStopTimes = 0;

    for (const tripDto of normalized.trips) {
      const route = routeEntityMap.get(tripDto.routeExternalId);
      if (!route) continue;

      const trip = await this.tripRepo.save({
        routeId: route.id,
        direction: tripDto.direction,
        vehicleName: tripDto.vehicleName,
        vehicleRegistration: tripDto.vehicleRegistration,
        provider: 'WBBUS',
        externalId: tripDto.externalId,
      });
      totalTrips++;

      const stopTimeEntities: Partial<StopTimeEntity>[] = [];
      for (const stDto of tripDto.stopTimes) {
        const stop = stopEntityMap.get(stDto.stopName.toLowerCase());
        if (!stop) continue;

        stopTimeEntities.push({
          tripId: trip.id,
          stopId: stop.id,
          stopSequence: stDto.stopSequence,
          arrivalTime: stDto.arrivalTime,
          departureTime: stDto.departureTime,
        });
      }

      if (stopTimeEntities.length > 0) {
        await this.stopTimeRepo.save(stopTimeEntities);
        totalStopTimes += stopTimeEntities.length;
      }
    }

    this.logger.log(`\n================================`);
    this.logger.log(`INGESTION COMPLETE`);
    this.logger.log(`================================`);
    this.logger.log(`Agency: ${agency.name} (${agency.code})`);
    this.logger.log(`Stops Inserted/Mapped: ${stopEntityMap.size}`);
    this.logger.log(`Routes Created: ${routeEntityMap.size}`);
    this.logger.log(`Trips Inserted: ${totalTrips}`);
    this.logger.log(`Stop Times Created: ${totalStopTimes}`);

    return {
      agency: agency.code,
      stopsCount: stopEntityMap.size,
      routesCount: routeEntityMap.size,
      tripsCount: totalTrips,
      stopTimesCount: totalStopTimes,
    };
  }
}
