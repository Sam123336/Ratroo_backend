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

    if (!network.lines.length) {
      warnings.push('No line records detected; keep dataset staged until parser is improved.');
    }

    for (const line of network.lines) {
      if (line.operationalStatus !== 'ACTIVE') {
        warnings.push(`${line.name} is not marked ACTIVE and must not be used for passenger journeys yet.`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

