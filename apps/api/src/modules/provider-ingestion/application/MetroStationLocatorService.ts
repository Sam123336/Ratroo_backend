import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BusStopModel, MetroStationModel } from '../infrastructure/sequelize/models';

/**
 * Give metro stations coordinates, derived from the bus stops of the same name.
 *
 * BMRCL's published station list carries names, lines and sequence but no
 * positions, and the planner works in distances — so an unlocated station can
 * never be found near a rider, anchor a walking leg, or be measured. That is
 * why a journey to a metro station could not be planned at all.
 *
 * Bus stops do have surveyed coordinates, and a metro station usually sits at a
 * bus stop of the same name. That is the only source used: nothing is invented,
 * and a station that cannot be matched stays unlocated rather than being
 * guessed into place.
 *
 * Writes to `metadata.latitude` / `metadata.longitude`, which is where
 * `TransitGraphService` already reads them from.
 */

/** Two stops of the same name further apart than this are different places. */
const DEFAULT_MAX_SPREAD_KM = 0.5;

export interface NamedPoint {
  name: string;
  latitude: number;
  longitude: number;
}

export interface StationMatch {
  externalId: string;
  name: string;
  latitude: number;
  longitude: number;
  /** The stops the position came from, so a reader can audit it. */
  sourceStops: string[];
  spreadKm: number;
  /** True when the stop matched on a bracketed alias rather than its own name. */
  viaAlias: boolean;
}

export interface MatchReport {
  located: StationMatch[];
  ambiguous: Array<{ name: string; candidates: number; spreadKm: number }>;
  unmatched: string[];
}

export interface LocateResult extends MatchReport {
  stationsConsidered: number;
  alreadyLocated: number;
  stopsAvailable: number;
  written: number;
}

/**
 * Station names as riders and operators write them, reduced to a comparable key.
 *
 * The suffixes are dropped because the sources disagree on them by convention
 * rather than by meaning: BMRCL writes "Indiranagar" where the bus operator
 * writes "Indiranagar Bus Stop". Removed from both sides, so nothing matches
 * that would not have matched anyway.
 */
export function normalizeStationName(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(bus\s*)?(stop|station|stand|terminal|terminus|metro|junction|jn|cross|gate|depot)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Operators declare alternative names in brackets: "Kempegowda Bus
 * Station(Majestic/KBS)" is the stop a rider calls Majestic. Those are the
 * operator's own words, not a guess, so they are safe to match on.
 */
export function stopAliases(name: string): string[] {
  const names = [name];
  for (const group of name.matchAll(/\(([^)]*)\)/g)) {
    names.push(...group[1].split(/[/,]/));
  }
  return names.map(value => value.trim()).filter(Boolean);
}

/** Great-circle distance, for judging whether same-named stops are one place. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const radians = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function index(stops: NamedPoint[], withAliases: boolean): Map<string, NamedPoint[]> {
  const byName = new Map<string, NamedPoint[]>();
  for (const stop of stops) {
    const keys = new Set(
      (withAliases ? stopAliases(stop.name) : [stop.name]).map(normalizeStationName),
    );
    for (const key of keys) {
      if (!key) continue;
      const bucket = byName.get(key);
      if (bucket) bucket.push(stop);
      else byName.set(key, [stop]);
    }
  }
  return byName;
}

/**
 * Match stations to stops on an exact normalised name, and only where the
 * answer is unambiguous.
 *
 * Deliberately not fuzzy. The near misses in this data are traps rather than
 * opportunities: the only stop resembling "Whitefield" is "Whitefiled ACP
 * Police Station", and the only one resembling "Baiyappanahalli" is "Old
 * Baiyappanahalli" — a different stop. A fuzzy pass would place both wrongly,
 * and nothing downstream would ever flag it.
 *
 * Ambiguity is refused rather than averaged: "Hosahalli" matches ten stops
 * spread over 49 km, and their mean is a field that would look exactly like a
 * surveyed position.
 *
 * Two passes, in this order and not merged. Alias matching widens every bucket,
 * which turns three otherwise-clean matches ambiguous when applied everywhere;
 * used only on what the strict pass could not place, it costs nothing and
 * recovers Majestic — the Purple/Green interchange, and so the difference
 * between metro transfers being plannable at all.
 */
