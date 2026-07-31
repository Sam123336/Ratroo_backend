export interface BmrclHttpResponse {
  sourceUrl: string;
  fetchedAt: string;
  statusCode: number;
  contentType?: string;
  body: string;
  contentHash: string;
  metadata?: Record<string, unknown>;
}

export class BmrclClient {
  async fetchHtml(sourceUrl: string, metadata?: Record<string, unknown>): Promise<BmrclHttpResponse> {
    const response = await fetch(sourceUrl, {
      headers: {
        'user-agent': 'YatrooBot/0.1 provider-research',
      },
    });
    const body = await response.text();

    return {
      sourceUrl,
      fetchedAt: new Date().toISOString(),
      statusCode: response.status,
      contentType: response.headers.get('content-type') || undefined,
      body,
      contentHash: await this.sha256(body),
      metadata,
    };
  }

  private async sha256(value: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);

    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}

