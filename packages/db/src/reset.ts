/**
 * Drop and recreate the public schema. Local development only.
 *
 *   pnpm --filter @solum/db reset
 */
import { withAdmin, close } from './client.js';

const url = process.env['DATABASE_URL'] ?? '';
const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

async function main(): Promise<void> {
  if (!isLocal) {
    // A reset against Neon would destroy real appraisals, and the audit trail is the product.
    throw new Error(
      `Refusing to reset a non-local database.\n  DATABASE_URL points at: ${redact(url)}\n` +
        `  This command drops every table. Point DATABASE_URL at localhost to use it.`,
    );
  }

  await withAdmin(async (client) => {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    console.log('Schema dropped and recreated. Run `pnpm db:migrate` next.');
  });
}

function redact(connectionString: string): string {
  return connectionString.replace(/\/\/[^@]*@/, '//***:***@');
}

main()
  .catch((error: unknown) => {
    console.error(`\n${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(close);
