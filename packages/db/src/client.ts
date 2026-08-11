import { Pool, type PoolClient } from 'pg';
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Find `.env` by walking up from the working directory.
 *
 * `import.meta.dirname` is undefined once this module is bundled — by Next, or by anything else
 * that inlines it — so resolving relative to the source file only works when running from source.
 * Walking up from cwd works in both cases, and finds the repo-root `.env` whether the caller is a
 * script in `packages/db` or a Next server in `apps/web`.
 */
function loadEnv(): void {
  if (process.env['DATABASE_URL']) return; // already provided by the host

  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      config({ path: candidate, quiet: true });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

loadEnv();

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env at the repository root, ' +
      'then run `pnpm db:up`.',
  );
}

/**
 * One pool for the process.
 *
 * Neon note: this is a plain TCP pool and works against Neon unchanged. If we later run on an
 * edge runtime, swap to @neondatabase/serverless — that is a client change, not a schema or
 * query change, which is the whole point of staying on ordinary Postgres.
 */
const isLocalHost = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);

export const pool = new Pool({
  connectionString,
  /*
   * TLS on for anything that is not localhost, whether or not the URL says sslmode=require.
   * Neon requires it, and relying on the caller to remember a query parameter is how a land
   * valuation ends up crossing the internet in clear text.
   */
  ssl: isLocalHost ? undefined : { rejectUnauthorized: true },
  max: 10,
});

/** True when DATABASE_URL points somewhere other than this machine. */
export const isRemote = !isLocalHost;

/**
 * Neon serves two endpoints per branch: a direct one and a pooled one whose host carries `-pooler`.
 *
 * The pooler runs in transaction mode, which silently breaks two things this schema depends on —
 * session-level `SET ROLE` and advisory locks — and makes DDL unreliable. Migrations must use the
 * direct endpoint; the application is fine on either.
 */
export const isPooledEndpoint = /-pooler\./.test(connectionString);

// Re-bound after the guard above so closures see a plain string, not string | undefined.
const DSN: string = connectionString;

export function describeTarget(): string {
  const host = /@([^/:]+)/.exec(DSN)?.[1] ?? 'unknown host';
  return `${host}${isPooledEndpoint ? ' (pooled)' : ''}`;
}

/**
 * Run work inside a transaction with tenant context set.
 *
 * `SET LOCAL` scopes the setting to this transaction, so a pooled connection cannot leak one
 * tenant's context into the next request. That leak is the classic RLS failure, and it is silent.
 */
export async function withTenant<T>(
  organisationId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    /*
     * Drop to the unprivileged role for the whole transaction.
     *
     * Without this, tenant queries run as the table owner. On a local Docker Postgres that owner is
     * a superuser and bypasses RLS entirely — so the policies look like they work while never being
     * exercised. Assuming the role makes isolation behave the same everywhere, and `SET LOCAL`
     * scopes it to this transaction so a pooled connection cannot leak it into the next request.
     */
    await client.query('SET LOCAL ROLE solum_app');
    await client.query('SELECT set_config($1, $2, true)', [
      'solum.organisation_id',
      organisationId,
    ]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Admin work — migrations, ingest, seeding. Runs as owner and bypasses RLS. */
export async function withAdmin<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function close(): Promise<void> {
  await pool.end();
}
