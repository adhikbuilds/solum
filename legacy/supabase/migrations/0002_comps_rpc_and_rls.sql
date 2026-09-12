-- Solum · Phase 2b — comps RPC + auth-gated RLS
-- Applied by the Supabase↔GitHub integration on merge to main.

-- ── get_comps(area, months) ────────────────────────────────────────────────
-- Per unit type in a community: recency-weighted, outlier-trimmed price/ft² +
-- median size + sample size, over a recency window. Runs as the caller, so RLS
-- applies — an authenticated session gets data, anon gets nothing.
create or replace function get_comps(p_area_id int, p_months int default 24)
returns table(unit_type text, sample_n int, price_sqft numeric, size_sqft numeric, as_of date)
language sql stable
as $$
  with base as (
    select unit_type, price_per_sqft, size_sqft, instance_date
    from dld_transactions
    where area_id = p_area_id
      and unit_type is not null and unit_type <> ''
      and price_per_sqft > 0 and size_sqft > 0
      and instance_date >= (current_date - make_interval(months => p_months))
  ),
  bounds as (   -- P5–P95 per unit type, to trim garbage/outliers
    select unit_type,
           percentile_cont(0.05) within group (order by price_per_sqft) as p5,
           percentile_cont(0.95) within group (order by price_per_sqft) as p95
    from base group by unit_type
  ),
  trimmed as (  -- recency weight: 1-year half-life
    select b.unit_type, b.price_per_sqft, b.size_sqft, b.instance_date,
           power(0.5, (current_date - b.instance_date) / 365.0) as w
    from base b join bounds bo using (unit_type)
    where b.price_per_sqft between bo.p5 and bo.p95
  )
  select unit_type,
         count(*)::int,
         round((sum(price_per_sqft * w) / nullif(sum(w), 0))::numeric, 0),
         round(percentile_cont(0.5) within group (order by size_sqft)::numeric, 0),
         max(instance_date)
  from trimmed
  group by unit_type;
$$;

grant execute on function get_comps(int, int) to anon, authenticated;

-- ── Tighten RLS: reads now require an authenticated session ─────────────────
-- (Ships with Phase 2b frontend auth — the app carries the session, anon gets
--  nothing. Dashboard/service-role writes bypass RLS and are unaffected.)
alter table dld_locations    enable row level security;
alter table dld_transactions enable row level security;
alter table comps_aggregates enable row level security;
drop policy if exists read_locations  on dld_locations;
drop policy if exists read_tx         on dld_transactions;
drop policy if exists read_aggregates on comps_aggregates;
create policy read_locations  on dld_locations    for select to authenticated using (true);
create policy read_tx         on dld_transactions for select to authenticated using (true);
create policy read_aggregates on comps_aggregates for select to authenticated using (true);
