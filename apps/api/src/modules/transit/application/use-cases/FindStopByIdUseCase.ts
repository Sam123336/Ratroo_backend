import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { STOP_REPOSITORY_TOKEN, StopRepository } from '../../domain/repositories/StopRepository';

@Injectable()
export class FindStopByIdUseCase {
  constructor(
    @Inject(STOP_REPOSITORY_TOKEN)
    private readonly stopRepository: StopRepository,
  ) {}

  async execute(id: string) {
    const stop = await this.stopRepository.findById(id);
    if (!stop) {
      throw new NotFoundException(`Stop with ID "${id}" not found`);
    }
    return stop;
  }
}
