do $$
begin
  create type public.app_role as enum (
    'admin',
    'manager',
    'operator',
    'viewer'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.site_access_level as enum (
    'admin',
    'editor',
    'viewer'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  display_name text not null,
  email text not null,
  app_role public.app_role not null default 'viewer'::public.app_role,
  default_country_id uuid references public.countries(id) on delete set null,
  default_site_id uuid references public.sites(id) on delete set null,
  status public.record_status not null default 'active'::public.record_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_site_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(user_id) on delete cascade,
  country_id uuid references public.countries(id) on delete set null,
  site_id uuid references public.sites(id) on delete cascade,
  access_level public.site_access_level not null default 'viewer'::public.site_access_level,
  status public.record_status not null default 'active'::public.record_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_site_access_unique unique (user_id, site_id)
);

create index if not exists user_profiles_default_country_id_idx
  on public.user_profiles(default_country_id);

create index if not exists user_profiles_default_site_id_idx
  on public.user_profiles(default_site_id);

create index if not exists user_site_access_user_id_idx
  on public.user_site_access(user_id);

create index if not exists user_site_access_site_id_idx
  on public.user_site_access(site_id);

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_user_site_access_updated_at on public.user_site_access;
create trigger set_user_site_access_updated_at
  before update on public.user_site_access
  for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.user_site_access enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_read_own'
  ) then
    create policy "user_profiles_read_own"
      on public.user_profiles
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_update_own'
  ) then
    create policy "user_profiles_update_own"
      on public.user_profiles
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_site_access'
      and policyname = 'user_site_access_read_own'
  ) then
    create policy "user_site_access_read_own"
      on public.user_site_access
      for select
      using (auth.uid() = user_id);
  end if;
end $$;
