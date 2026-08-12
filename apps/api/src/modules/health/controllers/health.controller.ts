import { Controller, Get } from '@nestjs/common';

@Controller('v1/health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'transit-platform-api',
      timestamp: new Date().toISOString(),
    };
  }
}
