alter table public.countries enable row level security;
alter table public.sites enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'countries'
      and policyname = 'mvp_countries_read'
  ) then
    create policy "mvp_countries_read"
      on public.countries
      for select
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'countries'
      and policyname = 'mvp_countries_write'
  ) then
    create policy "mvp_countries_write"
      on public.countries
      for all
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sites'
      and policyname = 'mvp_sites_read'
  ) then
    create policy "mvp_sites_read"
      on public.sites
      for select
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sites'
      and policyname = 'mvp_sites_write'
  ) then
    create policy "mvp_sites_write"
      on public.sites
      for all
      using (true)
      with check (true);
  end if;
end $$;
