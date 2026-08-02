import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';

async function main() {
  console.log('==================================================');
  console.log('SYNC PHASE 3.1 SCHEMA');
  console.log('==================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const sequelize = app.get(Sequelize);

  try {
    console.log('Running sequelize.sync({ alter: true })...');
    // Using alter: true to safely add new columns without dropping tables
    await sequelize.sync({ alter: true });
    
    console.log('Schema synchronization complete.');
  } catch (error) {
    console.error('Error synchronizing schema:', error);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
