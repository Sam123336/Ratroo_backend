import axios from 'axios';
import * as cheerio from 'cheerio';
import { WBBusDiscoveredEntry } from '../types/wbbus.types';

export class WBBusClient {
  private readonly baseUrl = 'https://wbbus.in';

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async discoverAll(maxPages?: number): Promise<WBBusDiscoveredEntry[]> {
    let pageUrl = `${this.baseUrl}/allbus`;
    const buses = new Map<string, WBBusDiscoveredEntry>();
    const visitedPages = new Set<string>();
    let pageNumber = 1;

    while (pageUrl) {
      if (maxPages && pageNumber > maxPages) {
        break;
      }

      if (visitedPages.has(pageUrl)) {
        break;
      }
      visitedPages.add(pageUrl);

      const response = await axios.get(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        timeout: 20000,
      });

      const $ = cheerio.load(response.data);
      let foundThisPage = 0;

      $('a[href*="/bus/"]').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) return;

        const url = new URL(href, this.baseUrl).href;
        if (!buses.has(url)) {
          buses.set(url, { url });
          foundThisPage++;
        }
      });

      let nextHref: string | null = null;
      $('a').each((_, element) => {
        const text = $(element).text().trim().toLowerCase();
        if (text.includes('next') || text.includes('»')) {
          nextHref = $(element).attr('href') || null;
        }
      });

      if (!nextHref) break;

      pageUrl = new URL(nextHref, pageUrl).href;
      pageNumber++;
      await this.sleep(1200);
    }

    return Array.from(buses.values());
  }

  async fetchHtml(url: string, retries = 3): Promise<string> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
          timeout: 20000,
        });
        return response.data;
      } catch (err: any) {
        if (err.response && err.response.status === 429) {
          const backoff = attempt * 3000;
          await this.sleep(backoff);
        } else {
          if (attempt === retries) throw err;
          await this.sleep(1000);
        }
      }
    }
    throw new Error(`Failed to fetch HTML from ${url}`);
  }
}
