import { Injectable } from '@nestjs/common';
import { ApiMetadataDto, DeepLinkDto, ProviderProvenanceDto } from '../dto/api-response.dto';

@Injectable()
export class ProvenanceService {
  /**
   * Constructs deep links based on provider code and entity IDs
   */
  generateDeepLinks(providerCode: string, routeId?: string, stopId?: string): DeepLinkDto[] {
    const links: DeepLinkDto[] = [];

    if (providerCode === 'BUSSATHI' && routeId) {
      links.push({
        provider: 'BUSSATHI',
        title: 'View on BusSathi',
        url: `https://bussathi.in/route/${routeId}`,
      });
    }

    if (providerCode === 'WBBUS' && routeId) {
      links.push({
        provider: 'WBBUS',
        title: 'View on WBBUS',
        url: `https://wbbus.in/routes/${routeId}`,
      });
    }

    if (providerCode === 'WBBUSTIME' && routeId) {
      links.push({
        provider: 'WBBUSTIME',
        title: 'View on WBBUSTIME',
        url: `https://wbbustime.com/route/${routeId}`,
      });
    }

    return links;
  }

  /**
   * Generates mock provenance for now. In reality, we will look up the `provider_runs` or `metadata` JSON.
   */
  buildProvenanceForRoute(providerCode: string, externalId: string): ProviderProvenanceDto {
    return {
      provider: providerCode,
      providerEntityId: externalId,
      providerUrl: this.generateDeepLinks(providerCode, externalId)[0]?.url,
      datasetVersion: 'v1.0',
      parserVersion: 'v3.2',
      crawlTimestamp: new Date().toISOString(),
      confidence: 0.98,
    };
  }
}
