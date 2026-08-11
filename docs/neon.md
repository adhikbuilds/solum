# Neon

Nothing in this repo is Neon-specific. Neon is Postgres, so moving there is a `DATABASE_URL`
change — that was the point of staying on ordinary Postgres rather than a hosted-database SDK.

Everything below is ready and verified locally. The only missing piece is the connection string.

---

## The bug Neon surfaced, and why it matters

Worth reading before deploying, because it was invisible locally and would have looked like a
credentials problem in production.

The local Postgres user created by the Docker image is a **superuser**, and a superuser bypasses
row-level security outright. So every policy written here was, on this machine, enforced only by the
verification script — which switched role by hand. The application path never exercised them.

Neon's owner role, `neondb_owner`, is **not** a superuser. There, `FORCE ROW LEVEL SECURITY` would
have applied to it, and the admin path — sign-in, session lookup, migrations — would have started
returning zero rows. Login would break, and it would look like the password was wrong.

Migration `0005_role_separation.sql` fixes it by separating the two paths properly rather than
depending on who happens to be superuser:

| Path | Runs as | RLS |
|---|---|---|
| `withTenant` — everything the app reads or writes for a tenant | `solum_app`, which owns nothing | applies, always |
| `withAdmin` — sign-in, sessions, migrations, ingest | the owner | bypassed, because it owns the tables |

`withTenant` now issues `SET LOCAL ROLE solum_app` for the whole transaction. That makes isolation
behave identically on a local superuser, on Neon, and on RDS. `pnpm db:verify-rls` proves it through
the real application path rather than a hand-rolled `SET ROLE`.

---

## Use the direct endpoint for migrations

Neon gives two connection strings per branch. The pooled one has `-pooler` in the host.

**Migrations must use the direct endpoint.** The pooler runs in transaction mode, which breaks
session-level `SET ROLE` and makes DDL unreliable. `pnpm db:migrate` refuses to run against a
pooled host rather than half-applying a schema:

```
Refusing to migrate through a pooled endpoint (ep-xxx-pooler.eu-central-1.aws.neon.tech).
```

The application is fine on either, and pooled is the better choice for a serverless runtime.

---

## Steps

```bash
# 1. Point at Neon. Direct endpoint, not the pooler.
#    TLS is enabled automatically for any non-localhost host, whether or not the URL says so.
export DATABASE_URL='postgresql://USER:PASSWORD@ep-xxx.eu-central-1.aws.neon.tech/solum?sslmode=require'

# 2. Apply the schema. Prints the target and warns when it is remote.
pnpm db:migrate

# 3. Prove isolation before any data goes in.
pnpm db:verify-rls
pnpm db:verify-auth

# 4. Optional: load the worked examples.
pnpm db:seed
```

`pnpm db:reset` refuses to run against anything that is not localhost — it drops every table, and
the audit trail is the product.

## Choosing a region

`me-central-1` does not exist on Neon. The nearest options are `eu-central-1` (Frankfurt) and
`ap-southeast-1` (Singapore). **This matters commercially, not technically:** selling to Emirati
developers and eventually to lenders raises data-residency questions, and neither region is in the
UAE. If a client's procurement team asks, the answer today is Frankfurt.

That is an argument for AWS `me-central-1` later, and the reason this code is deliberately portable.
See [`architecture.md`](architecture.md) §7.

## Application connection

The app reads the same `DATABASE_URL`. Use the **pooled** endpoint there — serverless runtimes open
many short-lived connections and will exhaust a direct endpoint.

If the app later runs on an edge runtime, swap `pg` for `@neondatabase/serverless` in
`packages/db/src/client.ts`. That is a client change only: no schema change, no query change, and
nothing in `packages/engine` is touched, because the engine has no I/O at all.

## What is verified, and what is not

Verified locally against Postgres 16, which is what Neon runs: all five migrations apply from
empty, 8 isolation checks pass through the real application path, 15 auth checks pass, and the app
role can insert plots and appraisals for its own organisation but not for another.

**Not yet verified against a real Neon instance** — no connection string has been provided. The
migrations use `CREATE EXTENSION pgcrypto`, `CREATE ROLE`, and `ALTER DEFAULT PRIVILEGES`, all of
which `neondb_owner` is permitted to run, but that is reasoning rather than evidence. Run step 2 and
step 3 above and the answer is definitive either way.
