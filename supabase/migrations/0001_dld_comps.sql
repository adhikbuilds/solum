-- Solum · DLD comps schema (Phase 1)
-- See docs/prd/dld-comps-integration.md §5 for rationale.
-- Applied automatically by the Supabase↔GitHub integration on merge to main.

create extension if not exists pg_trgm;

-- ────────────────────────────────────────────────────────────────
-- Canonical Dubai communities — powers the constrained location typeahead.
-- The frontend ships this list (small) and filters in-memory; aliases let
-- "JVC" resolve to "Jumeirah Village Circle" in the search box (§6).
-- ────────────────────────────────────────────────────────────────
create table if not exists dld_locations (
  area_id       integer primary key,
  area_name_en  text not null,
  area_name_ar  text,
  aliases       text[] not null default '{}',
  tx_count      integer not null default 0,   -- sales-unit coverage signal
  updated_at    timestamptz not null default now()
);
create index if not exists dld_locations_name_trgm
  on dld_locations using gin (area_name_en gin_trgm_ops);

-- ────────────────────────────────────────────────────────────────
-- Deduped sales transactions we keep (units only). Ingestion filters to
-- Sales + Unit so we don't store the whole registry. Values are already
-- normalised at ingest: m²→ft², rooms_en→unit_type, reg_type_en→offplan/ready.
-- ────────────────────────────────────────────────────────────────
create table if not exists dld_transactions (
  transaction_id       text primary key,
  instance_date        date,
  area_id              integer references dld_locations(area_id),
  area_name_en         text,
  project_name_en      text,
  building_name_en     text,
  unit_type            text,        -- Studio | 1BR | 2BR | 3BR | 4BR+
  rooms_en_raw         text,        -- keep raw for auditing the mapping
  reg_type             text,        -- offplan | ready
  property_type_en     text,
  property_sub_type_en text,
  size_sqft            numeric,     -- procedure_area (m²) × 10.7639
  price_per_sqft       numeric,     -- meter_sale_price (AED/m²) ÷ 10.7639
  actual_worth         numeric,
  ingested_at          timestamptz not null default now()
);
create index if not exists dld_tx_slice
  on dld_transactions (area_id, unit_type, reg_type, instance_date desc);

-- ────────────────────────────────────────────────────────────────
-- Precomputed robust slice stats (rebuilt after each ingest). These are the
-- outlier-trimmed, recency-context stats per slice. The FINAL relevance
-- weighting (size-proximity to the user's target unit) is done at query time
-- in the read Edge Function, because it depends on the subject unit size.
-- (§7 methodology.)
-- ────────────────────────────────────────────────────────────────
create table if not exists comps_aggregates (
  area_id         integer not null,
  unit_type       text    not null,
  reg_type        text    not null,
  window_months   integer not null,
  sample_n        integer not null,
  price_sqft_wavg numeric,    -- recency-weighted, outlier-trimmed mean
  price_sqft_p25  numeric,
  price_sqft_p50  numeric,
  price_sqft_p75  numeric,
  size_sqft_p50   numeric,
  as_of_date      date,       -- newest instance_date in the slice
  refreshed_at    timestamptz not null default now(),
  primary key (area_id, unit_type, reg_type, window_months)
);

-- ────────────────────────────────────────────────────────────────
-- Ingestion run log — freshness probe result + incremental watermark.
-- ────────────────────────────────────────────────────────────────
create table if not exists ingestion_runs (
  id                bigserial primary key,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  mode              text,        -- probe | backfill | incremental
  rows_upserted     integer,
  max_instance_date date,        -- freshness watermark
  status            text,        -- ok | error
  note              text
);

-- Row Level Security: reads go through the anon key (public), writes only via
-- the service key used by the ingestion Lambda. Enable RLS + allow read.
alter table dld_locations    enable row level security;
alter table dld_transactions enable row level security;
alter table comps_aggregates enable row level security;

do $$ begin
  create policy read_locations  on dld_locations    for select using (true);
  create policy read_tx         on dld_transactions for select using (true);
  create policy read_aggregates on comps_aggregates for select using (true);
exception when duplicate_object then null; end $$;
-- (No insert/update/delete policies → the service_role key bypasses RLS and is
--  the only writer. ingestion_runs stays RLS-off; it's internal.)
