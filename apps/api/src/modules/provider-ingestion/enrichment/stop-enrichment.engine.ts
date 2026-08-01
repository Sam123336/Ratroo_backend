import { Injectable } from '@nestjs/common';
import { CanonicalMobilityNode } from '../domain/canonical-mobility';

export interface EnrichedStopResult {
  canonicalStop: CanonicalMobilityNode;
  mergedProviders: string[];
  confidenceScore: number;
  enrichmentActions: string[];
}

@Injectable()
export class StopEnrichmentEngine {
  enrichStops(incomingStops: CanonicalMobilityNode[], existingStops: CanonicalMobilityNode[]): EnrichedStopResult[] {
    const stopMap = new Map<string, CanonicalMobilityNode>();
    const providerMap = new Map<string, Set<string>>();
    const actionsMap = new Map<string, string[]>();

    existingStops.forEach((stop) => {
      const key = this.normalizeKey(stop.name, stop.geography?.district);
      stopMap.set(key, { ...stop, aliases: [...(stop.aliases || [])] });
      providerMap.set(key, new Set([stop.providerCode]));
      actionsMap.set(key, ['INITIALIZED_FROM_EXISTING_DB']);
    });

    incomingStops.forEach((incoming) => {
      const key = this.normalizeKey(incoming.name, incoming.geography?.district);
      const existing = stopMap.get(key);

      if (!existing) {
        stopMap.set(key, { ...incoming, aliases: [...(incoming.aliases || [])] });
        providerMap.set(key, new Set([incoming.providerCode]));
        actionsMap.set(key, [`NEW_STOP_CREATED_FROM_${incoming.providerCode}`]);
      } else {
        const actions = actionsMap.get(key) || [];
        const providers = providerMap.get(key) || new Set();
        providers.add(incoming.providerCode);

        // Merge Aliases
        const uniqueAliases = new Set([...existing.aliases, ...(incoming.aliases || []), incoming.name]);
        uniqueAliases.delete(existing.name);
        existing.aliases = Array.from(uniqueAliases);
        actions.push(`MERGED_ALIASES_FROM_${incoming.providerCode}`);

        // Coordinate enrichment if missing or higher confidence
        if ((!existing.latitude || !existing.longitude) && incoming.latitude && incoming.longitude) {
          existing.latitude = incoming.latitude;
          existing.longitude = incoming.longitude;
          actions.push(`ENRICHED_COORDINATES_FROM_${incoming.providerCode}`);
        }

        // Merge geography metadata
        if (!existing.geography.block && incoming.geography.block) {
          existing.geography.block = incoming.geography.block;
          actions.push(`ENRICHED_BLOCK_FROM_${incoming.providerCode}`);
        }

        if (!existing.geography.locality && incoming.geography.locality) {
          existing.geography.locality = incoming.geography.locality;
          actions.push(`ENRICHED_LOCALITY_FROM_${incoming.providerCode}`);
        }

        actionsMap.set(key, actions);
      }
    });

    const results: EnrichedStopResult[] = [];
    stopMap.forEach((stop, key) => {
      const providers = Array.from(providerMap.get(key) || []);
      const actions = actionsMap.get(key) || [];
      const confidence = this.calculateConfidence(providers, stop);
      stop.confidence = confidence;

      results.push({
        canonicalStop: stop,
        mergedProviders: providers,
        confidenceScore: confidence,
        enrichmentActions: actions,
      });
    });

    return results;
  }

  private normalizeKey(name: string, district?: string): string {
    const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const dist = (district || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${norm}_${dist}`;
  }

  private calculateConfidence(providers: string[], stop: CanonicalMobilityNode): number {
    let score = 0.5;
    if (providers.length > 1) score += 0.3;
    if (providers.length >= 3) score += 0.15;
    if (stop.latitude && stop.longitude) score += 0.05;
    return Math.min(0.99, Number(score.toFixed(2)));
  }
}
