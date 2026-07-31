import { Injectable, NotFoundException } from '@nestjs/common';
import { LaunchRegion } from '../domain/Region';
import { LAUNCH_REGIONS } from '../infrastructure/launch-regions.registry';

@Injectable()
export class RegionRegistryService {
  private readonly regions = LAUNCH_REGIONS;

  findAll(): LaunchRegion[] {
    return this.regions;
  }

  findBySlug(slug: string): LaunchRegion {
    const region = this.regions.find(item => item.slug === slug);

    if (!region) {
      throw new NotFoundException(`Launch region "${slug}" is not configured`);
    }

    return region;
  }
}

