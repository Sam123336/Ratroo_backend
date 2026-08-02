import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponseDto, ApiResult, ApiMetadataDto } from '../dto/api-response.dto';

@Injectable()
export class TransformResponseInterceptor<T> implements NestInterceptor<T, ApiResponseDto<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponseDto<T>> {
    return next.handle().pipe(
      map((response) => {
        // If the service already wrapped it in ApiResult, unwrap and construct final response
        if (response instanceof ApiResult) {
          return {
            success: true,
            data: response.data,
            metadata: this.fillDefaultMetadata(response.metadata),
          };
        }

        // Otherwise, it's raw data
        return {
          success: true,
          data: response,
          metadata: this.fillDefaultMetadata({}),
        };
      }),
    );
  }

  private fillDefaultMetadata(partialMeta: Partial<ApiMetadataDto>): ApiMetadataDto {
    return {
      canonicalPlaceId: partialMeta.canonicalPlaceId || undefined,
      confidenceScore: partialMeta.confidenceScore ?? 1.0,
      lastUpdated: partialMeta.lastUpdated || new Date().toISOString(),
      lastSyncTimestamp: partialMeta.lastSyncTimestamp || new Date().toISOString(),
      providerCount: partialMeta.providerCount ?? 1,
      providers: partialMeta.providers || ['CANONICAL'],
      providerProvenance: partialMeta.providerProvenance || [],
      deepLinks: partialMeta.deepLinks || [],
      dataSources: partialMeta.dataSources || ['Yatroo Graph'],
      quality: partialMeta.quality || {
        overallConfidence: partialMeta.confidenceScore ?? 1.0,
      },
      sync: partialMeta.sync || {
        lastSync: new Date().toISOString(),
      },
    };
  }
}
