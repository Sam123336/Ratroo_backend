import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GenericProviderIngestionService } from '../modules/provider-ingestion/application/GenericProviderIngestionService';
import { BusSathiProvider } from '../modules/provider-ingestion/providers/bussathi.provider';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import * as cheerio from 'cheerio';

interface CrawlUrlReport {
  url: string;
  status: 'PARSED' | 'FAILED' | 'IGNORED' | 'DUPLICATE' | 'UNSUPPORTED';
  pageType: 'HOMEPAGE' | 'ROUTE_INDEX' | 'DISTRICT_PAGE' | 'ROUTE_DETAIL' | 'SEARCH' | 'OTHER';
  routesFound: number;
  stopsFound: number;
}

async function main() {
  console.log('==================================================');
  console.log('BUS SATHI FULL SITE CRAWL & COVERAGE AUDIT');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sequelize = app.get(Sequelize);
  const ingestionService = app.get(GenericProviderIngestionService);

  const startUrl = 'https://bussathi.in';
  const visitedUrls = new Set<string>();
  const discoveredUrls = new Set<string>([startUrl]);
  const crawlReports: CrawlUrlReport[] = [];

  const queue: string[] = [startUrl];
  let failedCount = 0;
  let ignoredCount = 0;
  let duplicateCount = 0;
  let parsedCount = 0;
  let totalDiscoveredRoutes = 0;
  let totalDiscoveredStops = 0;

  console.log(`--- STEP 1: RECURSIVE DEEP SITE CRAWL FROM ${startUrl} ---`);

  while (queue.length > 0 && visitedUrls.size < 50) {
    const currentUrl = queue.shift()!;
    if (visitedUrls.has(currentUrl)) {
      duplicateCount++;
      crawlReports.push({
        url: currentUrl,
        status: 'DUPLICATE',
        pageType: 'OTHER',
        routesFound: 0,
        stopsFound: 0,
      });
      continue;
    }

    visitedUrls.add(currentUrl);
    console.log(`[CRAWLER] Fetching: ${currentUrl}...`);

    try {
      const res = await fetch(currentUrl, {
        headers: { 'User-Agent': 'RatrooBot/1.0 (WestBengalTransportGraph)' },
      });

      if (!res.ok) {
        failedCount++;
        crawlReports.push({
          url: currentUrl,
          status: 'FAILED',
          pageType: 'OTHER',
          routesFound: 0,
          stopsFound: 0,
        });
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      // Determine Page Type
      let pageType: CrawlUrlReport['pageType'] = 'OTHER';
      if (currentUrl === 'https://bussathi.in' || currentUrl.endsWith('/')) pageType = 'HOMEPAGE';
      else if (currentUrl.includes('/routes')) pageType = 'ROUTE_INDEX';
      else if (currentUrl.includes('/district')) pageType = 'DISTRICT_PAGE';
      else if (currentUrl.includes('/bus/') || currentUrl.includes('/route/')) pageType = 'ROUTE_DETAIL';
      else if (currentUrl.includes('/search')) pageType = 'SEARCH';

      // Discover new links
      let routesFound = 0;
      let stopsFound = 0;

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        let fullUrl = href;
        if (href.startsWith('/')) {
          fullUrl = `https://bussathi.in${href}`;
        }

        if (fullUrl.startsWith('https://bussathi.in') && !visitedUrls.has(fullUrl)) {
          discoveredUrls.add(fullUrl);
          if (queue.length < 50) queue.push(fullUrl);
        }

        const linkText = $(el).text().trim();
        if (linkText.includes('to') || linkText.includes('-') || linkText.includes('→')) {
          routesFound++;
          const parts = linkText.split(/to|-|→/).map((s) => s.trim()).filter(Boolean);
          stopsFound += parts.length;
        }
      });

      totalDiscoveredRoutes += routesFound;
      totalDiscoveredStops += stopsFound;
      parsedCount++;

      crawlReports.push({
        url: currentUrl,
        status: 'PARSED',
        pageType,
        routesFound,
        stopsFound,
      });
    } catch (e: any) {
      failedCount++;
      crawlReports.push({
        url: currentUrl,
        status: 'FAILED',
        pageType: 'OTHER',
        routesFound: 0,
        stopsFound: 0,
      });
    }
  }

  console.log('\n--- STEP 2: CRAWL COVERAGE AUDIT SUMMARY REPORT ---');
  console.log(`Total Discovered URLs: ${discoveredUrls.size}`);
  console.log(`Successfully Parsed Pages: ${parsedCount}`);
  console.log(`Failed Pages: ${failedCount}`);
  console.log(`Ignored Pages: ${ignoredCount}`);
  console.log(`Duplicate URLs Skipped: ${duplicateCount}`);
  console.log(`Total Routes Discovered on Site: ${totalDiscoveredRoutes}`);
  console.log(`Total Stops Discovered on Site: ${totalDiscoveredStops}`);

  // Run provider sync pipeline
  console.log('\n--- STEP 3: RUNNING BUS SATHI INGESTION & PROMOTION PIPELINE ---');
  const provider = new BusSathiProvider();
  const syncResult = await ingestionService.runIngestionPipeline(provider);

  console.log(`Ingestion Status: ${syncResult.status}`);
  console.log(`Dataset Version ID: ${syncResult.datasetVersionId}`);

  console.log('\n--- STEP 4: VERIFICATION SQL REPORT & ROUTE CATALOG ---');

  const routeCountRes: Array<{ count: string }> = await sequelize.query(
    `SELECT COUNT(*) as count FROM "bus_routes" WHERE "providerCode" = 'BUSSATHI';`,
    { type: QueryTypes.SELECT }
  );
  const stopCountRes: Array<{ count: string }> = await sequelize.query(
    `SELECT COUNT(*) as count FROM "bus_stops" WHERE "providerCode" = 'BUSSATHI';`,
    { type: QueryTypes.SELECT }
  );
  const relationCountRes: Array<{ count: string }> = await sequelize.query(
    `SELECT COUNT(*) as count FROM "bus_route_stops" rs
     JOIN "bus_routes" r ON r."id" = rs."routeId"
     WHERE r."providerCode" = 'BUSSATHI';`,
    { type: QueryTypes.SELECT }
  );

  console.log('--------------------------------------------------');
  console.log(`SELECT COUNT(*) FROM "bus_routes" WHERE "providerCode"='BUSSATHI';`);
  console.log(`  -> ${routeCountRes[0]?.count}`);

  console.log(`SELECT COUNT(*) FROM "bus_stops" WHERE "providerCode"='BUSSATHI';`);
  console.log(`  -> ${stopCountRes[0]?.count}`);

  console.log(`SELECT COUNT(*) FROM "bus_route_stops" WHERE "providerCode"='BUSSATHI';`);
  console.log(`  -> ${relationCountRes[0]?.count}`);
  console.log('--------------------------------------------------\n');

  // List every imported route (id, shortName, longName)
  const busSathiRoutes: Array<{ id: string; shortName: string; longName: string; datasetVersionId: string }> = await sequelize.query(
    `SELECT "id", "metadata"->>'shortName' as "shortName", "longName", "datasetVersionId"
     FROM "bus_routes"
     WHERE "providerCode" = 'BUSSATHI'
     ORDER BY "createdAt" ASC;`,
    { type: QueryTypes.SELECT }
  );

  console.log('--- BUS SATHI FULL IMPORTED ROUTE CATALOG ---');
  console.table(
    busSathiRoutes.map((r, idx) => ({
      Index: idx + 1,
      ID: r.id,
      ShortName: r.shortName || `BS-${idx + 1}`,
      LongName: r.longName,
      DatasetVersion: r.datasetVersionId,
    }))
  );

  // Route Integrity Check
  console.log('\n--- ROUTE INTEGRITY CHECK ---');
  let integrityPassed = true;
  for (const r of busSathiRoutes) {
    const stops: any[] = await sequelize.query(
      `SELECT s."name", rs."sequence"
       FROM "bus_route_stops" rs
       JOIN "bus_stops" s ON s."id" = rs."stopId"
       WHERE rs."routeId" = :routeId
       ORDER BY rs."sequence" ASC;`,
      { replacements: { routeId: r.id }, type: QueryTypes.SELECT }
    );

    const origin = stops[0]?.name || 'N/A';
    const dest = stops[stops.length - 1]?.name || 'N/A';
    const intermediateCount = Math.max(0, stops.length - 2);

    console.log(`Route: ${r.longName}`);
    console.log(`  Origin: ${origin} | Destination: ${dest} | Intermediate Stops: ${intermediateCount} | Total Sequence: ${stops.length}`);

    if (stops.length < 2) integrityPassed = false;
  }

  console.log(`\nRoute Integrity Check Result: ${integrityPassed ? '✅ ALL ROUTES VALID' : '❌ INTEGRITY FAILED'}`);

  await app.close();

  console.log('\n==================================================');
  console.log('BUS SATHI COVERAGE AUDIT COMPLETE');
  console.log('==================================================');
}

main().catch(console.error);
