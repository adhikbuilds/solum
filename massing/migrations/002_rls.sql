-- Row Level Security.
--
-- The application connects as `solum_app`, which is deliberately NOT the table owner: owners
-- bypass RLS entirely, so an app running as owner has policies that look enforced and are not.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'solum_app') THEN
    CREATE ROLE solum_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO solum_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO solum_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO solum_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO solum_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO solum_app;

-- Tenant-scoped tables: every row carries organisation_id and is visible only under matching
-- tenant context. An unset context matches nothing, because current_organisation_id() is NULL
-- and NULL = anything is never true.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['studies', 'study_results', 'audit_events', 'memberships'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (organisation_id = current_organisation_id())
        WITH CHECK (organisation_id = current_organisation_id())
    $f$, t);
  END LOOP;
END $$;

-- An organisation is visible only to itself.
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON organisations;
CREATE POLICY tenant_isolation ON organisations
  USING (id = current_organisation_id());

-- Users are visible only to members of the current organisation.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_members_only ON users;
CREATE POLICY org_members_only ON users
  USING (EXISTS (
    SELECT 1 FROM memberships m
     WHERE m.user_id = users.id
       AND m.organisation_id = current_organisation_id()
  ));

-- The compute cache is shared and tenant-agnostic: readable by all, writable by the app.
-- It holds only pure-function output over public regulatory data.
ALTER TABLE study_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_cache FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shared_cache ON study_cache;
CREATE POLICY shared_cache ON study_cache USING (true) WITH CHECK (true);

-- Sessions: the application role cannot read this table at all. A session id is a bearer
-- credential; being able to SELECT it is being able to impersonate every user.
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sessions FROM solum_app;

-- The only way in: a SECURITY DEFINER function that resolves one session id and returns nothing
-- else. It runs as the owner, so it can read the table the caller cannot.
CREATE OR REPLACE FUNCTION resolve_session(session_id TEXT)
RETURNS TABLE (user_id UUID, organisation_id UUID, role member_role)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT s.user_id, s.organisation_id, m.role
    FROM sessions s
    JOIN memberships m
      ON m.user_id = s.user_id AND m.organisation_id = s.organisation_id
   WHERE s.id = session_id
     AND s.revoked_at IS NULL
     AND s.expires_at > now();
$$;

CREATE OR REPLACE FUNCTION create_session(
  p_session_id TEXT, p_user_id UUID, p_organisation_id UUID, p_ttl INTERVAL
) RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO sessions (id, user_id, organisation_id, expires_at)
  VALUES (p_session_id, p_user_id, p_organisation_id, now() + p_ttl);
$$;

CREATE OR REPLACE FUNCTION revoke_session(p_session_id TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE sessions SET revoked_at = now() WHERE id = p_session_id AND revoked_at IS NULL;
$$;

-- Sign-in needs the password hash, which the app role must not be able to SELECT in bulk.
CREATE OR REPLACE FUNCTION credentials_for(p_email TEXT)
RETURNS TABLE (user_id UUID, organisation_id UUID, password_hash TEXT)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT u.id, m.organisation_id, u.password_hash
    FROM users u JOIN memberships m ON m.user_id = u.id
   WHERE lower(u.email) = lower(p_email)
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_session(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_session(TEXT, UUID, UUID, INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION revoke_session(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION credentials_for(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_session(TEXT) TO solum_app;
GRANT EXECUTE ON FUNCTION create_session(TEXT, UUID, UUID, INTERVAL) TO solum_app;
GRANT EXECUTE ON FUNCTION revoke_session(TEXT) TO solum_app;
GRANT EXECUTE ON FUNCTION credentials_for(TEXT) TO solum_app;
GRANT EXECUTE ON FUNCTION current_organisation_id() TO solum_app;
