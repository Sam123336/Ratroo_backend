import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op, Transaction } from 'sequelize';
import { Model, ModelCtor, Sequelize } from 'sequelize-typescript';
import { normaliseTime } from '../domain/time-format';
import { StopRow, clusterStops } from '../domain/stop-clustering';
import {
  PlaceAliasModel, PlaceModel,
} from '../../places/infrastructure/sequelize/models/place.model';
import {
  BusRouteStopModel, BusStopModel, BusStopTimeModel,
} from '../../provider-ingestion/infrastructure/sequelize/models';
import {
  RouteModel, StopModel, StopTimeModel,
} from '../../transit/infrastructure/sequelize/models';

export interface ConsistencyReport {
  stopsMerged: number;
  timesReformatted: number;
  duplicateStopTimesRemoved: number;
  aliasesAdded: number;
  dryRun: boolean;
}

/**
 * The repairs that keep ingested data usable, run on a schedule instead of by
 * hand.
 *
 * Each of these was a one-off script written against a defect found in the
 * app: one bus stand appearing three times because three operators imported
 * it, departure times stored in three different formats, and a place
 * searchable only by whichever operator's wording `places` happened to keep.
 * Ingestion recreates all three every night, so fixing them once fixes
 * nothing.
 *
 * Written through the Sequelize models. The set-based work that would
 * otherwise be a window function is done in TypeScript instead: at this size —
 * around 8,000 stops and 37,000 stop times — holding them is cheap, and the
 * rules stay readable and testable rather than living inside SQL.
 *
 * The clustering and time-parsing rules are imported from the scripts rather
 * than copied, so one definition covers both the terminal and the scheduler.
 */
@Injectable()
export class DataConsistencyService {
  private readonly logger = new Logger(DataConsistencyService.name);

  /** Rows per write. Few enough round trips, small enough to bind. */
  private static readonly BATCH = 1000;

