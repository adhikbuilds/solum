-- Solum · plots persistence — one row per saved plot, owned by the signed-in user.
-- Applied by the Supabase↔GitHub integration on merge to main.
-- Replaces browser-only (localStorage) plot storage: plots now follow the client
-- across devices and refreshes. The whole plot state is a JSON blob (matches the
-- app's in-memory shape; normalize later if reporting needs typed columns).

create table if not exists plots (
  id          text primary key,                         -- app-generated id (newId())
  user_id     uuid not null default auth.uid()
              references auth.users(id) on delete cascade,
  name        text,
  community   text,
  data        jsonb not null,                            -- full plot state
  updated_at  timestamptz not null default now()
);

create index if not exists plots_user_updated on plots (user_id, updated_at desc);

-- RLS: a client only ever sees and touches its own plots.
alter table plots enable row level security;

drop policy if exists plots_select on plots;
drop policy if exists plots_insert on plots;
drop policy if exists plots_update on plots;
drop policy if exists plots_delete on plots;

create policy plots_select on plots for select to authenticated using (user_id = auth.uid());
create policy plots_insert on plots for insert to authenticated with check (user_id = auth.uid());
create policy plots_update on plots for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy plots_delete on plots for delete to authenticated using (user_id = auth.uid());
