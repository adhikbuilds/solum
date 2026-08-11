-- Solum core schema.
--
-- Two planes, deliberately separated (see docs/architecture.md §4):
--   market data  — shared across tenants, slow-moving, versioned into immutable snapshots
--   appraisal    — per-tenant, fast-moving, private; pins a snapshot so it stays reproducible
--
-- Money is BIGINT fils. 1 AED = 100 fils. No floats anywhere near a valuation.
-- Areas are NUMERIC because square footage is a real measurement.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────────────
-- Tenancy
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE organisations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  full_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'analyst', 'viewer');

CREATE TABLE memberships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             membership_role NOT NULL DEFAULT 'analyst',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id)
);

CREATE TABLE workspaces (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON workspaces (organisation_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Market data plane — shared, not tenant-scoped
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE communities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  dld_area_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- How a row got here. 'seed' is honest synthetic data for local development and demos;
-- it must be visible in the UI as such, never presented as observed market data.
CREATE TYPE data_source AS ENUM ('seed', 'dld_api', 'dld_manual', 'third_party');

CREATE TABLE dld_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id      UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  transaction_date  DATE NOT NULL,
  unit_type         TEXT NOT NULL,
  area_sqft         NUMERIC(12, 2) NOT NULL CHECK (area_sqft > 0),
  price_fils        BIGINT NOT NULL CHECK (price_fils > 0),
  -- Stored rather than derived so the ingest decision is auditable and queries stay simple.
  price_psf_fils    BIGINT NOT NULL CHECK (price_psf_fils > 0),
  is_off_plan       BOOLEAN NOT NULL,
  floor             INTEGER,
  source            data_source NOT NULL,
  ingested_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON dld_transactions (community_id, transaction_date DESC);
CREATE INDEX ON dld_transactions (community_id, unit_type);

-- An immutable, dated view of comparables. Appraisals pin one of these by id and never query
-- live market data at render time, so a saved appraisal reproduces forever.
CREATE TABLE comparable_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE RESTRICT,
  as_of         DATE NOT NULL,
  -- Named so a report can state how the band was derived, not just what it is.
  method        TEXT NOT NULL,
  low_psf_fils     BIGINT NOT NULL,
  median_psf_fils  BIGINT NOT NULL,
  high_psf_fils    BIGINT NOT NULL,
  sample_size   INTEGER NOT NULL CHECK (sample_size >= 0),
  source        data_source NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (low_psf_fils <= median_psf_fils AND median_psf_fils <= high_psf_fils)
);

CREATE INDEX ON comparable_snapshots (community_id, as_of DESC);

-- Named nearby launches. In the beta these were string literals in the page source; here they
-- are rows with a source, so the UI can say where each one came from.
CREATE TABLE comparable_launches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id   UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  project_name   TEXT NOT NULL,
  developer      TEXT,
  price_psf_fils BIGINT NOT NULL,
  pct_sold       NUMERIC(5, 2),
  completion     TEXT,
  source         data_source NOT NULL,
  observed_at    DATE NOT NULL
);

CREATE INDEX ON comparable_launches (community_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Appraisal plane — tenant-scoped
-- ────────────────────────────────────────────────────────────────────────────

-- A plot is a fact about the world. An appraisal is an opinion about it at a point in time.
-- Keeping them separate is what makes "how did our view of this site change" answerable.
CREATE TABLE plots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  community_id      UUID REFERENCES communities(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  dld_plot_number   TEXT,
  land_area_sqft    NUMERIC(12, 2) NOT NULL CHECK (land_area_sqft > 0),
  far               NUMERIC(6, 3),
  gfa_sqft          NUMERIC(12, 2),
  saleable_area_sqft NUMERIC(12, 2),
  land_cost_fils    BIGINT,
  -- GeoJSON polygon. Kept as JSONB rather than PostGIS until geometry work actually needs it.
  boundary          JSONB,
  centroid_lat      NUMERIC(9, 6),
  centroid_lng      NUMERIC(9, 6),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON plots (organisation_id);
CREATE INDEX ON plots (workspace_id);

CREATE TYPE appraisal_status AS ENUM ('draft', 'computed', 'stale_engine', 'archived');

CREATE TABLE appraisals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  plot_id           UUID NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
  -- The pin. An appraisal never floats on live market data.
  comparable_snapshot_id UUID NOT NULL REFERENCES comparable_snapshots(id) ON DELETE RESTRICT,
  label             TEXT NOT NULL,
  status            appraisal_status NOT NULL DEFAULT 'draft',
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON appraisals (organisation_id);
CREATE INDEX ON appraisals (plot_id, created_at DESC);

-- Immutable once written. Editing an assumption creates a new set, never an UPDATE.
-- Storage is cheap; a corrupted audit trail is not recoverable.
CREATE TABLE assumption_sets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  appraisal_id    UUID NOT NULL REFERENCES appraisals(id) ON DELETE CASCADE,
  -- The complete resolved AppraisalInput the engine consumed. Full snapshot, not a diff.
  inputs          JSONB NOT NULL,
  -- Content hash of `inputs`, so identical runs are detectable.
  input_hash      TEXT NOT NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON assumption_sets (appraisal_id, created_at DESC);

CREATE TYPE verdict AS ENUM ('PASS', 'MARGINAL', 'FAIL', 'NO_VERDICT');

CREATE TABLE results (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id    UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  assumption_set_id  UUID NOT NULL REFERENCES assumption_sets(id) ON DELETE CASCADE,
  -- Which engine produced this. Results are never silently recomputed when the engine moves.
  engine_version     TEXT NOT NULL,
  verdict            verdict NOT NULL,
  verdict_reason     TEXT NOT NULL,
  outputs            JSONB NOT NULL,
  -- Ordered CalculationStep[]. This is what makes a number defensible in a committee.
  trace              JSONB NOT NULL,
  flags              JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON results (assumption_set_id, computed_at DESC);
CREATE INDEX ON results (organisation_id, verdict);

-- ────────────────────────────────────────────────────────────────────────────
-- Background work. A Postgres table until measurement says otherwise.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TYPE job_status AS ENUM ('queued', 'running', 'done', 'failed');

CREATE TABLE jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          job_status NOT NULL DEFAULT 'queued',
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  run_after       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX ON jobs (status, run_after) WHERE status = 'queued';
