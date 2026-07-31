import {
  CanonicalAgency,
  CanonicalMobilityNode,
  CanonicalRoutePattern,
  CanonicalSourceObservation,
} from '../../../../../apps/api/src/modules/provider-ingestion/domain/canonical-mobility';
import { BmrclParsedNetwork } from './bmrcl.types';

export interface BmrclCanonicalOutput {
  agencies: CanonicalAgency[];
  nodes: CanonicalMobilityNode[];
  routePatterns: CanonicalRoutePattern[];
  observations: CanonicalSourceObservation[];
}

export class BmrclStaticNetworkMapper {
  map(network: BmrclParsedNetwork): BmrclCanonicalOutput {
    const agency: CanonicalAgency = {
      externalId: 'bmrcl',
      providerCode: 'BMRCL',
      name: 'Bangalore Metro Rail Corporation Limited',
      shortName: 'BMRCL',
      website: 'https://www.bmrc.co.in/',
      geography: {
        countryCode: 'IN',
        stateCode: 'KA',
        city: 'Bengaluru',
        metropolitanArea: 'Bengaluru Metropolitan Region',
      },
    };

    const routePatterns: CanonicalRoutePattern[] = network.lines.map(line => ({
      externalId: this.externalId(line.name),
      providerCode: 'BMRCL',
      agencyExternalId: 'bmrcl',
      mode: 'METRO',
      longName: line.name,
      operationalStatus: line.operationalStatus,
      serviceClass: 'REGULAR',
      stops: line.stations.map((station, index) => ({
        nodeExternalId: this.externalId(station.name),
        name: station.name,
        sequence: station.sequence || index + 1,
      })),
    }));

    const nodes: CanonicalMobilityNode[] = network.lines.flatMap(line =>
      line.stations.map(station => ({
        externalId: this.externalId(station.name),
        providerCode: 'BMRCL',
        nodeType: station.isInterchange ? 'INTERCHANGE' : 'METRO_STATION',
        name: station.name,
        normalizedName: station.name.toLowerCase(),
        aliases: [],
        geography: {
          countryCode: 'IN',
          stateCode: 'KA',
          city: 'Bengaluru',
          metropolitanArea: 'Bengaluru Metropolitan Region',
        },
        confidence: 0.7,
      })),
    );

    return {
      agencies: [agency],
      nodes,
      routePatterns,
      observations: [
        {
          providerCode: 'BMRCL',
          providerVersion: 'v1',
          sourceUrl: network.sourceUrl,
          fetchedAt: network.fetchedAt,
          contentHash: network.contentHash,
          rawRecordId: network.rawRecordId,
          confidence: 0.75,
          verificationStatus: 'OFFICIAL',
          warnings: network.warnings,
        },
      ],
    };
  }

  private externalId(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
}
