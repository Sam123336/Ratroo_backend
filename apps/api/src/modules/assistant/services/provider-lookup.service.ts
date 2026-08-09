import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';

/** One bus as the operator's own site currently lists it. */
export interface LiveService {
  name: string;
  registration: string | null;
  from: string | null;
  to: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  sourceUrl: string;
}

const USER_AGENT = 'RatrooBot/1.0 (West Bengal transit app; ankit@trustlenz.com)';
const TIMEOUT_MS = 8000;

/**
 * Live lookups against an operator's own website.
 *
 * This is deliberately not a general web search. The assistant is allowed to
 * consult WBBus.in — a transport directory we already ingest — and nothing
 * else. An open search would put arbitrary pages into the model's context,
 * where any of them could pose as instructions, and would let it answer
 * transit questions from a blog post rather than a timetable.
 *
 * Everything returned is scraped at request time, so it can be newer than our
 * database. It is also unverified: the caller must present it as "the operator
 * lists this right now", never as Ratroo's own data.
 */
@Injectable()
export class ProviderLookupService {
  private readonly logger = new Logger(ProviderLookupService.name);

  /** Buses the operator currently lists between two places. */
  async servicesBetween(from: string, to: string): Promise<LiveService[]> {
    const url =
      `https://wbbus.in/search/view?searchType=1` +
      `&dipo=${encodeURIComponent(from.trim())}&desti=${encodeURIComponent(to.trim())}`;

    const html = await this.fetch(url);
    return html ? this.parseSearchResults(html) : [];
  }

  /** Buses the operator currently lists as calling at one stop. */
  async servicesAtStop(stop: string): Promise<LiveService[]> {
    const url =
      `https://wbbus.in/search/view?searchType=3&stop=${encodeURIComponent(stop.trim())}`;

    const html = await this.fetch(url);
    return html ? this.parseSearchResults(html) : [];
  }

  private async fetch(url: string): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return response.ok ? await response.text() : null;
    } catch (error) {
      // A provider being slow or down must degrade to "no live data", never
      // fail the whole answer — the database result still stands.
      this.logger.warn(`Provider lookup failed for ${url}: ${error}`);
      return null;
    }
  }

  /**
   * Reads the result cards: name, registration, and the origin/destination
   * pair with a time under each.
   */
  private parseSearchResults(html: string): LiveService[] {
    const $ = cheerio.load(html);
    const services: LiveService[] = [];

    $('div.card.busc').each((_, card) => {
      const element = $(card);
      const name = element.find('.card_busname').first().text().trim();
      if (!name) return;

      const registration = /Reg No\s*:\s*([A-Z0-9]+)/i.exec(element.text())?.[1] ?? null;
      const from = element.find('.dip span').eq(0).text().trim() || null;
      const departureTime = element.find('.dip span').eq(1).text().trim() || null;
      const to = element.find('.desti span').eq(0).text().trim() || null;
      const arrivalTime = element.find('.desti span').eq(1).text().trim() || null;

      services.push({
        name,
        registration,
        from,
        to,
        // The site prints "_ _ : _ _" where it has no time; that is not one.
        departureTime: isTime(departureTime) ? departureTime : null,
        arrivalTime: isTime(arrivalTime) ? arrivalTime : null,
        sourceUrl: element.closest('a').attr('href') ?? 'https://wbbus.in',
      });
    });

    return services.slice(0, 6);
  }
}

function isTime(value: string | null): boolean {
  return value !== null && /^\d{1,2}:\d{2}\s*[AP]M$/i.test(value.trim());
}
