import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ROUTE_REPOSITORY_TOKEN, RouteRepository } from '../../domain/repositories/RouteRepository';

@Injectable()
export class FindRouteDetailsUseCase {
  constructor(
    @Inject(ROUTE_REPOSITORY_TOKEN)
    private readonly routeRepository: RouteRepository,
  ) {}

  async execute(routeId: string) {
    const route = await this.routeRepository.findById(routeId);
    if (!route) {
      throw new NotFoundException(`Route with ID "${routeId}" not found`);
    }
    return route;
  }
}
