/**
 * One place that turns env vars into Postgres connection settings, shared by the
 * Nest app (app.module.ts) and the standalone migration runner (migrate.ts) so
 * the two can never drift onto different databases.
 */
export interface PostgresConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  dialectOptions?: {
    ssl?: { require: true; rejectUnauthorized: false };
    /** `pg`'s own connect timeout. See [postgresConnection]. */
    connectionTimeoutMillis?: number;
  };
}

export type EnvLookup = (key: string, fallback?: string) => string | undefined;

export const processEnvLookup: EnvLookup = (key, fallback) => process.env[key] ?? fallback;

export function postgresConnection(env: EnvLookup): PostgresConnection {
  const databaseUrl = env('DATABASE_URL');
  const sslEnabled = env('DB_SSL', databaseUrl ? 'true' : 'false') === 'true';

  // Fail fast instead of hanging.
  //
  // Sequelize connects during module init, so an unreachable host does not
  // produce a slow /v1 route — it stops `NestFactory.create` from ever
  // resolving, and *every* endpoint 500s, `/health` included. On Vercel that
  // showed up as a uniform ~27 s FUNCTION_INVOCATION_FAILED with no log line
  // naming the database, because nothing had booted far enough to log.
  //
  // `pg` defaults to no connect timeout at all. Ten seconds is longer than any
  // healthy connect and short enough to surface as an error the platform will
  // actually record.
  const connectionTimeoutMillis = Number(env('DB_CONNECT_TIMEOUT_MS', '10000'));

  // Supabase and most managed Postgres terminate TLS with a cert we don't pin.
  const dialectOptions = {
    ...(sslEnabled
      ? { ssl: { require: true as const, rejectUnauthorized: false as const } }
      : {}),
    connectionTimeoutMillis,
  };

  if (databaseUrl) {
    const url = new URL(databaseUrl);

    return {
      host: url.hostname,
      port: Number(url.port || 5432),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      dialectOptions,
    };
  }

  return {
    host: env('DB_HOST', 'localhost')!,
    port: Number(env('DB_PORT', '5432')),
    username: env('DB_USER', 'transit_admin')!,
    password: env('DB_PASSWORD', 'transit_password')!,
    database: env('DB_NAME', 'transit_db')!,
    dialectOptions,
  };
}
