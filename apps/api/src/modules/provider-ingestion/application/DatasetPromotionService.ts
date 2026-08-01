import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';
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

type BusProviderCode =
  | 'WBBUS'
  | 'WBBUSTIME'
  | 'BUSSATHI'
  | 'OPENSTREETMAP'
  | 'NOMINATIM'
  | 'CENSUS_INDIA'
  | 'DATA_GOV_INDIA'
  | 'BMTC_OFFICIAL'
  | 'WBTC'
  | 'NBSTC'
  | 'SBSTC'
  | 'KOLKATA_TRAM'
  | 'WB_FERRY'
  | 'EASTERN_RAILWAY_SUBURBAN';
type MetroProviderCode = 'BMRCL_METRO' | 'KOLKATA_METRO';

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

        if (this.isMetroProviderCode(run?.providerCode)) {
          await this.promoteMetroNetwork(version, transaction, run.providerCode);
        }

        if (this.isBusProviderCode(run?.providerCode)) {
          await this.promoteBusNetwork(version, transaction, run.providerCode);
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

  private isMetroProviderCode(providerCode?: string): providerCode is MetroProviderCode {
    return providerCode === 'BMRCL_METRO' || providerCode === 'KOLKATA_METRO';
  }

  private isBusProviderCode(providerCode?: string): providerCode is BusProviderCode {
    return (
      providerCode === 'WBBUS' ||
      providerCode === 'WBBUSTIME' ||
      providerCode === 'BUSSATHI' ||
      providerCode === 'OPENSTREETMAP' ||
      providerCode === 'NOMINATIM' ||
      providerCode === 'CENSUS_INDIA' ||
      providerCode === 'DATA_GOV_INDIA' ||
      providerCode === 'BMTC_OFFICIAL' ||
      providerCode === 'WBTC' ||
      providerCode === 'NBSTC' ||
      providerCode === 'SBSTC' ||
      providerCode === 'KOLKATA_TRAM' ||
      providerCode === 'WB_FERRY' ||
      providerCode === 'EASTERN_RAILWAY_SUBURBAN'
    );
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

  private async promoteMetroNetwork(version: DatasetVersionModel, transaction: Transaction, providerCode: MetroProviderCode) {
    const providerLabel = providerCode === 'BMRCL_METRO' ? 'BMRCL' : 'Kolkata Metro';
    const mappingConfidence = providerCode === 'BMRCL_METRO' ? 0.9 : 0.72;
    const stagedNodes = await this.stagedNodeModel.findAll({ where: { datasetVersionId: version.id, providerCode }, transaction });
    const stagedRoutes = await this.stagedRouteModel.findAll({ where: { datasetVersionId: version.id, providerCode }, transaction });
    const stagedRouteStops = await this.stagedRouteStopModel.findAll({
      where: { datasetVersionId: version.id, providerCode },
      transaction,
    });
    const observationIds = Array.from(
      new Set(
        [...stagedNodes, ...stagedRoutes, ...stagedRouteStops]
          .map(record => record.sourceObservationId)
          .filter(Boolean),
      ),
    );
    const observations = observationIds.length
      ? await this.sourceObservationModel.findAll({ where: { id: observationIds, providerCode }, transaction })
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
        message: `${providerLabel} dataset promotion failed validation.`,
        errors,
      });
    }

    const stationIdsByExternalId = await this.materializeMetroStations(stagedNodes, version.id, providerCode, mappingConfidence, transaction);
    const lineIdsByExternalId = await this.materializeMetroLines(stagedRoutes, version.id, providerCode, mappingConfidence, transaction);

    await this.metroLineStationModel.destroy({
      where: {
        datasetVersionId: version.id,
      },
      transaction,
    });

    const lineStationsToCreate: Record<string, unknown>[] = [];
    for (const routeStop of stagedRouteStops) {
      const payload = routeStop.canonicalPayload || {};
      const lineId = lineIdsByExternalId.get(String(payload.routeExternalId));
      const stationId = stationIdsByExternalId.get(String(payload.nodeExternalId));

      if (!lineId || !stationId) {
        throw new BadRequestException(`Critical route stop cannot be mapped: ${routeStop.providerExternalId}`);
      }

      lineStationsToCreate.push({
        id: ensureUuidV7(),
        lineId,
        stationId,
        sequence: Number(payload.sequence),
        datasetVersionId: version.id,
      });
    }
    await this.bulkCreateInBatches(this.metroLineStationModel, lineStationsToCreate, transaction);
  }

  private async promoteBusNetwork(version: DatasetVersionModel, transaction: Transaction, providerCode: BusProviderCode) {
    const providerLabelByCode: Record<BusProviderCode, string> = {
      WBBUS: 'WBBus',
      WBBUSTIME: 'WBBustime',
      BUSSATHI: 'Bus Sathi',
      OPENSTREETMAP: 'OpenStreetMap',
      NOMINATIM: 'Nominatim',
      CENSUS_INDIA: 'Census of India',
      DATA_GOV_INDIA: 'Data.gov.in',
      BMTC_OFFICIAL: 'BMTC',
      WBTC: 'WBTC',
      NBSTC: 'NBSTC',
      SBSTC: 'SBSTC',
      KOLKATA_TRAM: 'Kolkata Tram',
      WB_FERRY: 'West Bengal Ferry',
      EASTERN_RAILWAY_SUBURBAN: 'Eastern Railway Suburban',
    };
    const mappingConfidenceByCode: Record<BusProviderCode, number> = {
      WBBUS: 0.65,
      WBBUSTIME: 0.88,
      BUSSATHI: 0.86,
      OPENSTREETMAP: 0.95,
      NOMINATIM: 0.92,
      CENSUS_INDIA: 0.98,
      DATA_GOV_INDIA: 0.90,
      BMTC_OFFICIAL: 0.78,
      WBTC: 0.84,
      NBSTC: 0.82,
      SBSTC: 0.82,
      KOLKATA_TRAM: 0.68,
      WB_FERRY: 0.78,
      EASTERN_RAILWAY_SUBURBAN: 0.7,
    };
    const providerLabel = providerLabelByCode[providerCode];
    const mappingConfidence = mappingConfidenceByCode[providerCode];
    const stagedNodes = await this.stagedNodeModel.findAll({ where: { datasetVersionId: version.id, providerCode }, transaction });
    const stagedRoutes = await this.stagedRouteModel.findAll({ where: { datasetVersionId: version.id, providerCode }, transaction });
    const stagedRouteStops = await this.stagedRouteStopModel.findAll({ where: { datasetVersionId: version.id, providerCode }, transaction });
    const stagedTrips = await this.stagedTripModel.findAll({ where: { datasetVersionId: version.id, providerCode }, transaction });
    const stagedStopTimes = await this.stagedStopTimeModel.findAll({ where: { datasetVersionId: version.id, providerCode }, transaction });
    const observationIds = Array.from(
      new Set(
        [...stagedNodes, ...stagedRoutes, ...stagedRouteStops, ...stagedTrips, ...stagedStopTimes]
          .map(record => record.sourceObservationId)
          .filter(Boolean),
      ),
    );
    const observations = observationIds.length
      ? await this.sourceObservationModel.findAll({ where: { id: observationIds, providerCode }, transaction })
      : [];
    const errors: string[] = [];

    if (!observations.length) {
      errors.push('No source observation exists.');
    }
    if (!stagedNodes.length && !stagedRoutes.length) {
      errors.push(`Parsed ${providerLabel} output is empty.`);
    }

    const nodesByExternalId = new Map<string, any>();
    for (const node of stagedNodes) {
      if (!node.providerExternalId) {
        errors.push(`Critical ${providerLabel} stop record cannot be mapped because providerExternalId is missing.`);
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
        message: `${providerLabel} dataset promotion failed validation.`,
        errors,
      });
    }

    const stopIdsByExternalId = await this.materializeBusStops(
      stagedNodes,
      version.id,
      providerCode,
      mappingConfidence,
      transaction,
    );
    const routeIdsByExternalId = await this.materializeBusRoutes(
      stagedRoutes,
      version.id,
      providerCode,
      mappingConfidence,
      transaction,
    );

    const routeIds = Array.from(routeIdsByExternalId.values());
    if (routeIds.length) {
      await this.busRouteStopModel.destroy({ where: { routeId: { [Op.in]: routeIds } }, transaction });
    }

    const busRouteStopsToCreate: Record<string, unknown>[] = [];
    for (const routeStop of stagedRouteStops) {
      const payload = routeStop.canonicalPayload || {};
      const routeId = routeIdsByExternalId.get(String(payload.routeExternalId));
      const stopId = stopIdsByExternalId.get(String(payload.nodeExternalId));
      if (!routeId || !stopId) {
        throw new BadRequestException(`Critical ${providerLabel} route stop cannot be mapped: ${routeStop.providerExternalId}`);
      }
      busRouteStopsToCreate.push({
        id: ensureUuidV7(),
        routeId,
        stopId,
        sequence: Number(payload.sequence),
        datasetVersionId: version.id,
      });
    }
    await this.bulkCreateInBatches(this.busRouteStopModel, busRouteStopsToCreate, transaction);

    const tripIdsByExternalId = await this.materializeBusTrips(
      stagedTrips,
      routeIdsByExternalId,
      version.id,
      providerCode,
      providerLabel,
      mappingConfidence,
      transaction,
    );

    const tripIds = Array.from(tripIdsByExternalId.values());
    if (tripIds.length) {
      await this.busStopTimeModel.destroy({ where: { tripId: { [Op.in]: tripIds } }, transaction });
    }

    const busStopTimesToCreate: Record<string, unknown>[] = [];
    for (const stopTime of stagedStopTimes) {
      const payload = stopTime.canonicalPayload || {};
      const tripId = tripIdsByExternalId.get(String(payload.tripExternalId));
      const stopId = stopIdsByExternalId.get(String(payload.stopExternalId));
      if (!tripId || !stopId) {
        throw new BadRequestException(`Critical ${providerLabel} stop time cannot be mapped: ${stopTime.providerExternalId}`);
      }
      busStopTimesToCreate.push({
        id: ensureUuidV7(),
        tripId,
        stopId,
        sequence: Number(payload.sequence),
        arrivalTime: payload.arrivalTime,
        departureTime: payload.departureTime,
        datasetVersionId: version.id,
      });
    }
    await this.bulkCreateInBatches(this.busStopTimeModel, busStopTimesToCreate, transaction);
  }

  private async bulkCreateInBatches(model: any, records: Record<string, unknown>[], transaction: Transaction) {
    const batchSize = Number(process.env.PROMOTION_BATCH_SIZE || 1000);

    for (let index = 0; index < records.length; index += batchSize) {
      await model.bulkCreate(records.slice(index, index + batchSize), { transaction });
    }
  }

  private async bulkUpsertInBatches(
    model: any,
    records: Record<string, unknown>[],
    updateOnDuplicate: string[],
    transaction: Transaction,
  ) {
    const batchSize = Number(process.env.PROMOTION_BATCH_SIZE || 1000);

    for (let index = 0; index < records.length; index += batchSize) {
      await model.bulkCreate(records.slice(index, index + batchSize), {
        transaction,
        updateOnDuplicate,
      });
    }
  }

  private async materializeMetroStations(
    stagedNodes: StagedNodeModel[],
    datasetVersionId: string,
    providerCode: MetroProviderCode,
    mappingConfidence: number,
    transaction: Transaction,
  ) {
    const externalIds = stagedNodes.map(node => node.providerExternalId).filter(Boolean);
    const existingMappings = await this.providerNodeMappingModel.findAll({
      where: { providerCode, providerExternalId: { [Op.in]: externalIds } },
      transaction,
    });
    const mappingsByExternalId = new Map(existingMappings.map(mapping => [mapping.providerExternalId, mapping]));
    const existingStationIds = existingMappings.map(mapping => mapping.canonicalId).filter(Boolean) as string[];
    const existingStations = existingStationIds.length
      ? await this.metroStationModel.findAll({ where: { id: { [Op.in]: existingStationIds } }, transaction })
      : [];
    const stationsById = new Map(existingStations.map(station => [station.id, station]));
    const stationIdsByExternalId = new Map<string, string>();
    const stationsToCreate: Record<string, unknown>[] = [];
    const mappingsToCreate: Record<string, unknown>[] = [];
    const updates: Array<() => Promise<unknown>> = [];

    for (const node of stagedNodes) {
      const payload = (node.canonicalPayload || {}) as any;
      const metadata = (payload.metadata || {}) as Record<string, unknown>;
      const externalId = node.providerExternalId;
      const mapping = mappingsByExternalId.get(externalId);
      const existingStation = mapping?.canonicalId ? stationsById.get(mapping.canonicalId) : null;
      const stationMetadata = {
        ...(existingStation?.metadata || {}),
        sourceObservationId: node.sourceObservationId,
        ...metadata,
      };

      if (existingStation) {
        stationIdsByExternalId.set(externalId, existingStation.id);
        updates.push(() =>
          existingStation.update(
            {
              name: payload.name,
              normalizedName: payload.normalizedName,
              isInterchange: Boolean(metadata.isInterchange),
              datasetVersionId,
              metadata: stationMetadata,
            },
            { transaction },
          ),
        );
        continue;
      }

      const stationId = ensureUuidV7();
      stationIdsByExternalId.set(externalId, stationId);
      stationsToCreate.push({
        id: stationId,
        providerCode,
        externalId,
        name: payload.name,
        normalizedName: payload.normalizedName,
        isInterchange: Boolean(metadata.isInterchange),
        datasetVersionId,
        metadata: stationMetadata,
      });

      if (mapping) {
        updates.push(() =>
          mapping.update(
            {
              canonicalId: stationId,
              resolutionStatus: 'AUTO_RESOLVED',
              confidence: mappingConfidence,
              evidence: {
                ...(mapping.evidence || {}),
                datasetVersionId,
              },
            },
            { transaction },
          ),
        );
      } else {
        mappingsToCreate.push({
          id: ensureUuidV7(),
          providerCode,
          providerExternalId: externalId,
          canonicalId: stationId,
          resolutionStatus: 'AUTO_RESOLVED',
          confidence: mappingConfidence,
          evidence: {
            fallbackIdentity: `${providerCode} + normalized station name + METRO_STATION`,
            datasetVersionId,
          },
        });
      }
    }

    await this.bulkCreateInBatches(this.metroStationModel, stationsToCreate, transaction);
    await this.bulkCreateInBatches(this.providerNodeMappingModel, mappingsToCreate, transaction);
    for (const update of updates) {
      await update();
    }

    return stationIdsByExternalId;
  }

  private async materializeMetroLines(
    stagedRoutes: StagedRouteModel[],
    datasetVersionId: string,
    providerCode: MetroProviderCode,
    mappingConfidence: number,
    transaction: Transaction,
  ) {
    const externalIds = stagedRoutes.map(route => route.providerExternalId).filter(Boolean);
    const existingMappings = await this.providerRouteMappingModel.findAll({
      where: { providerCode, providerExternalId: { [Op.in]: externalIds } },
      transaction,
    });
    const mappingsByExternalId = new Map(existingMappings.map(mapping => [mapping.providerExternalId, mapping]));
    const existingLineIds = existingMappings.map(mapping => mapping.canonicalId).filter(Boolean) as string[];
    const existingLines = existingLineIds.length
      ? await this.metroLineModel.findAll({ where: { id: { [Op.in]: existingLineIds } }, transaction })
      : [];
    const linesById = new Map(existingLines.map(line => [line.id, line]));
    const lineIdsByExternalId = new Map<string, string>();
    const linesToCreate: Record<string, unknown>[] = [];
    const mappingsToCreate: Record<string, unknown>[] = [];
    const updates: Array<() => Promise<unknown>> = [];

    for (const route of stagedRoutes) {
      const payload = (route.canonicalPayload || {}) as any;
      const externalId = route.providerExternalId;
      const mapping = mappingsByExternalId.get(externalId);
      const existingLine = mapping?.canonicalId ? linesById.get(mapping.canonicalId) : null;

      if (existingLine) {
        lineIdsByExternalId.set(externalId, existingLine.id);
        updates.push(() =>
          existingLine.update(
            {
              name: payload.longName,
              color: payload.shortName || payload.longName,
              operationalStatus: payload.operationalStatus || 'UNKNOWN',
              datasetVersionId,
            },
            { transaction },
          ),
        );
        continue;
      }

      const lineId = ensureUuidV7();
      lineIdsByExternalId.set(externalId, lineId);
      linesToCreate.push({
        id: lineId,
        providerCode,
        externalId,
        name: payload.longName,
        color: payload.shortName || payload.longName,
        operationalStatus: payload.operationalStatus || 'UNKNOWN',
        datasetVersionId,
      });

      if (mapping) {
        updates.push(() =>
          mapping.update({ canonicalId: lineId, resolutionStatus: 'AUTO_RESOLVED', confidence: mappingConfidence }, { transaction }),
        );
      } else {
        mappingsToCreate.push({
          id: ensureUuidV7(),
          providerCode,
          providerExternalId: externalId,
          canonicalId: lineId,
          resolutionStatus: 'AUTO_RESOLVED',
          confidence: mappingConfidence,
          evidence: { datasetVersionId },
        });
      }
    }

    await this.bulkCreateInBatches(this.metroLineModel, linesToCreate, transaction);
    await this.bulkCreateInBatches(this.providerRouteMappingModel, mappingsToCreate, transaction);
    for (const update of updates) {
      await update();
    }

    return lineIdsByExternalId;
  }

  private async materializeBusStops(
    stagedNodes: StagedNodeModel[],
    datasetVersionId: string,
    providerCode: BusProviderCode,
    mappingConfidence: number,
    transaction: Transaction,
  ) {
    const externalIds = stagedNodes.map(node => node.providerExternalId).filter(Boolean);
    const existingMappings = await this.providerNodeMappingModel.findAll({
      where: { providerCode, providerExternalId: { [Op.in]: externalIds } },
      transaction,
    });
    const mappingsByExternalId = new Map(existingMappings.map(mapping => [mapping.providerExternalId, mapping]));
    const existingStopIds = existingMappings.map(mapping => mapping.canonicalId).filter(Boolean) as string[];
    const existingStops = existingStopIds.length
      ? await this.busStopModel.findAll({ where: { id: { [Op.in]: existingStopIds } }, transaction })
      : [];
    const stopsById = new Map(existingStops.map(stop => [stop.id, stop]));
    const stopIdsByExternalId = new Map<string, string>();
    const stopsToUpsert: Record<string, unknown>[] = [];
    const mappingsToCreate: Record<string, unknown>[] = [];
    const updates: Array<() => Promise<unknown>> = [];

    for (const node of stagedNodes) {
      const payload = (node.canonicalPayload || {}) as any;
      const externalId = node.providerExternalId;
      const mapping = mappingsByExternalId.get(externalId);
      const existingStop = mapping?.canonicalId ? stopsById.get(mapping.canonicalId) : null;
      const metadata = {
        ...(existingStop?.metadata || {}),
        sourceObservationId: node.sourceObservationId,
        mode: payload.mode,
        nodeType: payload.nodeType,
        aliases: payload.aliases,
        confidence: payload.confidence,
        latitude: payload.latitude,
        longitude: payload.longitude,
        geography: payload.geography,
      };

      if (existingStop) {
        stopIdsByExternalId.set(externalId, existingStop.id);
        stopsToUpsert.push({
          id: existingStop.id,
          providerCode,
          externalId,
          name: payload.name,
          normalizedName: payload.normalizedName,
          datasetVersionId,
          metadata,
        });
        continue;
      }

      const stopId = ensureUuidV7();
      stopIdsByExternalId.set(externalId, stopId);
      stopsToUpsert.push({
        id: stopId,
        providerCode,
        externalId,
        name: payload.name,
        normalizedName: payload.normalizedName,
        datasetVersionId,
        metadata,
      });

      if (mapping) {
        updates.push(() =>
          mapping.update({ canonicalId: stopId, resolutionStatus: 'AUTO_RESOLVED', confidence: mappingConfidence }, { transaction }),
        );
      } else {
        mappingsToCreate.push({
          id: ensureUuidV7(),
          providerCode,
          providerExternalId: externalId,
          canonicalId: stopId,
          resolutionStatus: 'AUTO_RESOLVED',
          confidence: mappingConfidence,
          evidence: {
            fallbackIdentity: `${providerCode} + normalized stop name + BUS_STOP`,
            datasetVersionId,
          },
        });
      }
    }

    await this.bulkUpsertInBatches(this.busStopModel, stopsToUpsert, ['name', 'normalizedName', 'datasetVersionId', 'metadata'], transaction);
    await this.bulkCreateInBatches(this.providerNodeMappingModel, mappingsToCreate, transaction);
    for (const update of updates) {
      await update();
    }

    return stopIdsByExternalId;
  }

  private async materializeBusRoutes(
    stagedRoutes: StagedRouteModel[],
    datasetVersionId: string,
    providerCode: BusProviderCode,
    mappingConfidence: number,
    transaction: Transaction,
  ) {
    const externalIds = stagedRoutes.map(route => route.providerExternalId).filter(Boolean);
    const existingMappings = await this.providerRouteMappingModel.findAll({
      where: { providerCode, providerExternalId: { [Op.in]: externalIds } },
      transaction,
    });
    const mappingsByExternalId = new Map(existingMappings.map(mapping => [mapping.providerExternalId, mapping]));
    const existingRouteIds = existingMappings.map(mapping => mapping.canonicalId).filter(Boolean) as string[];
    const existingRoutes = existingRouteIds.length
      ? await this.busRouteModel.findAll({ where: { id: { [Op.in]: existingRouteIds } }, transaction })
      : [];
    const routesById = new Map(existingRoutes.map(route => [route.id, route]));
    const routeIdsByExternalId = new Map<string, string>();
    const routesToUpsert: Record<string, unknown>[] = [];
    const mappingsToCreate: Record<string, unknown>[] = [];
    const updates: Array<() => Promise<unknown>> = [];

    for (const route of stagedRoutes) {
      const payload = (route.canonicalPayload || {}) as any;
      const externalId = route.providerExternalId;
      const mapping = mappingsByExternalId.get(externalId);
      const existingRoute = mapping?.canonicalId ? routesById.get(mapping.canonicalId) : null;
      const metadata = {
        ...(existingRoute?.metadata || {}),
        shortName: payload.shortName,
        mode: payload.mode,
        serviceClass: payload.serviceClass,
        sourceObservationId: route.sourceObservationId,
      };

      if (existingRoute) {
        routeIdsByExternalId.set(externalId, existingRoute.id);
        routesToUpsert.push({
          id: existingRoute.id,
          providerCode,
          externalId,
          longName: payload.longName,
          directionId: payload.directionId,
          operationalStatus: payload.operationalStatus || 'UNKNOWN',
          datasetVersionId,
          metadata,
        });
        continue;
      }

      const routeId = ensureUuidV7();
      routeIdsByExternalId.set(externalId, routeId);
      routesToUpsert.push({
        id: routeId,
        providerCode,
        externalId,
        longName: payload.longName,
        directionId: payload.directionId,
        operationalStatus: payload.operationalStatus || 'UNKNOWN',
        datasetVersionId,
        metadata,
      });

      if (mapping) {
        updates.push(() =>
          mapping.update({ canonicalId: routeId, resolutionStatus: 'AUTO_RESOLVED', confidence: mappingConfidence }, { transaction }),
        );
      } else {
        mappingsToCreate.push({
          id: ensureUuidV7(),
          providerCode,
          providerExternalId: externalId,
          canonicalId: routeId,
          resolutionStatus: 'AUTO_RESOLVED',
          confidence: mappingConfidence,
          evidence: { datasetVersionId },
        });
      }
    }

    await this.bulkUpsertInBatches(this.busRouteModel, routesToUpsert, ['longName', 'directionId', 'operationalStatus', 'datasetVersionId', 'metadata'], transaction);
    await this.bulkCreateInBatches(this.providerRouteMappingModel, mappingsToCreate, transaction);
    for (const update of updates) {
      await update();
    }

    return routeIdsByExternalId;
  }

  private async materializeBusTrips(
    stagedTrips: StagedTripModel[],
    routeIdsByExternalId: Map<string, string>,
    datasetVersionId: string,
    providerCode: BusProviderCode,
    providerLabel: string,
    mappingConfidence: number,
    transaction: Transaction,
  ) {
    const externalIds = stagedTrips.map(trip => trip.providerExternalId).filter(Boolean);
    const existingMappings = externalIds.length
      ? await this.providerTripMappingModel.findAll({
          where: { providerCode, providerExternalId: { [Op.in]: externalIds } },
          transaction,
        })
      : [];
    const mappingsByExternalId = new Map(existingMappings.map(mapping => [mapping.providerExternalId, mapping]));
    const existingTripIds = existingMappings.map(mapping => mapping.canonicalId).filter(Boolean) as string[];
    const existingTrips = existingTripIds.length
      ? await this.busTripModel.findAll({ where: { id: { [Op.in]: existingTripIds } }, transaction })
      : [];
    const tripsById = new Map(existingTrips.map(trip => [trip.id, trip]));
    const tripIdsByExternalId = new Map<string, string>();
    const tripsToUpsert: Record<string, unknown>[] = [];
    const mappingsToCreate: Record<string, unknown>[] = [];
    const updates: Array<() => Promise<unknown>> = [];

    for (const trip of stagedTrips) {
      const payload = (trip.canonicalPayload || {}) as any;
      const externalId = trip.providerExternalId;
      const routeId = routeIdsByExternalId.get(String(payload.routeExternalId));
      if (!routeId) {
        throw new BadRequestException(`Critical ${providerLabel} trip cannot be mapped to route: ${externalId}`);
      }

      const mapping = mappingsByExternalId.get(externalId);
      const existingTrip = mapping?.canonicalId ? tripsById.get(mapping.canonicalId) : null;
      const tripId = existingTrip?.id || ensureUuidV7();
      const metadata = {
        ...(existingTrip?.metadata || {}),
        sourceObservationId: trip.sourceObservationId,
        mode: payload.mode,
        serviceClass: payload.serviceClass,
      };

      tripIdsByExternalId.set(externalId, tripId);
      tripsToUpsert.push({
        id: tripId,
        providerCode,
        externalId,
        routeId,
        direction: payload.direction,
        vehicleRegistration: payload.vehicleRegistration,
        vehicleName: payload.vehicleName,
        operationalStatus: payload.operationalStatus || 'UNKNOWN',
        datasetVersionId,
        metadata,
      });

      if (mapping && mapping.canonicalId !== tripId) {
        updates.push(() =>
          mapping.update({ canonicalId: tripId, resolutionStatus: 'AUTO_RESOLVED', confidence: mappingConfidence }, { transaction }),
        );
      }

      if (!mapping) {
        mappingsToCreate.push({
          id: ensureUuidV7(),
          providerCode,
          providerExternalId: externalId,
          canonicalId: tripId,
          resolutionStatus: 'AUTO_RESOLVED',
          confidence: mappingConfidence,
          evidence: { datasetVersionId },
        });
      }
    }

    await this.bulkUpsertInBatches(
      this.busTripModel,
      tripsToUpsert,
      ['routeId', 'direction', 'vehicleRegistration', 'vehicleName', 'operationalStatus', 'datasetVersionId', 'metadata'],
      transaction,
    );
    await this.bulkCreateInBatches(this.providerTripMappingModel, mappingsToCreate, transaction);
    for (const update of updates) {
      await update();
    }

    return tripIdsByExternalId;
  }
}
