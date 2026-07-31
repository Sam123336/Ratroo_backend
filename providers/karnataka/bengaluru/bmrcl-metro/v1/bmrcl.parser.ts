import * as cheerio from 'cheerio';
import { BmrclParsedLine, BmrclParsedNetwork, BmrclRawPage } from './bmrcl.types';

export class BmrclStaticNetworkParser {
  parse(rawPages: BmrclRawPage[]): BmrclParsedNetwork {
    const networkPage = rawPages.find(page => page.sourceKind === 'LINES') || rawPages[0];
    const lines = this.parseStructuredLines(rawPages);
    const $ = cheerio.load(networkPage?.html || '');
    const text = $('body').text().replace(/\s+/g, ' ');
    const warnings: string[] = [];

    if (!lines.length) {
      for (const candidate of ['Purple', 'Green', 'Yellow', 'Pink', 'Blue', 'Orange']) {
        if (new RegExp(candidate, 'i').test(text)) {
          lines.push({
            name: `${candidate} Line`,
            color: candidate.toUpperCase(),
            operationalStatus: this.inferStatus(text, candidate),
            stations: [],
          });
        }
      }
    }

    if (!lines.length) {
      warnings.push('No named metro lines were detected from the static network page.');
    }

    return {
      sourceUrl: networkPage?.url || 'https://www.bmrc.co.in/',
      fetchedAt: networkPage?.fetchedAt || new Date().toISOString(),
      contentHash: networkPage?.contentHash || '',
      rawRecordIds: rawPages.map(page => page.rawRecordId || page.url),
      lines,
      warnings,
    };
  }

  private parseStructuredLines(rawPages: BmrclRawPage[]): BmrclParsedLine[] {
    const lines: BmrclParsedLine[] = [];

    for (const page of rawPages) {
      const $ = cheerio.load(page.html);
      $('[data-bmrcl-line]').each((_, element) => {
        const lineElement = $(element);
        const lineName = lineElement.attr('data-bmrcl-line')?.trim();
        if (!lineName) {
          return;
        }

        const stations = lineElement
          .find('[data-station-name]')
          .map((index, stationElement) => {
            const station = $(stationElement);
            const name = station.attr('data-station-name')?.trim() || '';
            return {
              name,
              lineName,
              sequence: Number(station.attr('data-sequence') || index + 1),
              isInterchange: station.attr('data-interchange') === 'true',
            };
          })
          .get()
          .filter(station => station.name);

        lines.push({
          name: lineName,
          color: this.inferColor(lineName),
          operationalStatus: 'ACTIVE',
          stations,
        });
      });
    }

    return lines;
  }

  private inferStatus(text: string, lineName: string): BmrclParsedLine['operationalStatus'] {
    const nearbyText = text.slice(Math.max(0, text.toLowerCase().indexOf(lineName.toLowerCase()) - 120));

    if (/under construction|construction|planned|phase/i.test(nearbyText)) {
      return 'UNKNOWN';
    }

    return 'UNKNOWN';
  }

  private inferColor(lineName: string): string {
    for (const color of ['Purple', 'Green', 'Yellow', 'Pink', 'Blue', 'Orange']) {
      if (new RegExp(color, 'i').test(lineName)) {
        return color.toUpperCase();
      }
    }

    return 'UNKNOWN';
  }
}
