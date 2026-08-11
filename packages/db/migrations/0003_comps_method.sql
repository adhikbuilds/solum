-- Comparables methodology, ported from the prototype's `get_comps()` RPC.
--
-- This is the most valuable thing in the prototype and it was not obvious from the outside: the
-- deployed page appeared to hardcode comparables, but the real band comes from an RPC over roughly
-- 4,000 DLD transactions with P5–P95 outlier trimming per unit type and recency weighting on a
-- one-year half-life. That method is kept intact here.
--
-- What changes is the shape around it. The prototype computed comparables live, per request, as
-- the caller. That means a saved plot silently re-prices whenever the underlying data moves. Here
-- the same maths writes an immutable, dated snapshot that an appraisal pins by id, so a saved
-- appraisal reproduces exactly. See docs/architecture.md §4.
--
-- Al Mizan's feedback (2026-08-07, items 3 and 7) says averaging a whole area is wrong for a
-- specific scheme: they want 5–10 highly relevant comparables filtered by segment. The
-- `segment` parameter below is the hook for that. It is not yet populated — segmentation needs
-- the positioning question answered first, and whether that is an input or an output is still open.

-- Per-unit-type comparables over a recency window.
-- Recency weight halves every 365 days; outliers trimmed to the P5–P95 band per unit type.
CREATE OR REPLACE FUNCTION comps_by_unit_type(
  p_community_id UUID,
  p_as_of        DATE,
  p_months       INT DEFAULT 24,
  p_off_plan     BOOLEAN DEFAULT NULL   -- NULL = both off-plan and ready
)
RETURNS TABLE (
  unit_type      TEXT,
  sample_n       INT,
  price_psf_fils BIGINT,
  median_area    NUMERIC,
  latest         DATE
)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT t.unit_type, t.price_psf_fils, t.area_sqft, t.transaction_date
    FROM dld_transactions t
    WHERE t.community_id = p_community_id
      AND t.transaction_date >  (p_as_of - make_interval(months => p_months))
      AND t.transaction_date <= p_as_of
      AND (p_off_plan IS NULL OR t.is_off_plan = p_off_plan)
      AND t.price_psf_fils > 0
      AND t.area_sqft > 0
  ),
  bounds AS (
    SELECT unit_type,
           percentile_cont(0.05) WITHIN GROUP (ORDER BY price_psf_fils) AS p5,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY price_psf_fils) AS p95
    FROM base
    GROUP BY unit_type
  ),
  trimmed AS (
    SELECT b.unit_type,
           b.price_psf_fils,
           b.area_sqft,
           b.transaction_date,
           -- One-year half-life, measured against p_as_of rather than current_date so the
           -- function stays deterministic for a given snapshot date.
           power(0.5, (p_as_of - b.transaction_date) / 365.0) AS w
    FROM base b
    JOIN bounds bo USING (unit_type)
    WHERE b.price_psf_fils BETWEEN bo.p5 AND bo.p95
  )
  SELECT unit_type,
         count(*)::int,
         round(sum(price_psf_fils * w) / nullif(sum(w), 0))::bigint,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY area_sqft)::numeric, 0),
         max(transaction_date)
  FROM trimmed
  GROUP BY unit_type;
$$;

COMMENT ON FUNCTION comps_by_unit_type IS
  'Recency-weighted, outlier-trimmed price per sqft by unit type. Ported from the prototype''s '
  'get_comps(); deterministic for a given as_of date so snapshots are reproducible.';

-- Which unit type a snapshot band was built from, and how many transactions backed it. Lets a
-- report state "1BR: AED 1,780/sqft from 34 transactions" rather than one opaque area-wide figure,
-- which is what Al Mizan asked for.
CREATE TABLE snapshot_unit_bands (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id    UUID NOT NULL REFERENCES comparable_snapshots(id) ON DELETE CASCADE,
  unit_type      TEXT NOT NULL,
  price_psf_fils BIGINT NOT NULL,
  median_area    NUMERIC(12, 2),
  sample_n       INTEGER NOT NULL,
  latest         DATE,
  UNIQUE (snapshot_id, unit_type)
);

CREATE INDEX ON snapshot_unit_bands (snapshot_id);

ALTER TABLE snapshot_unit_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot_unit_bands FORCE ROW LEVEL SECURITY;
CREATE POLICY shared_read ON snapshot_unit_bands FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON snapshot_unit_bands FROM solum_app;

-- Positioning segment, from Al Mizan feedback items 3 and 7. Their suggested v1 heuristic is that
-- the top 5% of transactions by price represent the luxury band. Recorded on the snapshot so a
-- report can state which segment a band describes; NULL means area-wide, which is the current
-- behaviour and is wrong for a luxury scheme.
CREATE TYPE market_segment AS ENUM ('affordable', 'mid_market', 'luxury', 'ultra_luxury');

ALTER TABLE comparable_snapshots ADD COLUMN segment market_segment;

COMMENT ON COLUMN comparable_snapshots.segment IS
  'NULL = area-wide (all transactions). Al Mizan: averaging a whole area is wrong for a specific '
  'scheme. Populating this requires deciding whether positioning is an input or an output.';
