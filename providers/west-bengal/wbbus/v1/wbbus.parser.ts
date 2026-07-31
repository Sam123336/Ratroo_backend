import * as cheerio from 'cheerio';
import { WBBusRawBus, WBBusStoppage } from './wbbus.types';

export class WBBusParser {
  parseBusHtml(sourceUrl: string, html: string): WBBusRawBus {
    const $ = cheerio.load(html);
    const details: Record<string, string> = {};

    $('table.table-striped tr').each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length >= 2) {
        const key = $(cols[0]).text().replace(':', '').trim();
        const value = $(cols[1]).text().replace(/\s+/g, ' ').trim();
        details[key] = value;
      }
    });

    const schedule: WBBusStoppage[] = [];
    $('.row.sud').each((_, row) => {
      const cols = $(row).find('div');
      if (cols.length >= 4) {
        schedule.push({
          slNo: $(cols[0]).text().trim(),
          upTime: $(cols[1]).text().trim(),
          stoppageName: $(cols[2]).text().trim(),
          downTime: $(cols[3]).text().trim(),
        });
      }
    });

    let notes: string | null = null;
    $('.card').each((_, card) => {
      const header = $(card).find('.card-header').text().trim();
      if (header.includes('Bus Notes')) {
        notes = $(card).find('.card-body').text().trim();
      }
    });

    return {
      source: 'WBBUS',
      sourceUrl,
      name: details['Bus Name'] || null,
      alternateName: details['Alternate Name'] || null,
      agencyName: details['Agency Name'] || null,
      registration: details['Registration Number'] || null,
      busType: details['Bus Type'] || null,
      contactNumber: details['Contact Number'] || null,
      alternateNumber: details['Alternate Number'] || null,
      origin: details['Depot Name'] || null,
      destination: details['Destination'] || null,
      uploadedBy: details['Upload By'] || null,
      schedule,
      notes,
      scrapedAt: new Date().toISOString(),
    };
  }
}

