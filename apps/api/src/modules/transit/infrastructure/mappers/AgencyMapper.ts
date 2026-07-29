import { Agency } from '../../domain/entities/Agency';
import { TypeOrmAgencyEntity } from '../typeorm/entities/typeorm-agency.entity';

export class AgencyMapper {
  static toDomain(entity: TypeOrmAgencyEntity): Agency {
    return new Agency({
      id: entity.id,
      name: entity.name,
      code: entity.code,
      state: entity.state,
      city: entity.city,
      country: entity.country,
      provider: entity.provider,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toPersistence(domain: Agency): Partial<TypeOrmAgencyEntity> {
    return {
      id: domain.id,
      name: domain.name,
      code: domain.code,
      state: domain.state,
      city: domain.city,
      country: domain.country,
      provider: domain.provider,
    };
  }
}
