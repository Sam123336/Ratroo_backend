import { BmrclParsedNetwork } from './bmrcl.types';

export interface BmrclValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class BmrclStaticNetworkValidator {
  validate(network: BmrclParsedNetwork): BmrclValidationResult {
    const errors: string[] = [];
    const warnings = [...network.warnings];

    if (!network.sourceUrl) {
      errors.push('BMRCL network source URL is required.');
    }

    if (!network.rawRecordIds.length) {
      errors.push('No raw source record exists.');
    }

    if (!network.lines.length) {
      errors.push('Parsed output is empty.');
    }

    for (const line of network.lines) {
      if (line.stations.length < 2) {
        errors.push(`${line.name} has fewer than two stations.`);
      }

      const sequences = new Set<number>();
      const stationIds = new Map<string, string>();

      for (const station of line.stations) {
        if (station.sequence && sequences.has(station.sequence)) {
          errors.push(`${line.name} contains duplicate station sequence ${station.sequence}.`);
        }
        if (station.sequence) {
          sequences.add(station.sequence);
        }

        const previousName = stationIds.get(station.name.toLowerCase());
        if (previousName && previousName !== station.name) {
          errors.push(`${station.name} maps to multiple unrelated station records.`);
        }
        stationIds.set(station.name.toLowerCase(), station.name);

        if (!station.sequence) {
          errors.push(`${line.name} has station ${station.name} without a sequence.`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
