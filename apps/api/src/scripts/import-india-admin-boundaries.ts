/**
 * Import India's state/UT boundaries for coordinate classification.
 *
 * These rows use ADMIN_STATE deliberately: administrative geography detects
 * where a submitted stop is, while STATE rows continue to mean real Ratroo
 * transit coverage. Importing a border must never claim that service exists.
 *
 * Source: geoBoundaries gbOpen, India ADM1 (CC BY 2.5 IN). The default URL is
 * pinned to a release commit so a deploy cannot silently change geography.
 */
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { QueryTypes } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { AppModule } from '../app.module';

config();

const DEFAULT_SOURCE =
  'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/ADM1/' +
  'geoBoundaries-IND-ADM1_simplified.geojson';

interface BoundaryFeature {
  type: 'Feature';
  properties: { shapeName: string; shapeISO: string; shapeID?: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[] };
}

interface BoundaryCollection {
  type: 'FeatureCollection';
  features: BoundaryFeature[];
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function main() {
  const source = process.env.INDIA_ADMIN_BOUNDARIES_URL || DEFAULT_SOURCE;
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Boundary download failed: HTTP ${response.status}`);
  const collection = await response.json() as BoundaryCollection;

  if (collection.type !== 'FeatureCollection' || collection.features.length < 36) {
    throw new Error(`Expected all India ADM1 boundaries; received ${collection.features?.length ?? 0}.`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const sequelize = app.get(Sequelize);

  try {
    await sequelize.transaction(async transaction => {
      for (const feature of collection.features) {
        const stateCode = feature.properties.shapeISO?.replace(/^IN-/, '');
        if (!stateCode || !feature.properties.shapeName || !feature.geometry) {
          throw new Error(`Invalid ADM1 feature: ${JSON.stringify(feature.properties)}`);
        }

        await sequelize.query(
          `INSERT INTO coverage_areas
             (id, "countryCode", "stateCode", "stateName", "areaType", name, slug,
              boundary, "stopCount", "boundaryBuiltAt", metadata, "createdAt", "updatedAt")
           VALUES (
             gen_random_uuid(), 'IN', :stateCode, :stateName, 'ADMIN_STATE', :stateName, :slug,
             ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)), 0, now(),
             CAST(:metadata AS jsonb), now(), now()
           )
           ON CONFLICT ("countryCode", "stateCode", "areaType", COALESCE("cityName", ''))
           DO UPDATE SET
             "stateName" = EXCLUDED."stateName", name = EXCLUDED.name, slug = EXCLUDED.slug,
             boundary = EXCLUDED.boundary, "boundaryBuiltAt" = now(),
             metadata = EXCLUDED.metadata, "updatedAt" = now()`,
          {
            replacements: {
              stateCode,
              stateName: feature.properties.shapeName,
              slug: `india-${slug(feature.properties.shapeName)}`,
              geometry: JSON.stringify(feature.geometry),
              metadata: JSON.stringify({
                purpose: 'administrative-classification-only',
                source: 'geoBoundaries gbOpen IND ADM1',
                sourceUrl: source,
                license: 'CC BY 2.5 IN',
                shapeId: feature.properties.shapeID,
              }),
            },
            type: QueryTypes.INSERT,
            transaction,
          },
        );
      }
    });
    console.log(`Imported ${collection.features.length} India state/UT boundaries.`);
  } finally {
    await app.close();
  }
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
