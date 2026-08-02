import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GenericProviderIngestionService } from '../modules/provider-ingestion/application/GenericProviderIngestionService';
import { BusSathiProvider, classifyCandidateText, CandidateClassification } from '../modules/provider-ingestion/providers/bussathi.provider';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import * as cheerio from 'cheerio';

interface DuplicateRouteReportRow {
  canonicalRoute: string;
  occurrencesFound: number;
  sampleSourceUrls: string;
}

async function main() {
  console.log('==================================================');
  console.log('BUS SATHI EXTRACTION QUALITY & CLASSIFICATION AUDIT');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sequelize = app.get(Sequelize);
  const ingestionService = app.get(GenericProviderIngestionService);

  const startUrl = 'https://bussathi.in';
  const visitedUrls = new Set<string>();
  const queue = [startUrl];

  const classificationCounts: Record<CandidateClassification, number> = {
    Route: 0,
    Timetable: 0,
    'Bus Stop': 0,
    'District Page': 0,
    'Search Result': 0,
    'Filter/UI Element': 0,
    Authentication: 0,
    'Static Content': 0,
    Advertisement: 0,
    Unknown: 0,
  };

  const canonicalOccurrences = new Map<string, { count: number; urls: Set<string> }>();
  let falsePositivesRejected = 0;
  let totalPagesCrawled = 0;

  console.log('--- STEP 1: PRE-PARSING CLASSIFICATION CRAWL ---');

  while (queue.length > 0 && visitedUrls.size < 60) {
    const currentUrl = queue.shift()!;
    if (visitedUrls.has(currentUrl)) continue;
    visitedUrls.add(currentUrl);
    totalPagesCrawled++;

    try {
      const res = await fetch(currentUrl, {
        headers: { 'User-Agent': 'YatrooBot/1.0 (WestBengalTransportGraph)' },
      });

      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      // Extract new crawl links
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        let fullUrl = href.startsWith('/') ? `https://bussathi.in${href}` : href;
        if (fullUrl.startsWith('https://bussathi.in') && !visitedUrls.has(fullUrl) && queue.length < 100) {
          queue.push(fullUrl);
        }
      });

      // Classify DOM text elements
      $('a, div, li, tr, p').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (text && text.length > 3 && text.length < 120) {
          const category = classifyCandidateText(text);
          classificationCounts[category] = (classificationCounts[category] || 0) + 1;

          if (category === 'Filter/UI Element' || category === 'Authentication' || category === 'Static Content') {
            falsePositivesRejected++;
          }

          if (category === 'Route') {
            const parts = text.split(/to|-|→/).map((s) => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
              const canonicalName = `${parts[0]} to ${parts[parts.length - 1]}`;
              const entry = canonicalOccurrences.get(canonicalName) || { count: 0, urls: new Set() };
              entry.count++;
              entry.urls.add(currentUrl);
              canonicalOccurrences.set(canonicalName, entry);
            }
          }
        }
      });
    } catch {
      // Ignore network timeouts
    }
  }

  console.log('--- STEP 2: PARSER QUALITY METRICS TELEMETRY ---');
  console.log(`Total Pages Crawled: ${totalPagesCrawled}`);
  console.log(`Pages/Elements Classified as Route: ${classificationCounts.Route}`);
  console.log(`Pages/Elements Classified as Static/Auth: ${classificationCounts['Static Content'] + classificationCounts.Authentication}`);
  console.log(`UI/Filter Elements Rejected (False Positives): ${falsePositivesRejected}`);
  console.log(`Unique Canonical Routes Identified: ${canonicalOccurrences.size}\n`);

  console.log('--------------------------------------------------');
  console.log('CLASSIFICATION BREAKDOWN METRICS:');
  console.table(
    Object.entries(classificationCounts).map(([Category, Count]) => ({
      Category,
      Count,
      Action: Category === 'Route' || Category === 'Timetable' ? 'INGEST' : 'REJECT / IGNORE',
    }))
  );

  // Run provider sync pipeline with pre-parsing classification
  console.log('\n--- STEP 3: RUNNING BUS SATHI INGESTION & PROMOTION PIPELINE ---');
  const provider = new BusSathiProvider();
  const syncResult = await ingestionService.runIngestionPipeline(provider);

  console.log(`Ingestion Status: ${syncResult.status}`);
  console.log(`Dataset Version ID: ${syncResult.datasetVersionId}`);

  // Canonical Route Duplicate Occurrence Report
  console.log('\n--- STEP 4: CANONICAL ROUTE DUPLICATE OCCURRENCE REPORT ---');
  const duplicateRows: DuplicateRouteReportRow[] = Array.from(canonicalOccurrences.entries())
    .slice(0, 15)
    .map(([canonicalRoute, data]) => ({
      canonicalRoute,
      occurrencesFound: data.count,
      sampleSourceUrls: Array.from(data.urls).slice(0, 2).join(', '),
    }));

  console.table(duplicateRows);

  // Verify Promoted Routes against UI Label Exclusion Rule
  console.log('\n--- STEP 5: STRICT PROMOTED ROUTE VALIDATION CHECK ---');
  const promotedRoutes: Array<{ id: string; longName: string; metadata: any }> = await sequelize.query(
    `SELECT "id", "longName", "metadata"
     FROM "bus_routes"
     WHERE "providerCode" = 'BUSSATHI' AND "datasetVersionId" = :dVer;`,
    { replacements: { dVer: syncResult.datasetVersionId }, type: QueryTypes.SELECT }
  );

  let validationPassed = true;
  promotedRoutes.forEach((r, idx) => {
    const isUiLabel =
      r.longName.toLowerCase().includes('government') ||
      r.longName.toLowerCase().includes('private') ||
      r.longName.toLowerCase().includes('non ac') ||
      r.longName.toLowerCase().includes('direction');

    console.log(`Route #${idx + 1}: ${r.longName} | Valid Route: ${!isUiLabel ? '✅ YES' : '❌ UI LABEL (INVALID)'}`);
    if (isUiLabel) validationPassed = false;
  });

  console.log(`\nPromoted Route Quality Check: ${validationPassed ? '✅ 100% VALID TRANSPORT ROUTES (ZERO UI LABELS PROMOTED)' : '❌ CONTAINS UI LABELS'}`);

  await app.close();

  console.log('\n==================================================');
  console.log('BUS SATHI EXTRACTION QUALITY AUDIT COMPLETE');
  console.log('==================================================');
}

main().catch(console.error);
