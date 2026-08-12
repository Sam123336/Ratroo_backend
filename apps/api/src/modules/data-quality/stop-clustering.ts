/**
 * Deciding which stop records describe the same physical place.
 *
 * Was a standalone repair script; the same rules now run nightly from
 * DataConsistencyService, so only the rules remain. Kept as plain functions
 * with no database access, which is what makes them testable.
 */
/**
 * How close two same-named stops must be to count as one place.
 *
 * 150 m covers a bus stand whose operators each pinned a different corner of
 * it, and is well short of the distance between two genuinely different stops
 * that share a locality name.
 */
const MERGE_RADIUS_M = 150;

export interface StopRow {
  id: string;
  name: string;
  latitude: string | null;
  longitude: string | null;
  state: string | null;
  provider: string;
  serviceCount: number;
}

interface Cluster {
  survivor: StopRow;
  absorbed: StopRow[];
}

/** Case and punctuation carry no meaning here: "C.R. Ave" and "CR AVE" are one name. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Metres between two points on a sphere. Good enough at these distances. */
function metresBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Groups rows that are the same place.
 *
 * Greedy single-link clustering against each cluster's survivor rather than
 * its centroid: a moving centroid lets a chain of stops 140 m apart drag a
 * cluster across a kilometre, quietly merging stops that were never close to
 * each other.
 */
export function clusterStops(rows: StopRow[], radius = MERGE_RADIUS_M): Cluster[] {
  const byKey = new Map<string, StopRow[]>();
  for (const row of rows) {
    const key = nameKey(row.name);
    if (!key) continue;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }

  const clusters: Cluster[] = [];

  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue;

    // Best survivor first, so the row every other row is measured against is
    // also the one that keeps its id.
    const ordered = [...bucket].sort(compareSurvivor);
    const open: Cluster[] = [];

    for (const row of ordered) {
      // A stop without coordinates cannot be shown to be the same place as
      // another. Left alone rather than guessed at.
      //
      // The null check is separate because Number(null) is 0, which is finite
      // and sits in the Gulf of Guinea — every uncoordinated stop would have
      // clustered with every other one.
      if (row.latitude === null || row.longitude === null) continue;
      const lat = Number(row.latitude);
      const lon = Number(row.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const home = open.find(cluster => {
        const s = cluster.survivor;
        if (s.state && row.state && s.state !== row.state) return false;
        return (
          metresBetween(Number(s.latitude), Number(s.longitude), lat, lon) <= radius
        );
      });

      if (home) home.absorbed.push(row);
      else open.push({ survivor: row, absorbed: [] });
    }

    clusters.push(...open.filter(cluster => cluster.absorbed.length > 0));
  }

  return clusters;
}

/**
 * Which row keeps its id.
 *
 * The busiest stop wins: it is the one already linked from the most trips, so
 * choosing it moves the fewest rows and keeps whatever external references
 * exist pointing somewhere still meaningful. Ties go to the row that names its
 * state, then to the lowest id so the result is stable between runs.
 */
function compareSurvivor(a: StopRow, b: StopRow): number {
  if (a.serviceCount !== b.serviceCount) return b.serviceCount - a.serviceCount;
  const aState = a.state ? 1 : 0;
  const bState = b.state ? 1 : 0;
  if (aState !== bState) return bState - aState;
  return a.id.localeCompare(b.id);
}
