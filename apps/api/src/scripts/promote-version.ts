/**
 * Promote an already-STAGED dataset version, without re-staging it.
 *
 *   npm run bmtc:promote-version -- <dataset-version-id>
 *
 * `bmtc:promote` re-reads canonical.json and re-stages before promoting. When
 * staging already succeeded and only the promotion failed, that is ~9 minutes
 * of rework plus another full set of staged rows left behind.
 */
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatasetPromotionService } from '../modules/provider-ingestion/application/DatasetPromotionService';

config();

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('Usage: promote-version <dataset-version-id>');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(DatasetPromotionService).promoteDatasetVersion(id);
    console.log(`PROMOTION ${JSON.stringify(result)}`);
    if (result?.status !== 'ACTIVE') process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch(error => {
  console.error(`PROMOTION FAILED: ${error?.message ?? error}`);
  process.exit(1);
});
