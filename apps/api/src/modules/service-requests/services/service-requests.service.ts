import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { ApiResult } from '../../core/dto/api-response.dto';
import { CreateServiceRequestDto } from '../dto/service-request.dto';
import { ServiceRequestModel } from '../entities/service-request.model';

@Injectable()
export class ServiceRequestsService {
  constructor(
    @InjectModel(ServiceRequestModel)
    private readonly requests: typeof ServiceRequestModel,
  ) {}

  /**
   * Idempotent per number and state: asking twice is the same ask, not two
   * people. Someone who moves and asks again from a different state is a
   * separate row, which is correct — they want both.
   */
  async record(dto: CreateServiceRequestDto): Promise<ApiResult<{ recorded: true }>> {
    const phone = normalisePhone(dto.phone);
    const stateCode = dto.stateCode.trim().toUpperCase();

    await this.requests.findOrCreate({
      where: { phone, stateCode },
      defaults: {
        phone,
        stateCode,
        regionName: dto.regionName?.trim(),
        latitude: dto.latitude,
        longitude: dto.longitude,
        city: dto.city?.trim(),
      },
    });

    return new ApiResult({ recorded: true as const });
  }

  /**
   * Where people are asking from, most-wanted first — the list that decides
   * which state to ingest next.
   */
  async demand(): Promise<ApiResult<Array<{ stateCode: string; requests: number }>>> {
    const rows = await this.requests.findAll({
      attributes: [
        'stateCode',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'requests'],
      ],
      group: ['stateCode'],
      order: [[Sequelize.fn('COUNT', Sequelize.col('id')), 'DESC']],
      raw: true,
    });

    return new ApiResult(
      (rows as unknown as Array<{ stateCode: string; requests: string }>).map(row => ({
        stateCode: row.stateCode,
        requests: Number(row.requests),
      })),
    );
  }
}

/** "+91 98300 12345" and "9830012345" are one person. */
function normalisePhone(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
}
