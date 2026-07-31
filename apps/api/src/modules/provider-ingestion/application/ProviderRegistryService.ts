import { Injectable, NotFoundException } from '@nestjs/common';
import { ProviderRegistryEntry } from '../domain/mobility-provider.interface';
import {
  BENGALURU_PROVIDER_PRIORITY,
  BENGALURU_PROVIDER_REGISTRY,
} from '../infrastructure/registry/bengaluru-provider.registry';
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

  listBengaluruProviders(): ProviderRegistryEntry[] {
    return BENGALURU_PROVIDER_PRIORITY.map(code => this.getBengaluruProvider(code));
  }

  getBengaluruProvider(code: string): ProviderRegistryEntry {
    const provider = BENGALURU_PROVIDER_REGISTRY.find(item => item.code === code);

    if (!provider) {
      throw new NotFoundException(`Bengaluru provider "${code}" is not registered`);
    }

    return provider;
  }
}
