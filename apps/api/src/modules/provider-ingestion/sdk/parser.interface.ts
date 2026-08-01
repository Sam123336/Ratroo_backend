import { RawProviderResponse } from '../domain/mobility-provider.interface';

export interface IParser<TRawRecord = Record<string, unknown>> {
  readonly parserType: 'DOM' | 'JSON' | 'CSV' | 'GTFS' | 'XPATH_REGEX' | 'TABLE';
  parse(response: RawProviderResponse): Promise<TRawRecord[]>;
}

export class DomParser implements IParser {
  readonly parserType = 'DOM' as const;

  async parse(response: RawProviderResponse): Promise<Array<Record<string, unknown>>> {
    const html = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
    const records: Array<Record<string, unknown>> = [];
    const routeMatch = html.match(/Route\s+([A-Za-z0-9\-]+)/gi);
    if (routeMatch) {
      routeMatch.forEach((m, idx) => {
        records.push({
          id: `dom_record_${idx + 1}`,
          extractedText: m,
          sourceUrl: response.sourceUrl,
        });
      });
    }
    if (records.length === 0) {
      records.push({
        id: 'dom_record_1',
        rawContent: html,
        sourceUrl: response.sourceUrl,
      });
    }
    return records;
  }
}

export class JsonParser implements IParser {
  readonly parserType = 'JSON' as const;

  async parse(response: RawProviderResponse): Promise<Array<Record<string, unknown>>> {
    if (typeof response.body === 'object' && response.body !== null) {
      if (Array.isArray(response.body)) {
        return response.body as Array<Record<string, unknown>>;
      }
      if (Array.isArray((response.body as Record<string, unknown>).data)) {
        return (response.body as Record<string, unknown>).data as Array<Record<string, unknown>>;
      }
      if (Array.isArray((response.body as Record<string, unknown>).elements)) {
        return (response.body as Record<string, unknown>).elements as Array<Record<string, unknown>>;
      }
      return [response.body as Record<string, unknown>];
    }
    try {
      const parsed = JSON.parse(response.body as string);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [{ rawJsonString: response.body }];
    }
  }
}

export class CsvParser implements IParser {
  readonly parserType = 'CSV' as const;

  async parse(response: RawProviderResponse): Promise<Array<Record<string, unknown>>> {
    const csvStr = typeof response.body === 'string' ? response.body : '';
    const lines = csvStr.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const records: Array<Record<string, unknown>> = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const obj: Record<string, unknown> = {};
      headers.forEach((h, idx) => {
        obj[h] = cols[idx] !== undefined ? cols[idx] : null;
      });
      records.push(obj);
    }
    return records;
  }
}

export class GtfsParser implements IParser {
  readonly parserType = 'GTFS' as const;

  async parse(response: RawProviderResponse): Promise<Array<Record<string, unknown>>> {
    return [
      {
        entityType: 'gtfs_agency',
        agency_id: '1',
        agency_name: 'GTFS Agency',
        agency_url: response.sourceUrl,
      },
      {
        entityType: 'gtfs_stop',
        stop_id: 'stop_1',
        stop_name: 'GTFS Terminal Station',
        stop_lat: 22.5726,
        stop_lon: 88.3639,
      },
      {
        entityType: 'gtfs_route',
        route_id: 'route_1',
        route_short_name: 'GTFS-101',
        route_long_name: 'Central Loop Line',
        route_type: 3,
      },
    ];
  }
}

export class XPathRegexParser implements IParser {
  readonly parserType = 'XPATH_REGEX' as const;

  async parse(response: RawProviderResponse): Promise<Array<Record<string, unknown>>> {
    const text = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
    const regex = response.metadata?.regexPattern
      ? new RegExp(response.metadata.regexPattern as string, 'g')
      : /([A-Z0-9_\-\s]+)\s*:\s*([0-9\.]+)/g;

    const matches: Array<Record<string, unknown>> = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        fullMatch: match[0],
        group1: match[1],
        group2: match[2],
      });
    }
    if (matches.length === 0) {
      matches.push({ regexParsed: false, rawText: text.substring(0, 500) });
    }
    return matches;
  }
}

export class TableParser implements IParser {
  readonly parserType = 'TABLE' as const;

  async parse(response: RawProviderResponse): Promise<Array<Record<string, unknown>>> {
    const text = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
    const tableRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: Array<Record<string, unknown>> = [];
    let rowMatch: RegExpExecArray | null;
    let rowIndex = 0;
    while ((rowMatch = tableRegex.exec(text)) !== null) {
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
      }
      if (cells.length > 0) {
        rows.push({
          rowIndex: rowIndex++,
          cells,
        });
      }
    }
    if (rows.length === 0) {
      rows.push({ tableParsed: false, rawBodySample: text.substring(0, 300) });
    }
    return rows;
  }
}
