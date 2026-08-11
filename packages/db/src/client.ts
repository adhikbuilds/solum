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
export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: true } : undefined,
  max: 10,
});

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
