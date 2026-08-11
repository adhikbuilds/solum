import { Pool, type PoolClient } from 'pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env, then `docker compose up -d`.',
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
