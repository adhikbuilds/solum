-- Solum · area aliases — learned mappings from document community names to DLD areas.
-- Applied by the Supabase↔GitHub integration on merge to main.
--
-- The DDA plot register and the DLD transactions feed both use Dubai Municipality
-- community names, but they drift: spelling ("Al Barshaa South Third" vs "Al Barsha
-- South Third"), numbering ("Wadi Al Safa 5" vs "Wadi Al Safa Fifth"), and DDA
-- sometimes returns a master-community or project name instead of the municipal one.
-- Fuzzy matching narrows that gap but never closes it, so every mapping a human
-- confirms is recorded here and reused. The manual step gets rarer with use.
--
-- Aliases are deliberately shared across the whole client, not per user: the
-- correction is a fact about Dubai, not a preference.

create table if not exists area_aliases (
  alias       text primary key,                          -- lower-cased, whitespace-collapsed source name
  area_id     int  not null,                             -- the DLD area it resolves to
  area_name   text not null,                             -- denormalised for display without a join
  source      text not null default 'user',              -- 'user' | 'seed'
  hits        int  not null default 1,                   -- how often it has been relied on
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists area_aliases_area on area_aliases (area_id);

alter table area_aliases enable row level security;

-- Any signed-in client may read every alias: that is the point of learning them.
drop policy if exists area_aliases_select on area_aliases;
create policy area_aliases_select on area_aliases
  for select to authenticated using (true);

-- Writes go through record_area_alias() below rather than direct inserts, so the
-- normalisation and the hit counter cannot be bypassed.
drop policy if exists area_aliases_insert on area_aliases;
drop policy if exists area_aliases_update on area_aliases;

-- ── record_area_alias(raw, area_id) ────────────────────────────────────────
-- Called when someone resolves an unmatched community by hand. Normalises the
-- source name the same way the client does, and counts repeat use so a mapping
-- that keeps proving itself is visible. security definer because the table takes
-- no direct writes.
create or replace function record_area_alias(p_raw text, p_area_id int)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_key  text := lower(regexp_replace(coalesce(p_raw,''), '\s+', ' ', 'g'));
  v_name text;
begin
  if v_key = '' or p_area_id is null then return; end if;

  select area_name_en into v_name from dld_locations where area_id = p_area_id;
  if v_name is null then return; end if;         -- never learn a mapping to an area we do not know

  -- an alias that already equals a real area name teaches nothing
  if exists (select 1 from dld_locations where lower(area_name_en) = v_key) then return; end if;

  insert into area_aliases (alias, area_id, area_name, created_by)
  values (v_key, p_area_id, v_name, auth.uid())
  on conflict (alias) do update
    set area_id    = excluded.area_id,
        area_name  = excluded.area_name,
        hits       = area_aliases.hits + 1,
        updated_at = now();
end;
$$;

revoke all on function record_area_alias(text, int) from public;
grant execute on function record_area_alias(text, int) to authenticated;
