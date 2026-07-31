import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { RawProviderResponse } from '../../../domain/mobility-provider.interface';
import { RawSourceRecordModel } from '../models';

export interface SaveRawSourceRecordInput {
  providerCode: string;
  providerRunId: string;
  response: RawProviderResponse;
}

@Injectable()
export class RawSourceRecordRepository {
  constructor(
    @InjectModel(RawSourceRecordModel)
    private readonly rawSourceRecordModel: typeof RawSourceRecordModel,
  ) {}

  async saveFetchedResponse(input: SaveRawSourceRecordInput): Promise<RawSourceRecordModel> {
    return this.rawSourceRecordModel.create({
      providerCode: input.providerCode,
      providerRunId: input.providerRunId,
      sourceUrl: input.response.sourceUrl,
      contentHash: input.response.contentHash,
      contentType: input.response.contentType,
      statusCode: input.response.statusCode,
      rawPayload: this.serializeBody(input.response.body),
      metadata: input.response.metadata || {},
      status: 'RAW_SAVED',
      fetchedAt: new Date(input.response.fetchedAt),
    });
  }

  private serializeBody(body: RawProviderResponse['body']): unknown {
    if (Buffer.isBuffer(body)) {
      return {
        encoding: 'base64',
        body: body.toString('base64'),
      };
    }

    if (typeof body === 'string') {
      return { body };
    }

    return body;
  }
}

