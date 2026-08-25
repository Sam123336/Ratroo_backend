import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { JourneyService } from '../modules/journey/services/journey.service';
config();
(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  for (const [from, to] of [['Hosa Road', 'Whitefield'], ['Whitefield', 'Majestic']]) {
    try {
      const res: any = await app.get(JourneyService).planJourney(from, to);
      const d = res?.data;
      console.log(`\n${from} -> ${to}: ${d.legs.length} legs, ${d.totalDurationMinutes} min, ${d.transfersCount} transfer(s)`);
      for (const l of d.legs.slice(0, 9)) {
        console.log(`   ${String(l.mode).padEnd(6)} ${(l.fromName ?? '').slice(0,22).padEnd(24)} -> ${(l.toName ?? '').slice(0,22).padEnd(24)} ${(l.serviceName ?? '').slice(0,22)}`);
      }
    } catch (e: any) { console.log(`\n${from} -> ${to}: FAILED — ${e?.message ?? e}`); }
  }
  await app.close(); process.exit(0);
})();
