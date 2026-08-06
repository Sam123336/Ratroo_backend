/**
 * Migration runner (Umzug + Sequelize).
 *
 *   npm run migrate:create -- add-ferry-terminals   # scaffold a new migration
 *   npm run migrate                                 # apply everything pending
 *   npm run migrate:status                          # what is applied / pending
 *   npm run migrate:down                            # roll back the last one
 *
 * Applied migrations are tracked in the `sequelize_meta` table.
 */
import { config as loadEnv } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { QueryInterface, Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { postgresConnection, processEnvLookup } from './connection-options';

loadEnv({ path: resolve(__dirname, '../../../../.env') });
loadEnv();

const MIGRATIONS_DIR = join(__dirname, 'migrations');

export interface MigrationContext {
  queryInterface: QueryInterface;
  sequelize: Sequelize;
}

/** Signature of `up` / `down` in every migration file. */
export type MigrationFn = (params: { context: MigrationContext }) => Promise<void>;

function createSequelize() {
  const connection = postgresConnection(processEnvLookup);

  return new Sequelize({
    dialect: 'postgres',
    logging: false,
    ...connection,
  });
}

function createUmzug(sequelize: Sequelize) {
  return new Umzug<MigrationContext>({
    // .js too, so a compiled `dist` deploy can run the same migrations.
    migrations: { glob: ['*.{ts,js}', { cwd: MIGRATIONS_DIR }] },
    context: { queryInterface: sequelize.getQueryInterface(), sequelize },
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });
}

const TEMPLATE = `import { DataTypes } from 'sequelize';
import type { MigrationFn } from '../migrate';

/** __NAME__ */
export const up: MigrationFn = async ({ context: { queryInterface } }) => {
  await queryInterface.createTable('ferry_terminals', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  });
};

/** Must undo up() exactly — migrate:down relies on it. */
export const down: MigrationFn = async ({ context: { queryInterface } }) => {
  await queryInterface.dropTable('ferry_terminals');
};
`;

function createMigrationFile(rawName: string) {
  const name = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (!name) {
    throw new Error('Usage: npm run migrate:create -- <name>   e.g. add-ferry-terminals');
  }

  // Timestamp prefix, so migrations apply in the order they were authored.
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const file = join(MIGRATIONS_DIR, `${stamp}-${name}.ts`);

  mkdirSync(MIGRATIONS_DIR, { recursive: true });
  writeFileSync(file, TEMPLATE.replace('__NAME__', name), { flag: 'wx' });
  console.log(`Created ${file}`);
}

async function main() {
  const command = process.argv[2] || 'up';

  if (command === 'create') {
    createMigrationFile(process.argv.slice(3).join(' '));
    return;
  }

  const sequelize = createSequelize();
  const umzug = createUmzug(sequelize);

  try {
    switch (command) {
      case 'up': {
        const applied = await umzug.up();
        console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Already up to date.');
        break;
      }
      case 'down':
        await umzug.down();
        break;
      case 'status': {
        const [executed, pending] = await Promise.all([umzug.executed(), umzug.pending()]);
        console.log('Applied:', executed.map(m => m.name).join('\n         ') || '(none)');
        console.log('Pending:', pending.map(m => m.name).join('\n         ') || '(none)');
        break;
      }
      default:
        throw new Error(`Unknown command "${command}". Use: create | up | down | status`);
    }
  } finally {
    await sequelize.close();
  }
}

main().catch(error => {
  // Full stack, not just `.message` — Sequelize's "Validation error" says nothing on its own.
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
