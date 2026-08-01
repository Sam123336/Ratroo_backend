import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { DatasetModel, DatasetVersionModel, MetroLineModel, MetroLineStationModel, MetroStationModel } from '../infrastructure/sequelize/models';

@Injectable()
export class MetroNetworkQueryService {
  constructor(
    @InjectModel(DatasetModel)
    private readonly datasetModel: typeof DatasetModel,
    @InjectModel(DatasetVersionModel)
    private readonly datasetVersionModel: typeof DatasetVersionModel,
    @InjectModel(MetroLineModel)
    private readonly metroLineModel: typeof MetroLineModel,
    @InjectModel(MetroStationModel)
    private readonly metroStationModel: typeof MetroStationModel,
    @InjectModel(MetroLineStationModel)
    private readonly metroLineStationModel: typeof MetroLineStationModel,
  ) {}

  async listLines(regionSlug: string) {
    const provider = this.metroProviderForRegion(regionSlug);
    const activeVersion = await this.getActiveMetroVersion(provider.providerCode, provider.datasetName);
    const lines = await this.metroLineModel.findAll({
      where: { providerCode: provider.providerCode, datasetVersionId: activeVersion.id },
      order: [['name', 'ASC']],
    });

    return Promise.all(lines.map(line => this.lineDto(line, activeVersion.id)));
  }

  async getLine(regionSlug: string, id: string) {
    const provider = this.metroProviderForRegion(regionSlug);
    const activeVersion = await this.getActiveMetroVersion(provider.providerCode, provider.datasetName);
    const line = await this.metroLineModel.findOne({
      where: {
        providerCode: provider.providerCode,
        datasetVersionId: activeVersion.id,
        [Op.or]: [{ id }, { externalId: id }],
      },
    });

    if (!line) {
      throw new NotFoundException(`Metro line "${id}" was not found`);
    }

    return this.lineDto(line, activeVersion.id);
  }

  async listStations(regionSlug: string, filters: { lineId?: string; search?: string }) {
    const provider = this.metroProviderForRegion(regionSlug);
    const activeVersion = await this.getActiveMetroVersion(provider.providerCode, provider.datasetName);
    const stationWhere: Record<string, unknown> = {
      providerCode: provider.providerCode,
      datasetVersionId: activeVersion.id,
    };

    if (filters.search) {
      stationWhere[Op.or as unknown as string] = [
        { name: { [Op.iLike]: `%${filters.search}%` } },
        { normalizedName: { [Op.iLike]: `%${filters.search.toLowerCase()}%` } },
      ];
    }

    if (filters.lineId) {
      const line = await this.metroLineModel.findOne({
        where: {
          providerCode: provider.providerCode,
          datasetVersionId: activeVersion.id,
          [Op.or]: [{ id: filters.lineId }, { externalId: filters.lineId }],
        },
      });
      if (!line) {
        return [];
      }
      const lineStations = await this.metroLineStationModel.findAll({
        where: {
          datasetVersionId: activeVersion.id,
          lineId: line.id,
        },
        order: [['sequence', 'ASC']],
      });
      const stationIds = lineStations.map(lineStation => lineStation.stationId);
      const stations = await this.metroStationModel.findAll({
        where: {
          ...stationWhere,
          id: stationIds,
        },
      });
      const stationsById = new Map(stations.map(station => [station.id, station]));
      return lineStations
        .map(lineStation => stationsById.get(lineStation.stationId))
        .filter(Boolean)
        .map(station => this.stationDto(station, activeVersion.id));
    }

    const stations = await this.metroStationModel.findAll({
      where: stationWhere,
      order: [['name', 'ASC']],
    });

    return stations.map(station => this.stationDto(station, activeVersion.id));
  }

  async getStation(regionSlug: string, id: string) {
    const provider = this.metroProviderForRegion(regionSlug);
    const activeVersion = await this.getActiveMetroVersion(provider.providerCode, provider.datasetName);
    const station = await this.metroStationModel.findOne({
      where: {
        providerCode: provider.providerCode,
        datasetVersionId: activeVersion.id,
        [Op.or]: [{ id }, { externalId: id }],
      },
    });

    if (!station) {
      throw new NotFoundException(`Metro station "${id}" was not found`);
    }

    return this.stationDto(station, activeVersion.id);
  }

  private metroProviderForRegion(regionSlug: string) {
    if (regionSlug === 'bengaluru') {
      return {
        providerCode: 'BMRCL_METRO',
        datasetName: 'BMRCL static metro network',
        label: 'BMRCL metro',
      };
    }

    if (regionSlug === 'west-bengal' || regionSlug === 'kolkata') {
      return {
        providerCode: 'KOLKATA_METRO',
        datasetName: 'Kolkata Metro static network',
        label: 'Kolkata Metro',
      };
    }

      throw new NotFoundException(`Metro network is not available for region "${regionSlug}"`);
  }

  private async getActiveMetroVersion(providerCode: string, datasetName: string) {
    const dataset = await this.datasetModel.findOne({
      where: {
        providerCode,
        name: datasetName,
      },
    });

    if (!dataset) {
      throw new NotFoundException(`No ${providerCode} metro dataset has been promoted yet.`);
    }

    const activeVersion = await this.datasetVersionModel.findOne({
      where: {
        datasetId: dataset.id,
        status: 'ACTIVE',
      },
      order: [['updatedAt', 'DESC']],
    });

    if (!activeVersion) {
      throw new NotFoundException(`No active ${providerCode} metro dataset version exists.`);
    }

    return activeVersion;
  }

  private async lineDto(line: MetroLineModel, datasetVersionId: string) {
    const lineStations = await this.metroLineStationModel.findAll({
      where: {
        lineId: line.id,
        datasetVersionId,
      },
      order: [['sequence', 'ASC']],
    });
    const stations = await this.metroStationModel.findAll({
      where: {
        id: lineStations.map(lineStation => lineStation.stationId),
      },
    });
    const stationsById = new Map(stations.map(station => [station.id, station]));

    return {
      id: line.id,
      externalId: line.externalId,
      name: line.name,
      color: line.color,
      operationalStatus: line.operationalStatus,
      stationCount: lineStations.length,
      datasetVersionId: line.datasetVersionId,
      stations: lineStations.map(lineStation => ({
        sequence: lineStation.sequence,
        station: this.stationDto(stationsById.get(lineStation.stationId), datasetVersionId),
      })),
    };
  }

  private stationDto(station: MetroStationModel, datasetVersionId: string) {
    return {
      id: station.id,
      externalId: station.externalId,
      name: station.name,
      normalizedName: station.normalizedName,
      isInterchange: station.isInterchange,
      metadata: station.metadata,
      datasetVersionId,
    };
  }
}
