-- Solum · Market Insights — price trend can filter by area (defaults to all Dubai).
-- Applied by the Supabase↔GitHub integration on merge. RLS-gated (authenticated).
-- Replaces the 1-arg market_price_trend with a 2-arg version that takes an
-- optional area id; passing null keeps the original city-wide behaviour.

drop function if exists market_price_trend(int);

create or replace function market_price_trend(p_months int default 24, p_area_id int default null)
returns table(month date, price_sqft numeric, n int)
language sql stable as $$
  with base as (
    select date_trunc('month', instance_date)::date as m, price_per_sqft
    from dld_transactions
    where price_per_sqft > 0
      and instance_date >= (current_date - make_interval(months => p_months))
      and (p_area_id is null or area_id = p_area_id)
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

grant execute on function market_price_trend(int, int) to anon, authenticated;
