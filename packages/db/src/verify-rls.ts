/**
 * Verify tenant isolation actually holds.
 *
 *   pnpm --filter @solum/db verify-rls
 *
 * This is the security control that the beta may be missing — it ships a Supabase publishable key
 * in its page source against a `plots` table. If RLS is off there, viewing source is enough to read
 * every client's land valuations. Proving isolation once by hand is not enough; it has to be a
 * command anyone can re-run after any migration.
 *
 * Exits non-zero on failure so it can gate a deploy.
 */
import { withAdmin, withTenant, close } from './client.js';
import type { PoolClient } from 'pg';

const FAKE_ORG = '00000000-0000-0000-0000-000000000000';

interface Check {
  name: string;
  run: (client: PoolClient, realOrg: string) => Promise<boolean>;
}

async function countAs(
  client: PoolClient,
  table: string,
  orgContext: string | null,
): Promise<number> {
  await client.query('SET ROLE solum_app');
  try {
    await client.query('SELECT set_config($1, $2, false)', [
      'solum.organisation_id',
      orgContext ?? '',
    ]);
    const { rows } = await client.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`);
    return Number(rows[0]?.n ?? -1);
  } finally {
    await client.query('RESET ROLE');
  }
}

const TENANT_TABLES = ['plots', 'appraisals', 'assumption_sets', 'results', 'workspaces'];

const checks: Check[] = [
  {
    name: 'no tenant context returns nothing',
    run: async (c) => {
      for (const t of TENANT_TABLES) {
        if ((await countAs(c, t, null)) !== 0) return false;
      }
      return true;
    },
  },
  {
    name: 'wrong tenant returns nothing',
    run: async (c) => {
      for (const t of TENANT_TABLES) {
        if ((await countAs(c, t, FAKE_ORG)) !== 0) return false;
      }
      return true;
    },
  },
  {
    name: 'malformed tenant value fails closed, not open',
    run: async (c) => (await countAs(c, 'plots', 'not-a-uuid')) === 0,
  },
  {
    name: 'correct tenant sees its own rows',
    run: async (c, org) => (await countAs(c, 'plots', org)) > 0,
  },
  {
    name: 'market data is readable by any tenant',
    run: async (c, org) => (await countAs(c, 'comparable_snapshots', org)) > 0,
  },
  {
    // The check that matters most: this goes through withTenant, the same code path the
    // application uses, rather than switching role by hand.
    name: 'the real application path is isolated, not just a hand-rolled SET ROLE',
    run: async (_c, org) => {
      const mine = await withTenant(org, async (t) => {
        const { rows } = await t.query<{ n: string }>('SELECT count(*) AS n FROM plots');
        return Number(rows[0]?.n ?? 0);
      });
      const theirs = await withTenant(FAKE_ORG, async (t) => {
        const { rows } = await t.query<{ n: string }>('SELECT count(*) AS n FROM plots');
        return Number(rows[0]?.n ?? 0);
      });
      return mine > 0 && theirs === 0;
    },
  },
  {
    name: 'the application path cannot write market data',
    run: async (_c, org) => {
      try {
        await withTenant(org, async (t) => {
          await t.query('UPDATE comparable_snapshots SET high_psf_fils = 1');
        });
        return false;
      } catch {
        return true;
      }
    },
  },
  {
    name: 'app role cannot modify a pinned comparables snapshot',
    run: async (c, org) => {
      await c.query('SET ROLE solum_app');
      try {
        await c.query('SELECT set_config($1, $2, false)', ['solum.organisation_id', org]);
        await c.query('UPDATE comparable_snapshots SET high_psf_fils = 1');
        return false; // should have thrown
      } catch {
        return true;
      } finally {
        await c.query('RESET ROLE');
      }
    },
  },
];

async function main(): Promise<void> {
  await withAdmin(async (client) => {
    const { rows } = await client.query<{ id: string }>('SELECT id FROM organisations LIMIT 1');
    const org = rows[0]?.id;
    if (!org) throw new Error('No organisations found. Run `pnpm db:seed` first.');

    let failed = 0;
    for (const check of checks) {
      let passed: boolean;
      try {
        passed = await check.run(client, org);
      } catch (error) {
        passed = false;
        console.error(`     ${(error as Error).message}`);
      }
      console.log(`  ${passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${check.name}`);
      if (!passed) failed++;
    }

    if (failed > 0) {
      throw new Error(`${failed} of ${checks.length} isolation checks FAILED.`);
    }
    console.log(`\n  ${checks.length} isolation checks passed.\n`);
  });
}

main()
  .catch((error: unknown) => {
    console.error(`\n${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(close);
