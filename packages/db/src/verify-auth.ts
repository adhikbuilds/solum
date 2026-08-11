/**
 * Verify authentication and session handling.
 *
 *   pnpm --filter @solum/db verify-auth
 *
 * Auth is the control that decides which tenant every RLS policy is evaluated against, so it has to
 * be checked by a command rather than by clicking through a login form once. Exits non-zero on
 * failure so it can gate a deploy.
 */
import { withAdmin, close } from './client.js';
import { signIn, signOut, getSessionUser, hashPassword, verifyPassword, canWrite } from './auth.js';

const EMAIL = 'demo@almizan.ae';
const PASSWORD = process.env['SEED_DEMO_PASSWORD'] ?? 'solum-local-demo';

interface Check {
  name: string;
  run: () => Promise<boolean>;
}

const checks: Check[] = [
  {
    name: 'a correct password verifies',
    run: async () => verifyPassword('hunter2', await hashPassword('hunter2')),
  },
  {
    name: 'a wrong password does not',
    run: async () => !(await verifyPassword('hunter3', await hashPassword('hunter2'))),
  },
  {
    name: 'the same password hashes differently each time (salted)',
    run: async () => (await hashPassword('same')) !== (await hashPassword('same')),
  },
  {
    name: 'a malformed stored hash is rejected rather than throwing',
    run: async () =>
      !(await verifyPassword('x', 'not-a-hash')) && !(await verifyPassword('x', null)),
  },
  {
    name: 'sign in with the seeded credentials succeeds and pins an organisation',
    run: async () => {
      const result = await signIn(EMAIL, PASSWORD);
      if (!result) return false;
      const ok = Boolean(result.sessionId) && Boolean(result.user.organisationId);
      await signOut(result.sessionId);
      return ok;
    },
  },
  {
    name: 'sign in with a wrong password fails',
    run: async () => (await signIn(EMAIL, 'definitely-not-it')) === null,
  },
  {
    name: 'sign in with an unknown email fails',
    run: async () => (await signIn('nobody@example.com', PASSWORD)) === null,
  },
  {
    name: 'a session resolves to its user and organisation',
    run: async () => {
      const result = await signIn(EMAIL, PASSWORD);
      if (!result) return false;
      const user = await getSessionUser(result.sessionId);
      const ok = user?.userId === result.user.userId && user?.organisationId === result.user.organisationId;
      await signOut(result.sessionId);
      return ok;
    },
  },
  {
    name: 'signing out revokes the session immediately',
    run: async () => {
      const result = await signIn(EMAIL, PASSWORD);
      if (!result) return false;
      await signOut(result.sessionId);
      return (await getSessionUser(result.sessionId)) === null;
    },
  },
  {
    name: 'an unknown session id resolves to nobody',
    run: async () => (await getSessionUser('made-up-session-id')) === null,
  },
  {
    name: 'an absent session id resolves to nobody',
    run: async () => (await getSessionUser(undefined)) === null,
  },
  {
    name: 'an expired session resolves to nobody',
    run: async () => {
      const result = await signIn(EMAIL, PASSWORD);
      if (!result) return false;
      await withAdmin(async (client) => {
        await client.query(`UPDATE sessions SET expires_at = now() - interval '1 hour' WHERE id = $1`, [
          result.sessionId,
        ]);
      });
      const gone = (await getSessionUser(result.sessionId)) === null;
      await signOut(result.sessionId);
      return gone;
    },
  },
  {
    name: 'session ids are unguessable and unique',
    run: async () => {
      const a = await signIn(EMAIL, PASSWORD);
      const b = await signIn(EMAIL, PASSWORD);
      if (!a || !b) return false;
      const ok = a.sessionId !== b.sessionId && a.sessionId.length >= 32;
      await signOut(a.sessionId);
      await signOut(b.sessionId);
      return ok;
    },
  },
  {
    name: 'the app role cannot read the sessions table',
    run: async () =>
      withAdmin(async (client) => {
        await client.query('SET ROLE solum_app');
        try {
          await client.query('SELECT id FROM sessions LIMIT 1');
          return false; // being able to list sessions is a log-in-as-anyone primitive
        } catch {
          return true;
        } finally {
          await client.query('RESET ROLE');
        }
      }),
  },
  {
    name: 'a viewer cannot write, an analyst can',
    run: async () => !canWrite('viewer') && canWrite('analyst') && canWrite('owner'),
  },
];

async function main(): Promise<void> {
  let failed = 0;
  for (const check of checks) {
    let passed: boolean;
    try {
      passed = await check.run();
    } catch (error) {
      passed = false;
      console.error(`     ${(error as Error).message}`);
    }
    console.log(`  ${passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${check.name}`);
    if (!passed) failed++;
  }
  if (failed > 0) throw new Error(`${failed} of ${checks.length} auth checks FAILED.`);
  console.log(`\n  ${checks.length} auth checks passed.\n`);
}

main()
  .catch((error: unknown) => {
    console.error(`\n${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(close);
