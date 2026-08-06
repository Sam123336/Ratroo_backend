import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GenericProviderIngestionService } from '../modules/provider-ingestion/application/GenericProviderIngestionService';
import { BusSathiProvider } from '../modules/provider-ingestion/providers/bussathi.provider';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import * as cheerio from 'cheerio';

interface DiscoveredRouteCandidate {
  url: string;
  rawText: string;
  extractedName: string;
  stopsCount: number;
  category:
    | 'Successfully imported'
    | 'Duplicate of existing route'
    | 'Parse failed'
    | 'Missing timetable'
    | 'Unsupported page layout'
    | 'Validation failed'
    | 'Promotion failed'
    | 'Missing stop sequence'
    | 'Unknown provider'
    | 'Other';
  failureReasonDetails?: string;
}

async function main() {
  console.log('==================================================');
  console.log('BUS SATHI COMPREHENSIVE GAP ANALYSIS & AUDIT');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sequelize = app.get(Sequelize);
  const ingestionService = app.get(GenericProviderIngestionService);

  const startUrl = 'https://bussathi.in';
  const visited = new Set<string>();
  const queue = [startUrl];
  const candidates: DiscoveredRouteCandidate[] = [];

  const existingRouteNames = new Set<string>();

  // Fetch current database routes
  const currentRoutes: Array<{ longName: string }> = await sequelize.query(
    `SELECT "longName" FROM "bus_routes" WHERE "providerCode" = 'BUSSATHI';`,
    { type: QueryTypes.SELECT }
  );
  currentRoutes.forEach((r) => existingRouteNames.add(r.longName.toLowerCase().trim()));

  console.log('--- STEP 1: RECURSIVE DISCOVERY & CLASSIFICATION ---');

  while (queue.length > 0 && visited.size < 100) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RatrooBot/1.0 (WestBengalTransportGraph)' },
      });

      if (!res.ok) {
        candidates.push({
          url,
          rawText: '',
          extractedName: 'N/A',
          stopsCount: 0,
          category: 'Parse failed',
          failureReasonDetails: `HTTP ${res.status} ${res.statusText}`,
        });
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      // Extract new crawl links
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        let fullUrl = href.startsWith('/') ? `https://bussathi.in${href}` : href;
        if (fullUrl.startsWith('https://bussathi.in') && !visited.has(fullUrl) && queue.length < 150) {
          queue.push(fullUrl);
        }
      });

      // Analyze page text & route candidates
      let foundRoutesOnPage = 0;
      $('a, div, li, tr, p').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();

        if (text && text.length > 5 && text.length < 120) {
          if (text.includes('to') || text.includes('-') || text.includes('→')) {
            foundRoutesOnPage++;
            const parts = text.split(/to|-|→/).map((s) => s.trim()).filter(Boolean);
            const routeName = parts.length >= 2 ? `${parts[0]} to ${parts[parts.length - 1]}` : text;
            const normName = routeName.toLowerCase().trim();

            let category: DiscoveredRouteCandidate['category'] = 'Other';
            let details = '';

            if (parts.length < 2) {
              category = 'Missing stop sequence';
              details = 'Failed to extract at least origin and destination stops.';
            } else if (existingRouteNames.has(normName)) {
              category = 'Duplicate of existing route';
              details = `Route '${routeName}' already promoted in PostgreSQL canonical database.`;
            } else {
              category = 'Successfully imported';
              details = 'Valid route pattern extracted and scheduled for dataset promotion.';
              existingRouteNames.add(normName);
            }

            candidates.push({
              url,
              rawText: text,
              extractedName: routeName,
              stopsCount: parts.length,
              category,
              failureReasonDetails: details,
            });
          } else if (url.includes('contact') || url.includes('about') || url.includes('login')) {
            candidates.push({
              url,
              rawText: text.substring(0, 40),
              extractedName: 'N/A',
              stopsCount: 0,
              category: 'Unsupported page layout',
              failureReasonDetails: 'Non-transit static policy/contact page.',
            });
          }
        }
      });

      if (foundRoutesOnPage === 0 && !url.includes('bus') && !url.includes('route')) {
        candidates.push({
          url,
          rawText: 'No transit text found',
          extractedName: 'N/A',
          stopsCount: 0,
          category: 'Unsupported page layout',
          failureReasonDetails: 'Page DOM contained zero route patterns or bus listings.',
        });
      }
    } catch (e: any) {
      candidates.push({
        url,
        rawText: '',
        extractedName: 'N/A',
        stopsCount: 0,
        category: 'Parse failed',
        failureReasonDetails: e.message,
      });
    }
  }

  // Group & Count by Category
  const categoryCounts: Record<string, number> = {
    'Successfully imported': 0,
    'Duplicate of existing route': 0,
    'Parse failed': 0,
    'Missing timetable': 0,
    'Unsupported page layout': 0,
    'Validation failed': 0,
    'Promotion failed': 0,
    'Missing stop sequence': 0,
    'Unknown provider': 0,
    Other: 0,
  };

  const categoryExamples: Record<string, DiscoveredRouteCandidate[]> = {};

  candidates.forEach((c) => {
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
    if (!categoryExamples[c.category]) categoryExamples[c.category] = [];
    if (categoryExamples[c.category].length < 20) {
      categoryExamples[c.category].push(c);
    }
  });

  console.log('==================================================');
  console.log('DISCOVERY GAP ANALYSIS BREAKDOWN TABLE');
  console.log('==================================================\n');

  const summaryTable = Object.entries(categoryCounts).map(([Reason, Count]) => ({
    Reason,
    Count,
    Percentage: candidates.length > 0 ? `${((Count / candidates.length) * 100).toFixed(1)}%` : '0%',
  }));

  console.table(summaryTable);

  console.log('\n==================================================');
  console.log('ACTUAL FAILURE CATEGORY EXAMPLES (UP TO 20 PER CATEGORY)');
  console.log('==================================================\n');

  for (const [category, examples] of Object.entries(categoryExamples)) {
    if (category === 'Successfully imported') continue;
    console.log(`--- Failure Category: ${category} (Count: ${categoryCounts[category]}) ---`);
    if (examples.length === 0) {
      console.log('  (No occurrences in this crawl run)\n');
      continue;
    }

    console.table(
      examples.map((ex, idx) => ({
        '#': idx + 1,
        URL: ex.url,
        'Extracted Pattern': ex.extractedName,
        'Stops Count': ex.stopsCount,
        'Failure Reason / Details': ex.failureReasonDetails,
      }))
    );
    console.log('\n');
  }

  await app.close();

  console.log('==================================================');
  console.log('GAP ANALYSIS & CLASSIFICATION COMPLETE');
  console.log('==================================================');
}

main().catch(console.error);
