import { Injectable } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

@Injectable()
export class StopDeduplicationService {
  constructor(private readonly sequelize: Sequelize) {}

  normalizeStopName(name: string): string {
    if (!name) return '';
    let normalized = name.toLowerCase();
    
    const suffixes = [
      'bus stop', 'bus stand', 'bus terminus', 'terminus', 'station', 
      'halt', 'mor', 'more', 'bazar', 'bazaar', 'market', 'chowk', 'crossing'
    ];
    
    let changed = true;
    while(changed) {
      changed = false;
      for (const suffix of suffixes) {
        if (normalized.endsWith(' ' + suffix)) {
          normalized = normalized.substring(0, normalized.length - suffix.length - 1).trim();
          changed = true;
        }
      }
    }
    
    return normalized.trim();
  }

  async mergeAllDuplicateStops() {
    const groups = await this.sequelize.query<{lower_name: string, cnt: number}>(
      `SELECT LOWER(name) as lower_name, COUNT(*) as cnt FROM bus_stops GROUP BY LOWER(name) HAVING COUNT(*) > 1`,
      { type: QueryTypes.SELECT }
    );

    let totalGroupsProcessed = 0;
    let totalStopsMerged = 0;
    let totalRouteStopRefsUpdated = 0;
    let canonicalStopsCreated = 0;

    for (const group of groups) {
      totalGroupsProcessed++;
      const stops = await this.sequelize.query<any>(
        `SELECT * FROM bus_stops WHERE LOWER(name) = ?`,
        { replacements: [group.lower_name], type: QueryTypes.SELECT }
      );

      stops.sort((a, b) => {
        const confA = a.metadata?.coordinateConfidence || 0;
        const confB = b.metadata?.coordinateConfidence || 0;
        if (confA !== confB) return confB - confA;

        const metaKeysA = a.metadata ? Object.keys(a.metadata).length : 0;
        const metaKeysB = b.metadata ? Object.keys(b.metadata).length : 0;
        if (metaKeysA !== metaKeysB) return metaKeysB - metaKeysA;

        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateA - dateB; // oldest first
      });

      const canonical = stops[0];
      const nonCanonical = stops.slice(1);
      const nonCanonicalIds = nonCanonical.map(s => s.id);

      if (nonCanonicalIds.length > 0) {
        const refs = await this.sequelize.query<{cnt: string}>(
          `SELECT COUNT(*) as cnt FROM bus_route_stops WHERE "stopId" IN (:nonCanonicalIds)`,
          { replacements: { nonCanonicalIds }, type: QueryTypes.SELECT }
        );
        const refsCount = parseInt(refs[0].cnt, 10);
        totalRouteStopRefsUpdated += refsCount;

        await this.sequelize.query(
          `UPDATE bus_route_stops SET "stopId" = :canonicalId WHERE "stopId" IN (:nonCanonicalIds)`,
          { 
            replacements: { canonicalId: canonical.id, nonCanonicalIds }, 
            type: QueryTypes.UPDATE 
          }
        );
      }

      const aliases = new Set<string>(canonical.metadata?.aliases || []);
      for (const stop of nonCanonical) {
        if (stop.name && stop.name !== canonical.name) aliases.add(stop.name);
        if (stop.metadata?.aliases && Array.isArray(stop.metadata.aliases)) {
          stop.metadata.aliases.forEach((a: string) => aliases.add(a));
        }
      }

      const updatedCanonicalMetadata = { 
        ...(canonical.metadata || {}), 
        aliases: Array.from(aliases), 
        lifecycleStatus: 'ACTIVE' 
      };
      
      await this.sequelize.query(
        `UPDATE bus_stops SET metadata = :metadata::jsonb WHERE id = :id`,
        { 
          replacements: { 
            metadata: JSON.stringify(updatedCanonicalMetadata),
            id: canonical.id
          },
          type: QueryTypes.UPDATE 
        }
      );
      canonicalStopsCreated++;

      for (const stop of nonCanonical) {
        const updatedMeta = {
          ...(stop.metadata || {}),
          lifecycleStatus: 'MERGED',
          mergedIntoCanonicalId: canonical.id
        };
        await this.sequelize.query(
          `UPDATE bus_stops SET metadata = :metadata::jsonb WHERE id = :id`,
          { 
            replacements: { 
              metadata: JSON.stringify(updatedMeta),
              id: stop.id
            },
            type: QueryTypes.UPDATE 
          }
        );
        totalStopsMerged++;
      }
    }

    return { totalGroupsProcessed, totalStopsMerged, totalRouteStopRefsUpdated, canonicalStopsCreated };
  }

  async classifyOrphanStops() {
    const orphans = await this.sequelize.query<any>(
      `SELECT id, metadata, "createdAt" FROM bus_stops WHERE id NOT IN (SELECT DISTINCT "stopId" FROM bus_route_stops WHERE "stopId" IS NOT NULL)`,
      { type: QueryTypes.SELECT }
    );

    let totalOrphans = orphans.length;
    let pendingCount = 0;
    let orphanCount = 0;
    let staleCount = 0;

    const now = new Date().getTime();
    const ONE_EIGHTY_DAYS = 180 * 24 * 60 * 60 * 1000;

    for (const stop of orphans) {
      const meta = stop.metadata || {};
      const hasCoordinates = meta.latitude !== undefined && meta.longitude !== undefined && meta.latitude !== null && meta.longitude !== null;
      const hasProviderObservations = Array.isArray(meta.providerObservations) && meta.providerObservations.length > 0;
      
      let lifecycleStatus = 'ORPHAN';
      const isOld = (now - new Date(stop.createdAt).getTime()) > ONE_EIGHTY_DAYS;

      if (hasCoordinates && hasProviderObservations) {
        lifecycleStatus = 'PENDING';
        pendingCount++;
      } else if (hasCoordinates) {
        lifecycleStatus = 'ORPHAN';
        orphanCount++;
      } else if (!hasCoordinates && isOld) {
        lifecycleStatus = 'STALE';
        staleCount++;
      } else {
        lifecycleStatus = 'ORPHAN';
        orphanCount++;
      }

      meta.lifecycleStatus = lifecycleStatus;
      
      await this.sequelize.query(
        `UPDATE bus_stops SET metadata = :metadata::jsonb WHERE id = :id`,
        { 
          replacements: { 
            metadata: JSON.stringify(meta),
            id: stop.id
          },
          type: QueryTypes.UPDATE 
        }
      );
    }

    return { totalOrphans, pendingCount, orphanCount, staleCount };
  }
}
