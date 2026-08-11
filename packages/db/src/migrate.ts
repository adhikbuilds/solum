/**
 * Numbered SQL migrations, applied in order, recorded in a table. No ORM, no magic.
 *
 *   pnpm --filter @solum/db migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { withAdmin, close, isPooledEndpoint, isRemote, describeTarget } from './client.js';

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../migrations');

async function main(): Promise<void> {
  if (isPooledEndpoint) {
    throw new Error(
      `Refusing to migrate through a pooled endpoint (${describeTarget()}).\n` +
        `  Neon's pooler runs in transaction mode, which breaks session-level SET ROLE and makes\n` +
        `  DDL unreliable. Use the direct connection string — the host without '-pooler'.`,
    );
  }

  console.log(`\n  target: ${describeTarget()}${isRemote ? '  \x1b[33m(remote)\x1b[0m' : ''}\n`);

  await withAdmin(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        TEXT PRIMARY KEY,
        checksum    TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM schema_migrations',
    );
    const applied = new Map(rows.map((r) => [r.name, r.checksum]));

    for (const file of files) {
      const sql = await readFile(resolve(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 16);
      const previous = applied.get(file);

      if (previous === checksum) {
        console.log(`  = ${file}`);
        continue;
      }
      if (previous !== undefined) {
        // Editing an applied migration means two databases silently diverge. Refuse.
        throw new Error(
          `${file} has changed since it was applied (${previous} → ${checksum}). ` +
            `Add a new migration instead of editing this one, or run \`pnpm db:reset\` locally.`,
        );
      }

      console.log(`  + ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
          file,
          checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`${file} failed: ${(error as Error).message}`, { cause: error });
      }
    }

    console.log(`\nSchema up to date (${files.length} migration${files.length === 1 ? '' : 's'}).`);
  });
}

main()
  .catch((error: unknown) => {
    console.error(`\nMigration failed: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(close);
