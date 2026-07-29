import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { WBBusScrapedBus, WBBusStoppage } from './wbbus.types';

@Injectable()
export class WBBusParser {
  parseBusHtml(url: string, html: string): WBBusScrapedBus {
    const $ = cheerio.load(html);

    const details: Record<string, string> = {};
    $('table.table-striped tr').each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length >= 2) {
        const key = $(cols[0]).text().replace(':', '').trim();
        const val = $(cols[1]).text().replace(/\s+/g, ' ').trim();
        details[key] = val;
      }
    });

    const schedule: WBBusStoppage[] = [];
    $('.row.sud').each((_, row) => {
      const cols = $(row).find('div');
      if (cols.length >= 4) {
        const slNo = $(cols[0]).text().trim();
        const upTime = $(cols[1]).text().trim();
        const stoppageName = $(cols[2]).text().trim();
        const downTime = $(cols[3]).text().trim();
        schedule.push({ slNo, upTime, stoppageName, downTime });
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
      sourceUrl: url,
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
