import { Injectable, NotFoundException } from '@nestjs/common';
import { UniversalSearchService, SearchResultItem } from './universal-search.service';

export interface ResolvedAliasChain {
  inputQuery: string;
  expandedAlias: string;
  matchedEntity: SearchResultItem;
  nearestTransportNode?: SearchResultItem;
  nextStep: 'JOURNEY_SEARCH' | 'STOP_TIMES' | 'NODE_EXPLORE';
}

@Injectable()
export class AliasResolverService {
  constructor(private readonly searchService: UniversalSearchService) {}

  async resolveAlias(inputQuery: string): Promise<ResolvedAliasChain> {
    const raw = inputQuery.trim();
    const searchResults = await this.searchService.search(raw);

    if (searchResults.length === 0) {
      throw new NotFoundException(`No transport entity or alias found matching query '${inputQuery}'.`);
    }

    const topMatch = searchResults[0];
    let nearestNode: SearchResultItem | undefined;

    if (topMatch.category === 'VILLAGE') {
      const stops = await this.searchService.search('Bus');
      nearestNode = stops[0];
    }

    return {
      inputQuery: raw,
      expandedAlias: `${raw} -> ${topMatch.title}${nearestNode ? ` -> ${nearestNode.title}` : ''}`,
      matchedEntity: topMatch,
      nearestTransportNode: nearestNode,
      nextStep: 'JOURNEY_SEARCH',
    };
  }
}
