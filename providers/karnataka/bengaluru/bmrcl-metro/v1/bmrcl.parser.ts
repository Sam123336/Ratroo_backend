import * as cheerio from 'cheerio';
import { BmrclParsedLine, BmrclParsedNetwork, BmrclRawPage } from './bmrcl.types';

export class BmrclStaticNetworkParser {
  parse(rawPages: BmrclRawPage[]): BmrclParsedNetwork {
    const networkPage = rawPages.find(page => page.sourceRole === 'NETWORK') || rawPages[0];
    const $ = cheerio.load(networkPage?.html || '');
    const text = $('body').text().replace(/\s+/g, ' ');
    const warnings: string[] = [];
    const lines: BmrclParsedLine[] = [];

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

    if (!lines.length) {
      warnings.push('No named metro lines were detected from the static network page.');
    }

    return {
      sourceUrl: networkPage?.sourceUrl || 'https://www.bmrc.co.in/',
      fetchedAt: networkPage?.fetchedAt || new Date().toISOString(),
      contentHash: '',
      rawRecordId: '',
      lines,
      warnings,
    };
  }

  private inferStatus(text: string, lineName: string): BmrclParsedLine['operationalStatus'] {
    const nearbyText = text.slice(Math.max(0, text.toLowerCase().indexOf(lineName.toLowerCase()) - 120));

    if (/under construction|construction|planned|phase/i.test(nearbyText)) {
      return 'UNKNOWN';
    }

    return 'UNKNOWN';
  }
}
