import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  BusRouteModel,
  BusRouteStopModel,
  BusStopModel,
  BusStopTimeModel,
  BusTripModel,
  DatasetVersionModel,
  MetroLineModel,
  MetroLineStationModel,
  MetroStationModel,
  ProviderNodeMappingModel,
  ProviderRouteMappingModel,
  ProviderTripMappingModel,
  ProviderRunModel,
  SourceObservationModel,
  StagedNodeModel,
  StagedRouteModel,
  StagedRouteStopModel,
  StagedStopTimeModel,
  StagedTripModel,
} from '../infrastructure/sequelize/models';

@Injectable()
export class DatasetPromotionService {
  constructor(
    @InjectConnection()
    private readonly sequelize: Sequelize,
    @InjectModel(DatasetVersionModel)
    private readonly datasetVersionModel: typeof DatasetVersionModel,
    @InjectModel(ProviderRunModel)
    private readonly providerRunModel: typeof ProviderRunModel,
    @InjectModel(SourceObservationModel)
    private readonly sourceObservationModel: typeof SourceObservationModel,
    @InjectModel(StagedNodeModel)
    private readonly stagedNodeModel: typeof StagedNodeModel,
    @InjectModel(StagedRouteModel)
    private readonly stagedRouteModel: typeof StagedRouteModel,
    @InjectModel(StagedRouteStopModel)
    private readonly stagedRouteStopModel: typeof StagedRouteStopModel,
    @InjectModel(MetroLineModel)
    private readonly metroLineModel: typeof MetroLineModel,
    @InjectModel(MetroStationModel)
    private readonly metroStationModel: typeof MetroStationModel,
    @InjectModel(MetroLineStationModel)
    private readonly metroLineStationModel: typeof MetroLineStationModel,
    @InjectModel(ProviderNodeMappingModel)
    private readonly providerNodeMappingModel: typeof ProviderNodeMappingModel,
    @InjectModel(ProviderRouteMappingModel)
    private readonly providerRouteMappingModel: typeof ProviderRouteMappingModel,
    @InjectModel(ProviderTripMappingModel)
    private readonly providerTripMappingModel: typeof ProviderTripMappingModel,
    @InjectModel(StagedTripModel)
    private readonly stagedTripModel: typeof StagedTripModel,
    @InjectModel(StagedStopTimeModel)
    private readonly stagedStopTimeModel: typeof StagedStopTimeModel,
    @InjectModel(BusRouteModel)
    private readonly busRouteModel: typeof BusRouteModel,
    @InjectModel(BusStopModel)
    private readonly busStopModel: typeof BusStopModel,
    @InjectModel(BusRouteStopModel)
    private readonly busRouteStopModel: typeof BusRouteStopModel,
    @InjectModel(BusTripModel)
    private readonly busTripModel: typeof BusTripModel,
    @InjectModel(BusStopTimeModel)
    private readonly busStopTimeModel: typeof BusStopTimeModel,
  ) {}

