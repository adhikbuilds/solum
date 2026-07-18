-- Solum · Market Insights v1 — three RPCs over the DLD data.
-- Applied by the Supabase↔GitHub integration on merge. RLS-gated (authenticated).

-- 1 · Price trend — monthly median price/ft² (outlier-trimmed per month).
create or replace function market_price_trend(p_months int default 24)
returns table(month date, price_sqft numeric, n int)
language sql stable as $$
  with base as (
    select date_trunc('month', instance_date)::date as m, price_per_sqft
    from dld_transactions
    where price_per_sqft > 0
      and instance_date >= (current_date - make_interval(months => p_months))
  ),
  b as (
    select m,
           percentile_cont(0.05) within group (order by price_per_sqft) as p5,
           percentile_cont(0.95) within group (order by price_per_sqft) as p95
    from base group by m
  )
  select base.m,
         round(percentile_cont(0.5) within group (order by base.price_per_sqft)::numeric, 0),
         count(*)::int
  from base join b using (m)
  where base.price_per_sqft between b.p5 and b.p95
  group by base.m
  order by base.m;
$$;

-- 2 · Velocity — transactions per community (where the market is active).
create or replace function market_velocity(p_months int default 12, p_limit int default 15)
returns table(area_id int, area_name text, n int)
language sql stable as $$
  select t.area_id, max(l.area_name_en) as area_name, count(*)::int
  from dld_transactions t
  left join dld_locations l using (area_id)
  where t.instance_date >= (current_date - make_interval(months => p_months))
  group by t.area_id
  order by count(*) desc
  limit p_limit;
$$;

-- 3 · Off-plan vs ready split.
create or replace function market_offplan(p_months int default 24)
returns table(reg_type text, n int)
language sql stable as $$
  select reg_type, count(*)::int
  from dld_transactions
  where instance_date >= (current_date - make_interval(months => p_months))
  group by reg_type;
$$;

grant execute on function market_price_trend(int)      to anon, authenticated;
grant execute on function market_velocity(int, int)    to anon, authenticated;
grant execute on function market_offplan(int)          to anon, authenticated;
