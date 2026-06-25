create table if not exists public.auth_email_allowlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  app_role public.app_role not null default 'viewer'::public.app_role,
  default_country_id uuid references public.countries(id) on delete set null,
  default_site_id uuid references public.sites(id) on delete set null,
  status public.record_status not null default 'active'::public.record_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_email_allowlist_email_lower_unique unique (email)
);

create table if not exists public.auth_domain_allowlist (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  app_role public.app_role not null default 'viewer'::public.app_role,
  default_country_id uuid references public.countries(id) on delete set null,
  default_site_id uuid references public.sites(id) on delete set null,
  status public.record_status not null default 'active'::public.record_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists auth_email_allowlist_email_lower_idx
  on public.auth_email_allowlist (lower(email));

create unique index if not exists auth_domain_allowlist_domain_lower_idx
  on public.auth_domain_allowlist (lower(domain));

drop trigger if exists set_auth_email_allowlist_updated_at on public.auth_email_allowlist;
create trigger set_auth_email_allowlist_updated_at
  before update on public.auth_email_allowlist
  for each row execute function public.set_updated_at();

drop trigger if exists set_auth_domain_allowlist_updated_at on public.auth_domain_allowlist;
create trigger set_auth_domain_allowlist_updated_at
  before update on public.auth_domain_allowlist
  for each row execute function public.set_updated_at();

alter table public.auth_email_allowlist enable row level security;
alter table public.auth_domain_allowlist enable row level security;

create or replace function public.ensure_user_profile_from_allowlist()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  current_domain text := split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 2);
  email_rule record;
  domain_rule record;
  selected_app_role public.app_role;
  selected_country_id uuid;
  selected_site_id uuid;
  selected_display_name text;
begin
  if current_user_id is null or current_email = '' then
    return false;
  end if;

  select *
    into email_rule
    from public.auth_email_allowlist
    where lower(email) = current_email
      and status = 'active'::public.record_status
    limit 1;

  select *
    into domain_rule
    from public.auth_domain_allowlist
    where lower(domain) = current_domain
      and status = 'active'::public.record_status
    limit 1;

  if email_rule.id is null and domain_rule.id is null then
    return false;
  end if;

  selected_app_role := coalesce(email_rule.app_role, domain_rule.app_role, 'viewer'::public.app_role);
  selected_country_id := coalesce(email_rule.default_country_id, domain_rule.default_country_id);
  selected_site_id := coalesce(email_rule.default_site_id, domain_rule.default_site_id);
  selected_display_name := coalesce(email_rule.display_name, split_part(current_email, '@', 1));

  insert into public.user_profiles (
    user_id,
    display_name,
    email,
    app_role,
    default_country_id,
    default_site_id,
    status
  )
  values (
    current_user_id,
    selected_display_name,
    current_email,
    selected_app_role,
    selected_country_id,
    selected_site_id,
    'active'::public.record_status
  )
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        email = excluded.email,
        app_role = excluded.app_role,
        default_country_id = excluded.default_country_id,
        default_site_id = excluded.default_site_id,
        status = excluded.status;

  if selected_site_id is not null then
    insert into public.user_site_access (
      user_id,
      country_id,
      site_id,
      access_level,
      status
    )
    select
      current_user_id,
      s.country_id,
      s.id,
      case
        when selected_app_role = 'admin'::public.app_role then 'admin'::public.site_access_level
        when selected_app_role = 'manager'::public.app_role then 'editor'::public.site_access_level
        else 'viewer'::public.site_access_level
      end,
      'active'::public.record_status
    from public.sites s
    where s.id = selected_site_id
    on conflict (user_id, site_id) do update
      set access_level = excluded.access_level,
          status = excluded.status;
  end if;

  return true;
end;
$$;

grant execute on function public.ensure_user_profile_from_allowlist() to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'auth_email_allowlist'
      and policyname = 'auth_email_allowlist_read_own'
  ) then
    create policy "auth_email_allowlist_read_own"
      on public.auth_email_allowlist
      for select
      to authenticated
      using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'auth_domain_allowlist'
      and policyname = 'auth_domain_allowlist_read_authenticated'
  ) then
    create policy "auth_domain_allowlist_read_authenticated"
      on public.auth_domain_allowlist
      for select
      to authenticated
      using (status = 'active'::public.record_status);
  end if;
end;
$$;
