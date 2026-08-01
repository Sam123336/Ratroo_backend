import { ProviderRunContext, RawProviderResponse } from '../domain/mobility-provider.interface';

export interface IFetcher<TTarget = unknown> {
  readonly supportedFormat: 'HTML' | 'JSON' | 'XML' | 'CSV' | 'GTFS_ZIP' | 'PDF' | 'IMAGE_OCR';
  fetch(url: string, options?: Record<string, unknown>, context?: ProviderRunContext): Promise<RawProviderResponse>;
}

export class HtmlFetcher implements IFetcher {
  readonly supportedFormat = 'HTML' as const;

  async fetch(url: string, options?: Record<string, unknown>): Promise<RawProviderResponse> {
    const fetchedAt = new Date().toISOString();
    return {
      sourceUrl: url,
      fetchedAt,
      statusCode: 200,
      contentType: 'text/html',
      body: (options?.mockHtml as string) || `<html><body><h1>Fetched content from ${url}</h1></body></html>`,
      contentHash: `hash_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      metadata: options?.metadata as Record<string, unknown> || {},
    };
  }
}

export class JsonFetcher implements IFetcher {
  readonly supportedFormat = 'JSON' as const;

  async fetch(url: string, options?: Record<string, unknown>): Promise<RawProviderResponse> {
    const fetchedAt = new Date().toISOString();
    return {
      sourceUrl: url,
      fetchedAt,
      statusCode: 200,
      contentType: 'application/json',
      body: (options?.mockJson as Record<string, unknown>) || { status: 'success', data: [], url },
      contentHash: `hash_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      metadata: options?.metadata as Record<string, unknown> || {},
    };
  }
}

export class XmlFetcher implements IFetcher {
  readonly supportedFormat = 'XML' as const;

  async fetch(url: string, options?: Record<string, unknown>): Promise<RawProviderResponse> {
    const fetchedAt = new Date().toISOString();
    return {
      sourceUrl: url,
      fetchedAt,
      statusCode: 200,
      contentType: 'application/xml',
      body: (options?.mockXml as string) || `<?xml version="1.0"?><response><url>${url}</url></response>`,
      contentHash: `hash_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      metadata: options?.metadata as Record<string, unknown> || {},
    };
  }
}

export class CsvFetcher implements IFetcher {
  readonly supportedFormat = 'CSV' as const;

  async fetch(url: string, options?: Record<string, unknown>): Promise<RawProviderResponse> {
    const fetchedAt = new Date().toISOString();
    return {
      sourceUrl: url,
      fetchedAt,
      statusCode: 200,
      contentType: 'text/csv',
      body: (options?.mockCsv as string) || 'id,name,lat,lon\n1,stop_a,22.57,88.36',
      contentHash: `hash_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      metadata: options?.metadata as Record<string, unknown> || {},
    };
  }
}

export class GtfsZipFetcher implements IFetcher {
  readonly supportedFormat = 'GTFS_ZIP' as const;

  async fetch(url: string, options?: Record<string, unknown>): Promise<RawProviderResponse> {
    const fetchedAt = new Date().toISOString();
    return {
      sourceUrl: url,
      fetchedAt,
      statusCode: 200,
      contentType: 'application/zip',
      body: (options?.mockZipBuffer as string) || 'PK_GTFS_ZIP_HEADER',
      contentHash: `hash_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      metadata: { isGtfsZip: true, ...((options?.metadata as Record<string, unknown>) || {}) },
    };
  }
}

export class PdfFetcher implements IFetcher {
  readonly supportedFormat = 'PDF' as const;

  async fetch(url: string, options?: Record<string, unknown>): Promise<RawProviderResponse> {
    const fetchedAt = new Date().toISOString();
    return {
      sourceUrl: url,
      fetchedAt,
      statusCode: 200,
      contentType: 'application/pdf',
      body: (options?.mockPdfContent as string) || 'PDF-1.4 Header ... Timetable document ...',
      contentHash: `hash_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      metadata: { pdfParsed: true, ...((options?.metadata as Record<string, unknown>) || {}) },
    };
  }
}

export class ImageOcrFetcher implements IFetcher {
  readonly supportedFormat = 'IMAGE_OCR' as const;

  async fetch(url: string, options?: Record<string, unknown>): Promise<RawProviderResponse> {
    const fetchedAt = new Date().toISOString();
    return {
      sourceUrl: url,
      fetchedAt,
      statusCode: 200,
      contentType: 'image/jpeg',
      body: (options?.mockOcrText as string) || 'OCR Text Extracted: Route 240, Sealdah to Howrah',
      contentHash: `hash_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      metadata: { ocrConfidence: 0.92, ...((options?.metadata as Record<string, unknown>) || {}) },
    };
  }
}
