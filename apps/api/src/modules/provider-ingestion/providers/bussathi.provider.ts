import { BaseProviderAdapter } from '../sdk/base-provider-adapter';
import { ProviderConfig } from '../sdk/provider-config.interface';
import { HtmlFetcher } from '../sdk/fetcher.interface';
import { DomParser } from '../sdk/parser.interface';
import { StandardProviderValidator } from '../sdk/validator.interface';
import { IMapper } from '../sdk/mapper.interface';
import { CanonicalMobilityDataset } from '../domain/canonical-mobility';
import { ProviderMappingContext } from '../domain/mobility-provider.interface';
import { ensureUuidV7 } from '../../../shared/ids/uuid-v7';
import * as cheerio from 'cheerio';

export const BUSSATHI_CONFIG: ProviderConfig = {
  providerCode: 'BUSSATHI',
  name: 'Bus Sathi Transit Network',
  sourceType: 'COMMUNITY',
  website: 'https://bussathi.in',
  version: 'v1',
  priority: 'P1',
  modes: ['BUS'],
  accessType: 'HTML DOM & REST API',
  initialStatus: 'ACTIVE',
  endpoints: [
    { name: 'Bus Sathi Search Portal', url: 'https://bussathi.in', format: 'HTML' },
  ],
  notes: [
    'Provides bus, route, and stop search, govt & private timetable verification, and route validation across WB.',
  ],
  canonicalTargets: ['providers', 'agencies', 'nodes', 'routePatterns', 'trips', 'fares', 'observations'],
};

export class BusSathiMapper implements IMapper {
  async map(records: Record<string, unknown>[], context: ProviderMappingContext): Promise<CanonicalMobilityDataset> {
    const routePatterns: any[] = [];
    const nodes: any[] = [];

    records.forEach((r, idx) => {
      const html = typeof r.extractedText === 'string' ? r.extractedText : '';
      if (html) {
        const $ = cheerio.load(html);
        $('a[href*="/bus"], a[href*="/route"]').each((i, el) => {
          const text = $(el).text().trim();
          if (text) {
            const routeId = ensureUuidV7();
            routePatterns.push({
              externalId: routeId,
              providerCode: 'BUSSATHI',
              mode: 'BUS',
              shortName: `BS-WB-${i + 1}`,
              longName: text,
              operationalStatus: 'ACTIVE',
              stops: [
                { name: text.split('to')[0]?.trim() || text, sequence: 1 },
                { name: text.split('to')[1]?.trim() || 'Terminal', sequence: 2 },
              ],
            });
          }
        });
      }
    });

    return {
      providers: [
        {
          code: 'BUSSATHI',
          name: 'Bus Sathi Transit Network',
          sourceType: 'COMMUNITY',
          website: 'https://bussathi.in',
          version: 'v1',
          transportModes: ['BUS'],
        },
      ],
      agencies: [],
      nodes,
      routePatterns,
      trips: [],
      frequencies: [],
      fares: [],
      observations: [
        {
          providerCode: 'BUSSATHI',
          providerVersion: 'v1',
          sourceUrl: 'https://bussathi.in',
          fetchedAt: context.fetchedAt,
          contentHash: `hash_bussathi_${Date.now()}`,
          rawRecordId: context.runId,
          confidence: 0.86,
          verificationStatus: 'AUTO_VALIDATED',
          warnings: [],
        },
      ],
    };
  }
}

export class BusSathiProvider extends BaseProviderAdapter {
  readonly config = BUSSATHI_CONFIG;
  readonly fetcher = new HtmlFetcher();
  readonly parser = new DomParser();
  readonly validator = new StandardProviderValidator();
  readonly mapper = new BusSathiMapper();
}
