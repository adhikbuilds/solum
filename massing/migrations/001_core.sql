-- Solum massing: tenanted core.
--
-- Isolation is enforced here, not in application code. Application-layer authorisation gets
-- bypassed exactly once, and that once is one developer's land valuations reaching a competitor
-- bidding on the same plot.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- Tenant context
-- ---------------------------------------------------------------------------------------------

-- Set per transaction: SET LOCAL solum.organisation_id = '<uuid>'
--
-- Returning NULL for an unset OR malformed value is the whole design. The dangerous failure is
-- not an error -- it is a policy that silently stops filtering and returns every tenant's rows.
CREATE OR REPLACE FUNCTION current_organisation_id() RETURNS UUID
LANGUAGE plpgsql STABLE AS $$
DECLARE raw TEXT;
BEGIN
  raw := current_setting('solum.organisation_id', true);
  IF raw IS NULL OR raw = '' THEN RETURN NULL; END IF;
  RETURN raw::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organisations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  full_name      TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE member_role AS ENUM ('viewer', 'analyst', 'admin');

CREATE TABLE IF NOT EXISTS memberships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             member_role NOT NULL DEFAULT 'analyst',
  UNIQUE (organisation_id, user_id)
);

-- Sessions are deliberately NOT readable by the application role. A stolen session id is a
-- credential; the app resolves one through a SECURITY DEFINER function and can never enumerate
-- the table.
CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id  UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------------------------
-- Studies
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS studies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES users(id),
  plot_number      TEXT NOT NULL,
  label            TEXT,
  setback_mode     TEXT NOT NULL CHECK (setback_mode IN ('conservative', 'optimistic')),
  -- The full DDA record as fetched, so a study can be recomputed against the engine of the day
  -- without re-fetching and without depending on DDA still returning the same thing.
  plot_record      JSONB NOT NULL,
  input_hash       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studies_org_created ON studies (organisation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS study_results (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  study_id         UUID NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  engine_version   TEXT NOT NULL,
  result           JSONB NOT NULL,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_results_study ON study_results (study_id, computed_at DESC);

-- Shared, tenant-agnostic compute cache. Keyed on the hash of (plot record + setback mode +
-- engine version), so it is correct across tenants by construction: identical inputs, identical
-- pure-function output. Readable by everyone, and holds no tenant data by definition.
CREATE TABLE IF NOT EXISTS study_cache (
  input_hash      TEXT PRIMARY KEY,
  engine_version  TEXT NOT NULL,
  result          JSONB NOT NULL,
  hits            BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only audit. Who looked at which plot, when, and whether it cost a DDA fetch.
CREATE TABLE IF NOT EXISTS audit_events (
  id               BIGSERIAL PRIMARY KEY,
  organisation_id  UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id),
  action           TEXT NOT NULL,
  detail           JSONB NOT NULL DEFAULT '{}',
  at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_org_at ON audit_events (organisation_id, at DESC);
