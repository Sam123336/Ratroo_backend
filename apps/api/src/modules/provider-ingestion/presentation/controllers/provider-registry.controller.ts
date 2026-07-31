import { Controller, Get, Param } from '@nestjs/common';
import { ProviderRegistryService } from '../../application/ProviderRegistryService';

@Controller('v1/provider-registry')
export class ProviderRegistryController {
  constructor(private readonly registry: ProviderRegistryService) {}

  @Get('west-bengal')
  listWestBengalProviders() {
    const providers = this.registry.listWestBengalProviders();

    return {
      data: providers,
      count: providers.length,
      rule: 'Ingestion must save raw source records before parsing, validation, mapping, or promotion.',
    };
  }

  @Get('west-bengal/:code')
  getWestBengalProvider(@Param('code') code: string) {
    return {
      data: this.registry.getWestBengalProvider(code),
    };
  }

  @Get('bengaluru')
  listBengaluruProviders() {
    const providers = this.registry.listBengaluruProviders();

    return {
      data: providers,
      count: providers.length,
      rule: 'Ingestion must save raw source records before parsing, validation, mapping, staging, or promotion.',
    };
  }

  @Get('bengaluru/:code')
  getBengaluruProvider(@Param('code') code: string) {
    return {
      data: this.registry.getBengaluruProvider(code),
    };
  }
}
