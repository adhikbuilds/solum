-- Make tenant isolation behave identically on any Postgres, including Neon.
--
-- The bug this fixes was invisible locally and would have surfaced only in production.
--
-- Locally the connection user is a Docker-created SUPERUSER, and a superuser bypasses row-level
-- security outright — so every policy written so far was enforced only in the verification script,
-- which switched role by hand. The application path never exercised them at all.
--
-- On Neon the owner role (`neondb_owner`) is not a superuser. There, `FORCE ROW LEVEL SECURITY`
-- would have applied to it, and the admin path — sign-in, session lookup, migrations — would have
-- started returning zero rows. Login would break, and the cause would look like bad credentials.
--
-- The fix is to stop relying on who happens to be superuser and separate the two paths properly:
--
--   withTenant  → `SET LOCAL ROLE solum_app`, a role that owns nothing, so ordinary RLS applies
--   withAdmin   → stays as the owner, which bypasses RLS because it owns the tables
--
-- With the application running as a non-owner, FORCE is no longer needed and is actively harmful:
-- it is what would lock the owner out of its own admin queries.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organisations', 'memberships', 'workspaces', 'plots', 'appraisals',
    'assumption_sets', 'results', 'jobs', 'users',
    'communities', 'dld_transactions', 'comparable_snapshots', 'comparable_launches',
    'snapshot_unit_bands', 'sessions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- The app role needs to be able to assume itself from the owner connection.
DO $$
BEGIN
  EXECUTE format('GRANT solum_app TO %I', current_user);
EXCEPTION WHEN duplicate_object OR invalid_grant_operation THEN
  NULL; -- already granted, or the owner is a superuser and does not need it
END $$;

-- Sequences, for inserts made as the app role.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO solum_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO solum_app;

-- `gen_random_uuid()` and the comps function must be callable by the app role.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO solum_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO solum_app;

-- Market data stays readable and unwritable for the app role. Re-stated here because the grants
-- above are broad, and an appraisal pinned to a snapshot must never have that snapshot edited
-- underneath it by a tenant.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'communities', 'dld_transactions', 'comparable_snapshots', 'comparable_launches',
    'snapshot_unit_bands'
  ] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM solum_app', t);
  END LOOP;
END $$;

-- Sessions remain invisible to the app role: listing sessions is a log-in-as-anyone primitive.
REVOKE ALL ON sessions FROM solum_app;
