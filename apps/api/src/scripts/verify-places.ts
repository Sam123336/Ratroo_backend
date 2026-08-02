import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Sequelize } from 'sequelize-typescript';
import { QueryTypes } from 'sequelize';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const sequelize = app.get(Sequelize);

  try {
    const res = await sequelize.query(
      `SELECT p.id, p."canonicalName", p.type, parent."canonicalName" as "parentName"
       FROM places p
       LEFT JOIN places parent ON p."stateId" = parent.id
       ORDER BY p.type DESC, p."canonicalName" ASC;`,
      { type: QueryTypes.SELECT }
    );
    console.table(res);
  } catch (err) {
    console.error(err);
  } finally {
    await app.close();
  }
}

main();
