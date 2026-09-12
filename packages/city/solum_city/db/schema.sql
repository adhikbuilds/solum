-- The city, in Postgres.
--
-- Two rules shape every table here.
--
-- **Two geometries per plot, and that is not redundancy.** `geom_4326` is what tiles are cut
-- from, because tiles are Web Mercator and nothing else. `geom_3997` is Dubai Local Transverse
-- Mercator, plain metres, and it is what every setback, plate and residual land value is computed
-- in. Drop it as duplication and the appraisal can never move out of the raw JSON snapshot --
-- worse, some future query starts measuring in degrees and no test fails. `basemap.py` has
-- enforced "reproject for display only" since the first tile; this schema is where that rule
-- either survives contact with a database or quietly dies.
--
-- **Every row knows which acquisition it came from.** A snapshot is dated and immutable on disk;
-- it stays dated here. A number with no provenance is the thing this repo keeps refusing to ship.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------------------------
-- Acquisition
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS snapshots (
  id             SERIAL PRIMARY KEY,
  aoi            TEXT        NOT NULL,
  fetched_on     DATE        NOT NULL,
  feature_count  INTEGER     NOT NULL,
  source         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  loaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aoi, fetched_on)
);

COMMENT ON TABLE snapshots IS
  'One row per dated acquisition from the DDA plot layer. Rows in plots and massing point here, '
  'so "which day is this map" is a join and not a filename.';

-- ---------------------------------------------------------------------------------------------
-- Entitlement
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plots (
  id           TEXT    PRIMARY KEY,
  snapshot_id  INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  plot_number  TEXT    NOT NULL,
  land_name    TEXT,
  project      TEXT,

  area_sqft    NUMERIC,
  gfa_sqft     NUMERIC,
  floors       TEXT,

  -- NULL means DDA published no height for this plot. It is not zero and it is not a default:
  -- the renderer tests for the column's absence to decide whether to draw a building at all.
  height_m     NUMERIC,
  height_src   TEXT NOT NULL CHECK (height_src IN ('authority','derived','assumption','unavailable')),

  status       TEXT,
  land_use     TEXT,
  use_detail   TEXT,

  rlv          NUMERIC,
  rlv_psf      NUMERIC,
  -- priced: residential plot on residential assumptions. hypothetical: DDA publishes another use,
  -- so the arithmetic is sound and the premise is not. withheld: no scheme survives the envelope.
  rlv_verdict  TEXT NOT NULL CHECK (rlv_verdict IN ('priced','hypothetical','withheld')),
  rlv_why      TEXT,
  -- The share of non-land cost that does not scale with the scheme. AED 3.5 m of fixed soft cost
  -- is 4-5% of a tower and 70-77% of a villa; above roughly a half, the residual land value is
  -- mostly an artefact of a cost model calibrated on towers. Stored, not thresholded, because
  -- where the line sits is a judgement for whoever is reading -- but it must be visible.
  fixed_cost_share NUMERIC,

  geom_4326    geometry(Geometry, 4326) NOT NULL,   -- display: what tiles are cut from
  geom_3997    geometry(Geometry, 3997),            -- metric: what the engine computes in
  geom_lo      geometry(Geometry, 3857),            -- display: generalised, z<=12 only

  -- The two rules this repo keeps re-learning, written where they cannot be forgotten:
  -- no published height means no height, and no surviving scheme means no number.
  CONSTRAINT height_absent_iff_unavailable
    CHECK ((height_m IS NULL) = (height_src = 'unavailable')),
  CONSTRAINT value_absent_iff_withheld
    CHECK ((rlv_psf IS NULL) = (rlv_verdict = 'withheld'))
);

COMMENT ON COLUMN plots.geom_3997 IS
  'EPSG:3997, Dubai Local Transverse Mercator, metres. Every setback and plate is computed here. '
  'Never used for a tile; never reprojected back into a calculation.';
COMMENT ON COLUMN plots.geom_lo IS
  'ST_SimplifyPreserveTopology at 30 m, in 3857, for z<=12. 30 m is a third of a pixel at z10, so '
  'it cannot change what the overview looks like. Above z12 the full geometry is used.';

CREATE INDEX IF NOT EXISTS plots_geom_4326_gist ON plots USING GIST (geom_4326);
CREATE INDEX IF NOT EXISTS plots_geom_lo_gist   ON plots USING GIST (geom_lo);
CREATE INDEX IF NOT EXISTS plots_plot_number    ON plots (plot_number);
CREATE INDEX IF NOT EXISTS plots_rlv_psf        ON plots (rlv_psf) WHERE rlv_psf IS NOT NULL;
CREATE INDEX IF NOT EXISTS plots_status         ON plots (status);
CREATE INDEX IF NOT EXISTS plots_land_use       ON plots (land_use);
CREATE INDEX IF NOT EXISTS plots_snapshot       ON plots (snapshot_id);

-- ---------------------------------------------------------------------------------------------
-- The derived scheme
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS massing (
  id           BIGSERIAL PRIMARY KEY,
  snapshot_id  INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  plot_number  TEXT    NOT NULL,
  kind         TEXT    NOT NULL CHECK (kind IN ('podium','tower')),
  base_m       NUMERIC NOT NULL,
  top_m        NUMERIC NOT NULL CHECK (top_m > base_m),
  floors       INTEGER,
  land_use     TEXT,
  status       TEXT,
  geom_4326    geometry(Geometry, 4326) NOT NULL
);

COMMENT ON TABLE massing IS
  'The scheme the published envelope allows, as rectilinear blocks fitted to the site axis -- not '
  'the plot polygon pushed up to its permitted height. A plot is a piece of land and no building '
  'is the shape of one. Basements are absent on purpose: underground, and a map looks down.';

CREATE INDEX IF NOT EXISTS massing_geom_gist  ON massing USING GIST (geom_4326);
CREATE INDEX IF NOT EXISTS massing_plot       ON massing (plot_number);
CREATE INDEX IF NOT EXISTS massing_snapshot   ON massing (snapshot_id);

-- ---------------------------------------------------------------------------------------------
-- Tile cache
-- ---------------------------------------------------------------------------------------------

-- Measured 2026-09-12 over all 100,215 plots: the densest z16 tile builds in 6.1 ms and the
-- densest z10 tile in 511 ms, because the overview is 88,000 features in one tile and no amount
-- of geometry simplification changes that. So tiles are computed once and kept.
--
-- The snapshot is part of the key, not metadata on the row. A cache that outlives the load it was
-- cut from serves yesterday's city under today's numbers, and nothing on screen would say so.
CREATE TABLE IF NOT EXISTS tile_cache (
  layer        TEXT    NOT NULL,
  z            INTEGER NOT NULL,
  x            INTEGER NOT NULL,
  y            INTEGER NOT NULL,
  snapshot_id  INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  body         BYTEA   NOT NULL,
  built_ms     NUMERIC,
  built_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (layer, z, x, y, snapshot_id)
);
