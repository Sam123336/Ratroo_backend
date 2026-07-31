import { Injectable, NotFoundException } from '@nestjs/common';
import { ProviderRegistryEntry } from '../domain/mobility-provider.interface';
import {
  WEST_BENGAL_PROVIDER_PRIORITY,
  WEST_BENGAL_PROVIDER_REGISTRY,
} from '../infrastructure/registry/west-bengal-provider.registry';

@Injectable()
export class ProviderRegistryService {
  listWestBengalProviders(): ProviderRegistryEntry[] {
    return WEST_BENGAL_PROVIDER_PRIORITY.map(code => this.getWestBengalProvider(code));
  }

  getWestBengalProvider(code: string): ProviderRegistryEntry {
    const provider = WEST_BENGAL_PROVIDER_REGISTRY.find(item => item.code === code);

    if (!provider) {
      throw new NotFoundException(`West Bengal provider "${code}" is not registered`);
    }

    return provider;
  }
}

