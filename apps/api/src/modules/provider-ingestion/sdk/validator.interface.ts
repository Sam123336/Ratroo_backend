import { ProviderValidationResult } from '../domain/mobility-provider.interface';

export interface IValidator<TRawRecord = Record<string, unknown>> {
  validate(records: TRawRecord[]): Promise<ProviderValidationResult>;
}

export class StandardProviderValidator implements IValidator {
  async validate(records: Record<string, unknown>[]): Promise<ProviderValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!records || records.length === 0) {
      errors.push('No records parsed from provider response.');
      return { isValid: false, errors, warnings };
    }

    let recordsMissingId = 0;
    let recordsMissingCoordinates = 0;

    records.forEach((r, idx) => {
      if (!r.id && !r.code && !r.name && !r.stop_id && !r.route_id && !r.osm_id && !r.cells) {
        recordsMissingId++;
      }
      if (r.lat === undefined && r.latitude === undefined && r.stop_lat === undefined) {
        recordsMissingCoordinates++;
      }
    });

    if (recordsMissingId === records.length) {
      errors.push('All parsed records lack basic identity attributes (id, code, name, stop_id, route_id).');
    }

    if (recordsMissingCoordinates > 0) {
      warnings.push(`${recordsMissingCoordinates}/${records.length} records missing geographical coordinates; pluggable geocoder fallback will be required.`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
