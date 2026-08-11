-- Row Level Security, enforced in the database rather than in application code.
--
-- This is the thing the beta may not have. It ships a Supabase publishable key in its page source
-- against a `plots` table; if RLS is off there, anyone who views source can read every client's
-- land valuations. Application-layer authorisation gets bypassed exactly once, and that once is a
-- client's plot data leaking to a competing developer.
--
-- Tenant context is set per connection/transaction:
--     SET LOCAL solum.organisation_id = '<uuid>';
-- Policies read it via current_setting(). Unset context returns nothing rather than everything.

CREATE OR REPLACE FUNCTION current_organisation_id() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
DECLARE
  raw TEXT;
BEGIN
  raw := current_setting('solum.organisation_id', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  RETURN raw::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  -- A malformed value must not fall through to "no filter".
  RETURN NULL;
END;
$$;

-- The role the application connects as. Deliberately not the table owner: owners bypass RLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'solum_app') THEN
    CREATE ROLE solum_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO solum_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO solum_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solum_app;

-- ── Tenant-scoped tables ────────────────────────────────────────────────────
-- Each carries organisation_id directly, so no policy needs a join. Joins in policies are how
-- RLS becomes slow and then gets turned off.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspaces', 'plots', 'appraisals', 'assumption_sets', 'results'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (organisation_id = current_organisation_id())
        WITH CHECK (organisation_id = current_organisation_id())
    $f$, t);
  END LOOP;
END $$;

-- Organisations: a member sees only their own.
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organisations
  USING (id = current_organisation_id());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON memberships
  USING (organisation_id = current_organisation_id())
  WITH CHECK (organisation_id = current_organisation_id());

-- Jobs may be system-wide (organisation_id NULL) or tenant-owned.
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON jobs
  USING (organisation_id IS NULL OR organisation_id = current_organisation_id())
  WITH CHECK (organisation_id IS NULL OR organisation_id = current_organisation_id());

-- ── Market data plane ───────────────────────────────────────────────────────
-- Shared across tenants and readable by all, but writable only by ingest (which runs as owner
-- and therefore bypasses RLS). Read-only to the app role: a tenant must never be able to alter
-- a comparables snapshot another tenant's appraisal is pinned to.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'communities', 'dld_transactions', 'comparable_snapshots', 'comparable_launches'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY shared_read ON %I FOR SELECT USING (true)', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM solum_app', t);
  END LOOP;
END $$;

-- Users table is looked up by the auth layer, which runs as owner.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY self_and_org_members ON users
  USING (
    id IN (
      SELECT user_id FROM memberships WHERE organisation_id = current_organisation_id()
    )
  );
