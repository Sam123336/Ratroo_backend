import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';
import { WBBusParser } from '../integrations/transit-providers/wbbus/wbbus.parser';

async function main() {
  console.log('==================================================');
  console.log('FIX WBBUS TIMETABLES');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const seq = app.get(Sequelize);
  const parser = new WBBusParser();

  console.log('Fetching WBBUS raw record IDs...');
  const recordIds: any[] = await seq.query(
    `SELECT id FROM raw_source_records WHERE "providerCode" = 'WBBUS';`,
    { type: QueryTypes.SELECT }
  );
  
  const allIds = recordIds.map(r => r.id);
  console.log(`Found ${allIds.length} WBBUS raw records. Fetching in batches...`);

  let updatedCount = 0;
  let noScheduleCount = 0;
  
  const BATCH_SIZE = 50;
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    console.log(`Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(allIds.length / BATCH_SIZE)}...`);
    const batchIds = allIds.slice(i, i + BATCH_SIZE);
    const records: any[] = await seq.query(
      `SELECT id, "sourceUrl", "rawPayload" FROM raw_source_records WHERE id IN (:ids);`,
      { replacements: { ids: batchIds }, type: QueryTypes.SELECT }
    );

  for (const record of records) {
    const rawPayload = typeof record.rawPayload === 'string' ? JSON.parse(record.rawPayload) : record.rawPayload;
    if (!rawPayload || !rawPayload.body) continue;

    const parsed = parser.parseBusHtml(record.sourceUrl || '', rawPayload.body);
    if (!parsed.schedule || parsed.schedule.length < 2) {
      noScheduleCount++;
      continue;
    }

    const validStops = parsed.schedule.filter(s => s.stoppageName && s.stoppageName.trim());
    if (validStops.length < 2) continue;

    const busId = record.sourceUrl ? record.sourceUrl.split('/').pop() : 'bus';
    const upTripExternalId = `${busId}:up:trip`;
    const downTripExternalId = `${busId}:down:trip`;

    // Process UP Trip
    const upTrip: any[] = await seq.query(
      `SELECT id FROM bus_trips WHERE "externalId" = :extId LIMIT 1;`,
      { replacements: { extId: upTripExternalId }, type: QueryTypes.SELECT }
    );
    if (upTrip.length > 0) {
      const tripId = upTrip[0].id;
      for (let idx = 0; idx < validStops.length; idx++) {
        const stop = validStops[idx];
        const time = (stop.upTime && !stop.upTime.includes('_ _')) ? stop.upTime : null;
        if (time) {
          await seq.query(
            `UPDATE bus_stop_times SET "arrivalTime" = :time, "departureTime" = :time
             WHERE "tripId" = :tripId AND "sequence" = :seq;`,
            { replacements: { time, tripId, seq: idx + 1 }, type: QueryTypes.UPDATE }
          );
          updatedCount++;
        }
      }
    }

    // Process DOWN Trip
    const downTrip: any[] = await seq.query(
      `SELECT id FROM bus_trips WHERE "externalId" = :extId LIMIT 1;`,
      { replacements: { extId: downTripExternalId }, type: QueryTypes.SELECT }
    );
    if (downTrip.length > 0) {
      const tripId = downTrip[0].id;
      const reversedStops = [...validStops].reverse();
      for (let idx = 0; idx < reversedStops.length; idx++) {
        const stop = reversedStops[idx];
        const time = (stop.downTime && !stop.downTime.includes('_ _')) ? stop.downTime : null;
        if (time) {
          await seq.query(
            `UPDATE bus_stop_times SET "arrivalTime" = :time, "departureTime" = :time
             WHERE "tripId" = :tripId AND "sequence" = :seq;`,
            { replacements: { time, tripId, seq: idx + 1 }, type: QueryTypes.UPDATE }
          );
          updatedCount++;
        }
      }
    }
    }
  }

  console.log(`\nCompleted. Updated ${updatedCount} stop times. (${noScheduleCount} pages had no schedule).`);

  // Print final timetable coverage for WBBUS
  const auditRes: any[] = await seq.query(
    `SELECT COUNT(*) as total_stop_times,
            COUNT(CASE WHEN "departureTime" IS NOT NULL AND "departureTime" != '' THEN 1 END) as with_departure
     FROM bus_stop_times st
     JOIN bus_trips t ON t.id = st."tripId"
     WHERE t."providerCode" = 'WBBUS';`,
    { type: QueryTypes.SELECT }
  );

  console.log(`\nWBBUS Timetable Coverage: ${auditRes[0].with_departure} / ${auditRes[0].total_stop_times}`);

  await app.close();
}

main().catch(console.error);