  /** Re-entrant calls are dropped: two of these at once would deadlock. */
  private running = false;

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(StopModel) private readonly stops: typeof StopModel,
    @InjectModel(StopTimeModel) private readonly stopTimes: typeof StopTimeModel,
    @InjectModel(RouteModel) private readonly routes: typeof RouteModel,
    @InjectModel(BusRouteStopModel) private readonly busRouteStops: typeof BusRouteStopModel,
    @InjectModel(BusStopTimeModel) private readonly busStopTimes: typeof BusStopTimeModel,
    @InjectModel(BusStopModel) private readonly busStops: typeof BusStopModel,
    @InjectModel(PlaceModel) private readonly places: typeof PlaceModel,
    @InjectModel(PlaceAliasModel) private readonly aliases: typeof PlaceAliasModel,
  ) {}

  /**
   * Order matters. Stops merge first so the time cleanup sees the collisions
   * that merging creates, and aliases are seeded last against the stop names
   * that survived.
   */
  async run(dryRun = false): Promise<ConsistencyReport | null> {
    if (this.running) {
      this.logger.warn('consistency pass already running; skipping');
      return null;
    }
    this.running = true;

    const startedAt = Date.now();
    try {
      const stopsMerged = await this.mergeDuplicateStops(dryRun);
      const { reformatted, duplicates } = await this.cleanStopTimes(dryRun);
      const aliasesAdded = await this.seedPlaceAliases(dryRun);

      const report: ConsistencyReport = {
        stopsMerged,
        timesReformatted: reformatted,
        duplicateStopTimesRemoved: duplicates,
        aliasesAdded,
        dryRun,
      };

      this.logger.log(
        `consistency pass ${dryRun ? '(dry run) ' : ''}finished in ` +
          `${Math.round((Date.now() - startedAt) / 1000)}s: ` +
          `stopsMerged=${stopsMerged} timesReformatted=${reformatted} ` +
          `duplicateStopTimesRemoved=${duplicates} aliasesAdded=${aliasesAdded}`,
      );

      return report;
    } finally {
      this.running = false;
    }
  }

  /**
   * One stop row per physical place, keeping every operator's services.
   *
   * Merges rather than drops: three rows named "Kolkata" carried different
   * buses between them, and keeping only the first would have hidden the rest.
   */
  private async mergeDuplicateStops(dryRun: boolean): Promise<number> {
    const [stops, serviceCounts] = await Promise.all([
      this.stops.findAll({
        where: { latitude: { [Op.ne]: null }, longitude: { [Op.ne]: null } },
      }),
      this.stopTimes.findAll({
        attributes: ['stopId', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
        group: ['stopId'],
        raw: true,
      }),
    ]);

    const countByStop = new Map<string, number>();
    for (const row of serviceCounts as unknown as Array<{ stopId: string; count: string }>) {
      countByStop.set(row.stopId, Number(row.count));
    }

    const rows: StopRow[] = stops.map(stop => ({
      id: stop.id,
      name: stop.name,
      latitude: stop.latitude == null ? null : String(stop.latitude),
      longitude: stop.longitude == null ? null : String(stop.longitude),
      state: stop.state ?? null,
      provider: stop.provider,
      serviceCount: countByStop.get(stop.id) ?? 0,
    }));

    const clusters = clusterStops(rows);
    const canonicalId = new Map<string, string>();
    for (const cluster of clusters) {
      for (const absorbed of cluster.absorbed) {
        canonicalId.set(absorbed.id, cluster.survivor.id);
      }
    }

    const absorbedIds = [...canonicalId.keys()];
    if (!absorbedIds.length || dryRun) return absorbedIds.length;

    // One transaction: a half-repointed stop is worse than either state, since
    // its services would be split across a row that no longer exists.
    await this.sequelize.transaction(async transaction => {
      await this.repoint(this.stopTimes, 'stopId', canonicalId, transaction);
      await this.repoint(this.routes, 'originStopId', canonicalId, transaction);
      await this.repoint(this.routes, 'destinationStopId', canonicalId, transaction);
      await this.repoint(this.busRouteStops, 'stopId', canonicalId, transaction);
      await this.repoint(this.busStopTimes, 'stopId', canonicalId, transaction);

      // The raw provider rows in bus_stops stay: they are the import's own
      // record of what the operator published, and removing them would make
      // the next ingestion look like a first import.
      await this.stops.destroy({ where: { id: { [Op.in]: absorbedIds } }, transaction });
    });

    return absorbedIds.length;
  }

  /**
   * Moves every reference off the absorbed rows and onto their survivor.
   *
   * Reads the affected rows, rewrites the column in memory and writes them
   * back as one batched upsert. An `UPDATE … WHERE id IN (…)` per cluster
   * would be ~4,000 round trips, which is how the first version of this ran
   * for ten minutes and then rolled back.
   */
  private async repoint(
    model: ModelCtor<Model>,
    column: string,
    canonicalId: Map<string, string>,
    transaction: Transaction,
  ): Promise<void> {
    const affected = await model.findAll({
      where: { [column]: { [Op.in]: [...canonicalId.keys()] } },
      transaction,
    });

    const rows = affected.map(row => ({
      ...(row.get({ plain: true }) as Record<string, unknown>),
      [column]: canonicalId.get(row.get(column) as string),
    }));

    for (let index = 0; index < rows.length; index += DataConsistencyService.BATCH) {
      // Sequelize types bulkCreate against one model's creation attributes,
      // which a helper shared by four models cannot satisfy. Every row here is
      // a row this model just returned, with one column rewritten.
      await model.bulkCreate(
        rows.slice(index, index + DataConsistencyService.BATCH) as never,
        { updateOnDuplicate: [column, 'updatedAt'], transaction },
      );
    }
  }

  /**
   * One time format, one row per (trip, stop, sequence).
   *
   * Everything downstream compares times as strings, so "4:25 AM" sorts after
   * "21:15" and the app's HH:MM parser rejects it outright — those departures
   * silently vanish from "upcoming".
   */
  private async cleanStopTimes(
    dryRun: boolean,
  ): Promise<{ reformatted: number; duplicates: number }> {
    const odd = await this.stopTimes.findAll({
      where: {
        [Op.or]: [
          { departureTime: { [Op.and]: [{ [Op.ne]: null }, { [Op.notRegexp]: '^[0-9]{2}:[0-9]{2}$' }] } },
          { arrivalTime: { [Op.and]: [{ [Op.ne]: null }, { [Op.notRegexp]: '^[0-9]{2}:[0-9]{2}$' }] } },
        ],
      },
    });

    let reformatted = 0;
    for (const row of odd) {
      const departure = normaliseTime(row.departureTime ?? null);
      const arrival = normaliseTime(row.arrivalTime ?? null);
      // A time we cannot read is left alone. Guessing moves a bus.
      if (departure === null && arrival === null) continue;

      reformatted++;
      if (dryRun) continue;

      await row.update({
        departureTime: departure ?? row.departureTime,
        arrivalTime: arrival ?? row.arrivalTime,
      });
    }

    // Duplicate detection in TypeScript rather than a window function: the
    // ranking rule — prefer the row that carries a time, then a scraped one —
    // is a product decision, and it reads far better here than inside SQL.
    const all = await this.stopTimes.findAll({
      attributes: [
        'id', 'tripId', 'stopId', 'stopSequence',
        'departureTime', 'arrivalTime', 'timeSource',
      ],
    });

    const best = new Map<string, StopTimeModel>();
    const redundant: string[] = [];

    for (const row of all) {
      const key = `${row.tripId}|${row.stopId}|${row.stopSequence}`;
      const held = best.get(key);
      if (!held) {
        best.set(key, row);
        continue;
      }
      const loser = preferredStopTime(held, row) === held ? row : held;
      best.set(key, loser === held ? row : held);
      redundant.push(loser.id);
    }

    if (redundant.length && !dryRun) {
      await this.stopTimes.destroy({ where: { id: { [Op.in]: redundant } } });
    }

    return { reformatted, duplicates: redundant.length };
  }

  /**
   * Every operator's wording for a place, searchable.
   *
   * The app was printing "Durgapur (Muchipara)" in a journey leg and then
   * failing to resolve the same string when a rider typed it back, because
   * `places` keeps only one operator's title for the stand.
   */
  private async seedPlaceAliases(dryRun: boolean): Promise<number> {
    const [linkedStops, places, existing] = await Promise.all([
      this.busStops.findAll({ where: { placeId: { [Op.ne]: null } } }),
      this.places.findAll({ attributes: ['id', 'canonicalName', 'normalizedName'] }),
      this.aliases.findAll({ attributes: ['placeId', 'normalizedAlias'] }),
    ]);

    const placeById = new Map(places.map(place => [place.id, place]));
    const seen = new Set(
      existing.map(alias => `${alias.placeId}|${alias.normalizedAlias}`),
    );

    const candidates: Array<{
      placeId: string; providerCode: string; alias: string;
      normalizedAlias: string; confidence: number;
    }> = [];

    for (const stop of linkedStops) {
      const place = stop.placeId ? placeById.get(stop.placeId) : undefined;
      const alias = (stop.name ?? '').trim();
      if (!place || !alias) continue;

      const normalizedAlias = alias.toLowerCase();
      // Names the place already resolves by are not aliases.
      if (normalizedAlias === place.canonicalName?.toLowerCase()) continue;
      if (normalizedAlias === place.normalizedName?.toLowerCase()) continue;

      const key = `${place.id}|${normalizedAlias}`;
      if (seen.has(key)) continue;
      seen.add(key);

      candidates.push({
        placeId: place.id,
        providerCode: stop.providerCode,
        alias,
        normalizedAlias,
        // Only as good as the stop-to-place linkage it comes from, which is
        // fuzzy-matched. Below the 1.0 of hand-confirmed aliases.
        confidence: 0.9,
      });
    }

    if (!candidates.length || dryRun) return candidates.length;

    for (let index = 0; index < candidates.length; index += DataConsistencyService.BATCH) {
      await this.aliases.bulkCreate(
        candidates.slice(index, index + DataConsistencyService.BATCH) as never,
      );
    }

    return candidates.length;
  }
}

/**
 * Which of two rows for the same call to keep: the one carrying a time, then
 * the one whose time was scraped rather than estimated, then the lower id so
 * the outcome is stable between runs.
 */
function preferredStopTime(a: StopTimeModel, b: StopTimeModel): StopTimeModel {
  const score = (row: StopTimeModel) =>
    (row.departureTime ? 4 : 0) +
    (row.arrivalTime ? 2 : 0) +
    (row.timeSource === 'SCRAPED' ? 1 : 0);

  const difference = score(a) - score(b);
  if (difference !== 0) return difference > 0 ? a : b;
  return a.id <= b.id ? a : b;
}
