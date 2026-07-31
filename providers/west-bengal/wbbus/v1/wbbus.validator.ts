import { WBBusRawBus } from './wbbus.types';

export interface WBBusValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class WBBusValidator {
  validate(records: WBBusRawBus[]): WBBusValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const seenUrls = new Set<string>();

    for (const record of records) {
      if (!record.sourceUrl) {
        errors.push('Bus page must have a source URL.');
      }

      if (seenUrls.has(record.sourceUrl)) {
        errors.push(`Duplicate source URL: ${record.sourceUrl}`);
      }
      seenUrls.add(record.sourceUrl);

      const namedStops = record.schedule.filter(stop => stop.stoppageName.trim());
      if (namedStops.length < 2) {
        errors.push(`Route needs at least two named stops: ${record.sourceUrl}`);
      }

      const sequences = namedStops.map(stop => Number(stop.slNo)).filter(Number.isFinite);
      if (new Set(sequences).size !== sequences.length) {
        errors.push(`Stop sequence must be unique: ${record.sourceUrl}`);
      }

      const hasUpTimes = namedStops.some(stop => this.isUsableTime(stop.upTime));
      const hasDownTimes = namedStops.some(stop => this.isUsableTime(stop.downTime));
      if (!hasUpTimes && !hasDownTimes) {
        errors.push(`At least one direction must contain usable times: ${record.sourceUrl}`);
      }

      if (!hasDownTimes) {
        warnings.push(`DOWN direction unavailable and must not be inferred silently: ${record.sourceUrl}`);
      }

      for (const stop of namedStops) {
        if (stop.upTime && !this.isBlankTime(stop.upTime) && !this.isUsableTime(stop.upTime)) {
          warnings.push(`Invalid UP time "${stop.upTime}" at ${stop.stoppageName}`);
        }
        if (stop.downTime && !this.isBlankTime(stop.downTime) && !this.isUsableTime(stop.downTime)) {
          warnings.push(`Invalid DOWN time "${stop.downTime}" at ${stop.stoppageName}`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private isBlankTime(value?: string): boolean {
    return !value || value.trim() === '_ _ : _ _';
  }

  private isUsableTime(value?: string): boolean {
    if (this.isBlankTime(value)) {
      return false;
    }

    return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value!.trim());
  }
}

