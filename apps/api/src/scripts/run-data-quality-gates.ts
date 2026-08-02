import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataQualityGateService } from '../modules/provider-ingestion/enrichment/data-quality-gate.service';

async function bootstrap() {
  console.log('Bootstrapping application context...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  
  try {
    const dataQualityService = app.get(DataQualityGateService);
    
    console.log('Running data quality gates...');
    const result = await dataQualityService.runAllGates();
    
    console.log('\n======================================================');
    console.log('                DATA QUALITY GATES RESULT               ');
    console.log('======================================================');
    console.log(`Passed: ${result.passed ? '✅ YES' : '❌ NO'}`);
    console.log(`Timestamp: ${result.timestamp}`);
    console.log('\n--- METRICS ---');
    console.table(result.metrics.coordinateCoverageByProvider);
    console.log(`Duplicate Stop Groups: ${result.metrics.duplicateStopGroups}`);
    console.log(`Orphan Stops: ${result.metrics.orphanStops}`);
    console.log(`Routes Without Stops: ${result.metrics.routesWithoutStops}`);
    console.log(`Invalid Sequences: ${result.metrics.invalidSequences}`);
    console.log(`Timetable Coverage: ${result.metrics.timetableCoverage.pct}% (${result.metrics.timetableCoverage.withDeparture}/${result.metrics.timetableCoverage.total})`);
    console.log(`Fare Coverage: ${result.metrics.fareCoverage.pct}% (${result.metrics.fareCoverage.withFare}/${result.metrics.fareCoverage.totalRoutes})`);

    if (result.warnings.length > 0) {
      console.log('\n--- WARNINGS ---');
      console.table(result.warnings);
    }
    
    if (result.failures.length > 0) {
      console.log('\n--- FAILURES ---');
      console.table(result.failures);
    }

    if (!result.passed) {
      console.log('\n❌ Data Quality Gates FAILED.');
      process.exit(1);
    } else {
      console.log('\n✅ Data Quality Gates PASSED.');
      process.exit(0);
    }
  } catch (error) {
    console.error('Error running data quality gates:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