  async promoteDatasetVersion(id: string) {
    try {
      return await this.sequelize.transaction(async transaction => {
        const version = await this.datasetVersionModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });

        if (!version) {
          throw new NotFoundException(`Dataset version "${id}" was not found`);
        }

        if (version.status !== 'STAGED') {
          await version.update({ status: 'REJECTED' }, { transaction });
          return {
            id: version.id,
            status: 'REJECTED',
            reason: 'Only STAGED dataset versions can be promoted',
          };
        }

        const run = await this.providerRunModel.findByPk(version.providerRunId, { transaction });

        if (run?.providerCode === 'BMRCL') {
          await this.promoteBmrclMetroNetwork(version, transaction);
        }

        if (run?.providerCode === 'WBBUS') {
          await this.promoteWBBusNetwork(version, transaction);
        }

        await this.datasetVersionModel.update(
          { status: 'SUPERSEDED' },
          {
            where: {
              datasetId: version.datasetId,
              status: 'ACTIVE',
            },
            transaction,
          },
        );

        await version.update({ status: 'ACTIVE' }, { transaction });

        return {
          id: version.id,
          status: version.status,
          promoted: true,
        };
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        await this.datasetVersionModel.update({ status: 'REJECTED' }, { where: { id, status: 'STAGED' } });
      }
      throw error;
    }
  }

  async rejectDatasetVersion(id: string) {
    const version = await this.datasetVersionModel.findByPk(id);

    if (!version) {
      throw new NotFoundException(`Dataset version "${id}" was not found`);
    }

    await version.update({ status: 'REJECTED' });

    return {
      id: version.id,
      status: version.status,
    };
  }

  async enqueueProviderSync(providerCode: string) {
    const run = await this.providerRunModel.create({
      providerCode,
      providerVersion: 'v1',
      status: 'PENDING',
      runType: 'FULL',
      metrics: {},
    });

    return {
      runId: run.id,
      providerCode,
      status: run.status,
      note: 'Run record created. Worker queue dispatch will be connected in the next milestone.',
    };
  }

  private async promoteBmrclMetroNetwork(version: DatasetVersionModel, transaction: Transaction) {
    const [stagedNodes, stagedRoutes, stagedRouteStops] = await Promise.all([
      this.stagedNodeModel.findAll({ where: { datasetVersionId: version.id, providerCode: 'BMRCL' }, transaction }),
      this.stagedRouteModel.findAll({ where: { datasetVersionId: version.id, providerCode: 'BMRCL' }, transaction }),
      this.stagedRouteStopModel.findAll({ where: { datasetVersionId: version.id, providerCode: 'BMRCL' }, transaction }),
    ]);
    const observationIds = Array.from(
      new Set(
        [...stagedNodes, ...stagedRoutes, ...stagedRouteStops]
          .map(record => record.sourceObservationId)
          .filter(Boolean),
      ),
    );
    const observations = observationIds.length
      ? await this.sourceObservationModel.findAll({ where: { id: observationIds, providerCode: 'BMRCL' }, transaction })
      : [];

    const errors: string[] = [];

    if (!observations.length) {
      errors.push('No source observation exists.');
    }

    if (!stagedNodes.length || !stagedRoutes.length) {
      errors.push('Parsed output is empty.');
    }

    const nodesByExternalId = new Map<string, any>();
    for (const node of stagedNodes) {
      if (!node.providerExternalId) {
        errors.push('Critical station record cannot be mapped because providerExternalId is missing.');
        continue;
      }
      const previous = nodesByExternalId.get(node.providerExternalId);
      if (previous && previous.canonicalPayload?.normalizedName !== node.canonicalPayload?.normalizedName) {
        errors.push(`Same external station ID ${node.providerExternalId} maps to multiple unrelated stations.`);
      }
      nodesByExternalId.set(node.providerExternalId, node);
    }

    const routeStopsByRouteId = new Map<string, any[]>();
    for (const routeStop of stagedRouteStops) {
      const payload = routeStop.canonicalPayload || {};
      const routeExternalId = String(payload.routeExternalId || '');
      const nodeExternalId = String(payload.nodeExternalId || '');

      if (!nodesByExternalId.has(nodeExternalId)) {
        errors.push(`Route pattern ${routeExternalId || '(unknown)'} references unknown station ${nodeExternalId || '(missing)'}.`);
      }

      const routeStops = routeStopsByRouteId.get(routeExternalId) || [];
      routeStops.push(routeStop);
      routeStopsByRouteId.set(routeExternalId, routeStops);
    }

    for (const route of stagedRoutes) {
      const routeExternalId = route.providerExternalId || '';
      const routeStops = routeStopsByRouteId.get(routeExternalId) || [];
      const sequences = new Set<number>();

      if (routeStops.length < 2) {
        errors.push(`${route.canonicalPayload?.longName || routeExternalId} has fewer than two stations.`);
      }

      for (const routeStop of routeStops) {
        const sequence = Number(routeStop.canonicalPayload?.sequence);
        if (sequences.has(sequence)) {
          errors.push(`${route.canonicalPayload?.longName || routeExternalId} contains duplicate station sequence ${sequence}.`);
        }
        sequences.add(sequence);
      }
    }

    if (errors.length) {
      await version.update(
        {
          status: 'REJECTED',
          validationSummary: {
            ...(version.validationSummary || {}),
            promotionErrors: errors,
          },
        },
        { transaction },
      );
      throw new BadRequestException({
        message: 'BMRCL dataset promotion failed validation.',
        errors,
      });
    }

    const stationIdsByExternalId = new Map<string, string>();
    for (const node of stagedNodes) {
      const payload = (node.canonicalPayload || {}) as any;
      const metadata = (payload.metadata || {}) as Record<string, unknown>;
      const externalId = node.providerExternalId;
      let mapping = await this.providerNodeMappingModel.findOne({
        where: { providerCode: 'BMRCL', providerExternalId: externalId },
        transaction,
      });
      let station = mapping?.canonicalId ? await this.metroStationModel.findByPk(mapping.canonicalId, { transaction }) : null;

      if (!station) {
        station = await this.metroStationModel.create(
          {
            providerCode: 'BMRCL',
            externalId,
            name: payload.name,
            normalizedName: payload.normalizedName,
            isInterchange: Boolean(metadata.isInterchange),
            datasetVersionId: version.id,
            metadata: {
              sourceObservationId: node.sourceObservationId,
              ...metadata,
            },
          },
          { transaction },
        );
      } else {
        await station.update(
          {
            name: payload.name,
            normalizedName: payload.normalizedName,
            isInterchange: Boolean(metadata.isInterchange),
            datasetVersionId: version.id,
            metadata: {
              ...(station.metadata || {}),
              sourceObservationId: node.sourceObservationId,
              ...metadata,
            },
          },
          { transaction },
        );
      }

      if (!mapping) {
        mapping = await this.providerNodeMappingModel.create(
          {
            providerCode: 'BMRCL',
            providerExternalId: externalId,
            canonicalId: station.id,
            resolutionStatus: 'AUTO_RESOLVED',
            confidence: 0.9,
            evidence: {
              fallbackIdentity: 'BMRCL + normalized station name + METRO_STATION',
              datasetVersionId: version.id,
            },
          },
          { transaction },
        );
      } else if (mapping.canonicalId !== station.id) {
        await mapping.update(
          {
            canonicalId: station.id,
            resolutionStatus: 'AUTO_RESOLVED',
            confidence: 0.9,
            evidence: {
              ...(mapping.evidence || {}),
              datasetVersionId: version.id,
            },
          },
          { transaction },
        );
      }

      stationIdsByExternalId.set(externalId, station.id);
    }

    const lineIdsByExternalId = new Map<string, string>();
    for (const route of stagedRoutes) {
      const payload = (route.canonicalPayload || {}) as any;
      const externalId = route.providerExternalId;
      let mapping = await this.providerRouteMappingModel.findOne({
        where: { providerCode: 'BMRCL', providerExternalId: externalId },
        transaction,
      });
      let line = mapping?.canonicalId ? await this.metroLineModel.findByPk(mapping.canonicalId, { transaction }) : null;

      if (!line) {
        line = await this.metroLineModel.create(
          {
            providerCode: 'BMRCL',
            externalId,
            name: payload.longName,
            color: payload.shortName || payload.longName,
            operationalStatus: payload.operationalStatus || 'UNKNOWN',
            datasetVersionId: version.id,
          },
          { transaction },
        );
      } else {
        await line.update(
          {
            name: payload.longName,
            color: payload.shortName || payload.longName,
            operationalStatus: payload.operationalStatus || 'UNKNOWN',
            datasetVersionId: version.id,
          },
          { transaction },
        );
      }

      if (!mapping) {
        await this.providerRouteMappingModel.create(
          {
            providerCode: 'BMRCL',
            providerExternalId: externalId,
            canonicalId: line.id,
            resolutionStatus: 'AUTO_RESOLVED',
            confidence: 0.92,
            evidence: {
              datasetVersionId: version.id,
            },
          },
          { transaction },
        );
      } else if (mapping.canonicalId !== line.id) {
        await mapping.update({ canonicalId: line.id, resolutionStatus: 'AUTO_RESOLVED', confidence: 0.92 }, { transaction });
      }

      lineIdsByExternalId.set(externalId, line.id);
    }

    await this.metroLineStationModel.destroy({
      where: {
        datasetVersionId: version.id,
      },
      transaction,
    });

    for (const routeStop of stagedRouteStops) {
      const payload = routeStop.canonicalPayload || {};
      const lineId = lineIdsByExternalId.get(String(payload.routeExternalId));
      const stationId = stationIdsByExternalId.get(String(payload.nodeExternalId));

      if (!lineId || !stationId) {
        throw new BadRequestException(`Critical route stop cannot be mapped: ${routeStop.providerExternalId}`);
      }

      await this.metroLineStationModel.create(
        {
          lineId,
          stationId,
          sequence: Number(payload.sequence),
          datasetVersionId: version.id,
        },
        { transaction },
      );
    }
  }

  private async promoteWBBusNetwork(version: DatasetVersionModel, transaction: Transaction) {
    const [stagedNodes, stagedRoutes, stagedRouteStops, stagedTrips, stagedStopTimes] = await Promise.all([
      this.stagedNodeModel.findAll({ where: { datasetVersionId: version.id, providerCode: 'WBBUS' }, transaction }),
      this.stagedRouteModel.findAll({ where: { datasetVersionId: version.id, providerCode: 'WBBUS' }, transaction }),
      this.stagedRouteStopModel.findAll({ where: { datasetVersionId: version.id, providerCode: 'WBBUS' }, transaction }),
      this.stagedTripModel.findAll({ where: { datasetVersionId: version.id, providerCode: 'WBBUS' }, transaction }),
      this.stagedStopTimeModel.findAll({ where: { datasetVersionId: version.id, providerCode: 'WBBUS' }, transaction }),
    ]);
    const observationIds = Array.from(
      new Set(
        [...stagedNodes, ...stagedRoutes, ...stagedRouteStops, ...stagedTrips, ...stagedStopTimes]
          .map(record => record.sourceObservationId)
          .filter(Boolean),
      ),
    );
    const observations = observationIds.length
      ? await this.sourceObservationModel.findAll({ where: { id: observationIds, providerCode: 'WBBUS' }, transaction })
      : [];
    const errors: string[] = [];

    if (!observations.length) {
      errors.push('No source observation exists.');
    }
    if (!stagedNodes.length || !stagedRoutes.length || !stagedTrips.length) {
      errors.push('Parsed WBBus output is empty.');
    }

    const nodesByExternalId = new Map<string, any>();
    for (const node of stagedNodes) {
      if (!node.providerExternalId) {
        errors.push('Critical WBBus stop record cannot be mapped because providerExternalId is missing.');
        continue;
      }
      const previous = nodesByExternalId.get(node.providerExternalId);
      if (previous && previous.canonicalPayload?.normalizedName !== node.canonicalPayload?.normalizedName) {
        errors.push(`Same external stop ID ${node.providerExternalId} maps to multiple unrelated stops.`);
      }
      nodesByExternalId.set(node.providerExternalId, node);
    }

    const routeStopsByRouteId = new Map<string, any[]>();
    for (const routeStop of stagedRouteStops) {
      const payload = routeStop.canonicalPayload || {};
      const routeExternalId = String(payload.routeExternalId || '');
      const nodeExternalId = String(payload.nodeExternalId || '');
      if (!nodesByExternalId.has(nodeExternalId)) {
        errors.push(`Route pattern ${routeExternalId || '(unknown)'} references unknown stop ${nodeExternalId || '(missing)'}.`);
      }
      const routeStops = routeStopsByRouteId.get(routeExternalId) || [];
      routeStops.push(routeStop);
      routeStopsByRouteId.set(routeExternalId, routeStops);
    }

    for (const route of stagedRoutes) {
      const routeExternalId = route.providerExternalId || '';
      const routeStops = routeStopsByRouteId.get(routeExternalId) || [];
      const sequences = new Set<number>();
      if (routeStops.length < 2) {
        errors.push(`${route.canonicalPayload?.longName || routeExternalId} has fewer than two stops.`);
      }
      for (const routeStop of routeStops) {
        const sequence = Number(routeStop.canonicalPayload?.sequence);
        if (sequences.has(sequence)) {
          errors.push(`${route.canonicalPayload?.longName || routeExternalId} contains duplicate stop sequence ${sequence}.`);
        }
        sequences.add(sequence);
      }
    }

    if (errors.length) {
      await version.update(
        {
          status: 'REJECTED',
          validationSummary: {
            ...(version.validationSummary || {}),
            promotionErrors: errors,
          },
        },
        { transaction },
      );
      throw new BadRequestException({
        message: 'WBBus dataset promotion failed validation.',
        errors,
      });
    }

    const stopIdsByExternalId = new Map<string, string>();
    for (const node of stagedNodes) {
      const payload = (node.canonicalPayload || {}) as any;
      const externalId = node.providerExternalId;
      let mapping = await this.providerNodeMappingModel.findOne({
        where: { providerCode: 'WBBUS', providerExternalId: externalId },
        transaction,
      });
      let stop = mapping?.canonicalId ? await this.busStopModel.findByPk(mapping.canonicalId, { transaction }) : null;

      if (!stop) {
        stop = await this.busStopModel.create(
          {
            providerCode: 'WBBUS',
            externalId,
            name: payload.name,
            normalizedName: payload.normalizedName,
            datasetVersionId: version.id,
            metadata: {
              sourceObservationId: node.sourceObservationId,
            },
          },
          { transaction },
        );
      } else {
        await stop.update(
          {
            name: payload.name,
            normalizedName: payload.normalizedName,
            datasetVersionId: version.id,
            metadata: {
              ...(stop.metadata || {}),
              sourceObservationId: node.sourceObservationId,
            },
          },
          { transaction },
        );
      }

      if (!mapping) {
        await this.providerNodeMappingModel.create(
          {
            providerCode: 'WBBUS',
            providerExternalId: externalId,
            canonicalId: stop.id,
            resolutionStatus: 'AUTO_RESOLVED',
            confidence: 0.65,
            evidence: {
              fallbackIdentity: 'WBBUS + normalized stop name + BUS_STOP',
              datasetVersionId: version.id,
            },
          },
          { transaction },
        );
      } else if (mapping.canonicalId !== stop.id) {
        await mapping.update({ canonicalId: stop.id, resolutionStatus: 'AUTO_RESOLVED', confidence: 0.65 }, { transaction });
      }

      stopIdsByExternalId.set(externalId, stop.id);
    }

    const routeIdsByExternalId = new Map<string, string>();
    for (const route of stagedRoutes) {
      const payload = (route.canonicalPayload || {}) as any;
      const externalId = route.providerExternalId;
      let mapping = await this.providerRouteMappingModel.findOne({
        where: { providerCode: 'WBBUS', providerExternalId: externalId },
        transaction,
      });
      let busRoute = mapping?.canonicalId ? await this.busRouteModel.findByPk(mapping.canonicalId, { transaction }) : null;

      if (!busRoute) {
        busRoute = await this.busRouteModel.create(
          {
            providerCode: 'WBBUS',
            externalId,
            longName: payload.longName,
            directionId: payload.directionId,
            operationalStatus: payload.operationalStatus || 'UNKNOWN',
            datasetVersionId: version.id,
            metadata: {
              shortName: payload.shortName,
              serviceClass: payload.serviceClass,
              sourceObservationId: route.sourceObservationId,
            },
          },
          { transaction },
        );
      } else {
        await busRoute.update(
          {
            longName: payload.longName,
            directionId: payload.directionId,
            operationalStatus: payload.operationalStatus || 'UNKNOWN',
            datasetVersionId: version.id,
            metadata: {
              ...(busRoute.metadata || {}),
              shortName: payload.shortName,
              serviceClass: payload.serviceClass,
              sourceObservationId: route.sourceObservationId,
            },
          },
          { transaction },
        );
      }

      if (!mapping) {
        await this.providerRouteMappingModel.create(
          {
            providerCode: 'WBBUS',
            providerExternalId: externalId,
            canonicalId: busRoute.id,
            resolutionStatus: 'AUTO_RESOLVED',
            confidence: 0.65,
            evidence: { datasetVersionId: version.id },
          },
          { transaction },
        );
      } else if (mapping.canonicalId !== busRoute.id) {
        await mapping.update({ canonicalId: busRoute.id, resolutionStatus: 'AUTO_RESOLVED', confidence: 0.65 }, { transaction });
      }

      routeIdsByExternalId.set(externalId, busRoute.id);
    }

    await Promise.all([
      this.busRouteStopModel.destroy({ where: { datasetVersionId: version.id }, transaction }),
      this.busStopTimeModel.destroy({ where: { datasetVersionId: version.id }, transaction }),
    ]);

    for (const routeStop of stagedRouteStops) {
      const payload = routeStop.canonicalPayload || {};
      const routeId = routeIdsByExternalId.get(String(payload.routeExternalId));
      const stopId = stopIdsByExternalId.get(String(payload.nodeExternalId));
      if (!routeId || !stopId) {
        throw new BadRequestException(`Critical WBBus route stop cannot be mapped: ${routeStop.providerExternalId}`);
      }
      await this.busRouteStopModel.create(
        {
          routeId,
          stopId,
          sequence: Number(payload.sequence),
          datasetVersionId: version.id,
        },
        { transaction },
      );
    }

    const tripIdsByExternalId = new Map<string, string>();
    for (const trip of stagedTrips) {
      const payload = (trip.canonicalPayload || {}) as any;
      const externalId = trip.providerExternalId;
      const routeId = routeIdsByExternalId.get(String(payload.routeExternalId));
      if (!routeId) {
        throw new BadRequestException(`Critical WBBus trip cannot be mapped to route: ${externalId}`);
      }

      let mapping = await this.providerTripMappingModel.findOne({
        where: { providerCode: 'WBBUS', providerExternalId: externalId },
        transaction,
      });
      let busTrip = mapping?.canonicalId ? await this.busTripModel.findByPk(mapping.canonicalId, { transaction }) : null;

      if (!busTrip) {
        busTrip = await this.busTripModel.create(
          {
            providerCode: 'WBBUS',
            externalId,
            routeId,
            direction: payload.direction,
            vehicleRegistration: payload.vehicleRegistration,
            vehicleName: payload.vehicleName,
            operationalStatus: payload.operationalStatus || 'UNKNOWN',
            datasetVersionId: version.id,
            metadata: {
              sourceObservationId: trip.sourceObservationId,
              serviceClass: payload.serviceClass,
            },
          },
          { transaction },
        );
      } else {
        await busTrip.update(
          {
            routeId,
            direction: payload.direction,
            vehicleRegistration: payload.vehicleRegistration,
            vehicleName: payload.vehicleName,
            operationalStatus: payload.operationalStatus || 'UNKNOWN',
            datasetVersionId: version.id,
            metadata: {
              ...(busTrip.metadata || {}),
              sourceObservationId: trip.sourceObservationId,
              serviceClass: payload.serviceClass,
            },
          },
          { transaction },
        );
      }

      if (!mapping) {
        await this.providerTripMappingModel.create(
          {
            providerCode: 'WBBUS',
            providerExternalId: externalId,
            canonicalId: busTrip.id,
            resolutionStatus: 'AUTO_RESOLVED',
            confidence: 0.65,
            evidence: { datasetVersionId: version.id },
          },
          { transaction },
        );
      } else if (mapping.canonicalId !== busTrip.id) {
        await mapping.update({ canonicalId: busTrip.id, resolutionStatus: 'AUTO_RESOLVED', confidence: 0.65 }, { transaction });
      }

      tripIdsByExternalId.set(externalId, busTrip.id);
    }

    for (const stopTime of stagedStopTimes) {
      const payload = stopTime.canonicalPayload || {};
      const tripId = tripIdsByExternalId.get(String(payload.tripExternalId));
      const stopId = stopIdsByExternalId.get(String(payload.stopExternalId));
      if (!tripId || !stopId) {
        throw new BadRequestException(`Critical WBBus stop time cannot be mapped: ${stopTime.providerExternalId}`);
      }
      await this.busStopTimeModel.create(
        {
          tripId,
          stopId,
          sequence: Number(payload.sequence),
          arrivalTime: payload.arrivalTime,
          departureTime: payload.departureTime,
          datasetVersionId: version.id,
        },
        { transaction },
      );
    }
  }
}
