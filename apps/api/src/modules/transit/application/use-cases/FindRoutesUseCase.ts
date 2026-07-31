import { Inject, Injectable } from '@nestjs/common';
import { ROUTE_REPOSITORY_TOKEN, RouteRepository } from '../../domain/repositories/RouteRepository';
import { TransitQueryScope } from '../../domain/repositories/StopRepository';

export interface FindRoutesInput {
  page?: number;
  limit?: number;
  search?: string;
  scope?: TransitQueryScope;
}

@Injectable()
export class FindRoutesUseCase {
  constructor(
    @Inject(ROUTE_REPOSITORY_TOKEN)
    private readonly routeRepository: RouteRepository,
  ) {}

  async execute(input: FindRoutesInput) {
    const { page = 1, limit = 50, search, scope } = input;
    return this.routeRepository.findAll(page, limit, search, scope);
  }
}
