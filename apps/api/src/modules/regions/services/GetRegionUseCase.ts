import { Injectable } from '@nestjs/common';
import { RegionRegistryService } from './RegionRegistryService';

@Injectable()
export class GetRegionUseCase {
  constructor(private readonly registry: RegionRegistryService) {}

  execute(slug: string) {
    return this.registry.findBySlug(slug);
  }
}

