import { Inject, Injectable } from '@nestjs/common';
import { ROUTE_REPOSITORY_TOKEN, RouteRepository } from '../../domain/repositories/RouteRepository';

export interface FindRoutesInput {
  page?: number;
  limit?: number;
  search?: string;
}

@Injectable()
export class FindRoutesUseCase {
  constructor(
    @Inject(ROUTE_REPOSITORY_TOKEN)
    private readonly routeRepository: RouteRepository,
  ) {}

  async execute(input: FindRoutesInput) {
    const { page = 1, limit = 50, search } = input;
    return this.routeRepository.findAll(page, limit, search);
  }
}