export function matchStations(
  stations: Array<{ externalId: string; name: string }>,
  stops: NamedPoint[],
  maxSpreadKm = DEFAULT_MAX_SPREAD_KM,
): MatchReport {
  const strict = index(stops, false);
  const withAliases = index(stops, true);
  const report: MatchReport = { located: [], ambiguous: [], unmatched: [] };

  const spreadOf = (candidates: NamedPoint[]) => {
    const lats = candidates.map(c => c.latitude);
    const lngs = candidates.map(c => c.longitude);
    return distanceKm(
      Math.min(...lats), Math.min(...lngs),
      Math.max(...lats), Math.max(...lngs),
    );
  };

  const place = (
    station: { externalId: string; name: string },
    candidates: NamedPoint[],
    viaAlias: boolean,
  ): boolean => {
    const spreadKm = spreadOf(candidates);
    if (spreadKm > maxSpreadKm) return false;

    const lats = candidates.map(c => c.latitude);
    const lngs = candidates.map(c => c.longitude);
    report.located.push({
      externalId: station.externalId,
      name: station.name,
      // Centroid of a cluster this tight is within metres of any member.
      latitude: lats.reduce((sum, v) => sum + v, 0) / lats.length,
      longitude: lngs.reduce((sum, v) => sum + v, 0) / lngs.length,
      sourceStops: candidates.map(c => c.name),
      spreadKm,
      viaAlias,
    });
    return true;
  };

  for (const station of stations) {
    const key = normalizeStationName(station.name);
    const exact = strict.get(key);
    if (exact?.length && place(station, exact, false)) continue;

    const aliased = withAliases.get(key);
    if (!exact?.length && aliased?.length && place(station, aliased, true)) continue;

    const candidates = exact?.length ? exact : aliased;
    if (candidates?.length) {
      report.ambiguous.push({
        name: station.name,
        candidates: candidates.length,
        spreadKm: spreadOf(candidates),
      });
    } else {
      report.unmatched.push(station.name);
    }
  }

  return report;
}

@Injectable()
export class MetroStationLocatorService {
  private readonly logger = new Logger(MetroStationLocatorService.name);

  constructor(
    @InjectModel(MetroStationModel)
    private readonly metroStations: typeof MetroStationModel,
    @InjectModel(BusStopModel)
    private readonly busStops: typeof BusStopModel,
  ) {}

  async locate(options: { dryRun?: boolean; maxSpreadKm?: number } = {}): Promise<LocateResult> {
    const maxSpreadKm = options.maxSpreadKm ?? DEFAULT_MAX_SPREAD_KM;

    const stations = await this.metroStations.findAll();
    const stops = await this.busStops.findAll();

    const located = (row: { metadata?: Record<string, unknown> | null }) =>
      row.metadata?.latitude !== undefined && row.metadata?.latitude !== null;

    // Only stations still missing a position are candidates, which makes a
    // re-run with a wider threshold additive rather than a rewrite.
    const todo = stations.filter(station => !located(station)).map(station => ({
      externalId: station.externalId,
      name: station.name,
    }));

    const points: NamedPoint[] = [];
    for (const stop of stops) {
      const latitude = Number(stop.metadata?.latitude);
      const longitude = Number(stop.metadata?.longitude);
      // Number(null) and Number(undefined) are 0 and NaN respectively; 0,0 is a
      // real place in the Gulf of Guinea, so both are rejected explicitly.
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      if (latitude === 0 && longitude === 0) continue;
      points.push({ name: stop.name, latitude, longitude });
    }

    const report = matchStations(todo, points, maxSpreadKm);

    let written = 0;
    if (!options.dryRun) {
      const byExternalId = new Map(stations.map(station => [station.externalId, station]));
      for (const match of report.located) {
        const station = byExternalId.get(match.externalId);
        if (!station) continue;
        // Merged rather than replaced: metadata carries more than coordinates,
        // and the provenance is what makes a derived position auditable.
        await station.update({
          metadata: {
            ...(station.metadata ?? {}),
            latitude: match.latitude,
            longitude: match.longitude,
            coordinateSource: 'DERIVED_FROM_BUS_STOP',
            coordinateSourceStops: match.sourceStops,
            coordinateSpreadKm: Number(match.spreadKm.toFixed(4)),
            coordinateViaAlias: match.viaAlias,
          },
        });
        written += 1;
      }
      this.logger.log(`Located ${written} metro stations from bus stops of the same name.`);
    }

    return {
      ...report,
      stationsConsidered: todo.length,
      alreadyLocated: stations.length - todo.length,
      stopsAvailable: points.length,
      written,
    };
  }
}
