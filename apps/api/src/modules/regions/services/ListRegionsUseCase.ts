import { Injectable } from '@nestjs/common';
import { RegionRegistryService } from './RegionRegistryService';

@Injectable()
export class ListRegionsUseCase {
  constructor(private readonly registry: RegionRegistryService) {}

  execute() {
    return this.registry.findAll().map(region => ({
      slug: region.slug,
      name: region.name,
      type: region.type,
      status: region.status,
      priority: region.priority,
      scope: region.scope,
      supportedApis: region.supportedApis,
      providerCount: region.providers.length,
      notes: region.notes,
    }));
  }
}

