import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GenericProviderIngestionService } from '../modules/provider-ingestion/application/GenericProviderIngestionService';
import { WBBusProvider } from '../modules/provider-ingestion/providers/wbbus.provider';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'log'] });
  const ingestion = app.get(GenericProviderIngestionService);
  const provider = app.get(WBBusProvider);

  try {
    console.log('--- Running WBBUS Sync (Idempotent Check) ---');
    const result = await ingestion.runIngestionPipeline(provider);
    console.log('\n--- Sync Complete ---');
    console.log(`Promoted Dataset Version: ${result.datasetVersionId}`);
    console.log(`Nodes Extracted: ${result.counts.nodes}`);
    
  } catch (err) {
    console.error(err);
  } finally {
    await app.close();
  }
}

main();
