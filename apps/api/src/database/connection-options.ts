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

/// Says what is wrong with a connection URL without printing the password.
///
/// This lands in platform logs, which are readable by anyone with project
/// access and are retained — so it reports the *shape* only: length, and the
/// specific placeholder characters that explain nearly every failure here.
function describeMalformed(value: string): string {
  const notes: string[] = [`${value.length} chars`];
  if (/[<>]/.test(value)) notes.push('contains < > — unreplaced template placeholder');
  if (/\[|\]/.test(value)) notes.push('contains [ ] — unreplaced password placeholder');
  if (/\s/.test(value)) notes.push('contains whitespace');
  if (!/^postgres(ql)?:\/\//.test(value)) notes.push('does not start with postgresql://');
  return notes.join('; ');
}

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
    // `new URL` throws a bare "TypeError: Invalid URL" naming neither the
    // variable nor the value, and because this runs during module init the
    // whole app fails to boot — so every endpoint 500s and the only clue is a
    // stack trace three frames deep. A malformed DATABASE_URL should say which
    // variable is wrong and what it should look like.
    //
    // The usual cause is a template pasted with its placeholders still in it
    // (`<region>`, `[YOUR-PASSWORD]`): brackets are not legal in a host or
    // userinfo, so the parse fails.
    let url: URL;
    try {
      url = new URL(databaseUrl);
    } catch {
      throw new Error(
        `DATABASE_URL is not a valid connection URL (${describeMalformed(databaseUrl)}). ` +
          'Expected postgresql://user:password@host:port/database — check for unreplaced ' +
          'placeholders, and percent-encode any @ : / or # in the password.',
      );
    }

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
