create extension if not exists "pgcrypto";

create type public.record_status as enum ('active', 'inactive', 'archived');
create type public.criticality_level as enum ('low', 'medium', 'high', 'critical');
create type public.role_level as enum ('operational', 'tactical', 'strategic', 'executive', 'board');
create type public.responsibility_type as enum ('owner', 'responsible', 'executor', 'approver', 'user', 'consulted', 'informed', 'backup');
create type public.documentation_status as enum ('not_started', 'draft', 'documented', 'needs_update');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  country_id uuid references public.countries(id) on delete set null,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  country_id uuid references public.countries(id) on delete set null,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.processes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  name text not null,
  description text,
  criticality public.criticality_level not null default 'medium',
  status public.record_status not null default 'active',
  is_replicable boolean not null default false,
  is_global boolean not null default false,
  documentation_status public.documentation_status not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.subprocesses (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes(id) on delete cascade,
  name text not null,
  description text,
  frequency text,
  criticality public.criticality_level not null default 'medium',
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, name)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  area_id uuid references public.areas(id) on delete set null,
  name text not null,
  description text,
  level public.role_level not null default 'operational',
  is_corporate boolean not null default false,
  is_local boolean not null default true,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area_id, name)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  phone text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.person_roles (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  country_id uuid references public.countries(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  is_primary boolean not null default true,
  is_backup boolean not null default false,
  start_date date not null default current_date,
  end_date date,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  unique (person_id, role_id, company_id, site_id, start_date)
);

create table public.process_roles (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes(id) on delete cascade,
  subprocess_id uuid references public.subprocesses(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  responsibility_type public.responsibility_type not null,
  impact_percent numeric(5,2) check (impact_percent is null or (impact_percent >= 0 and impact_percent <= 100)),
  criticality public.criticality_level not null default 'medium',
  is_required boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, subprocess_id, role_id, responsibility_type)
);

create table public.systems (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_role_id uuid references public.roles(id) on delete set null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table public.process_systems (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes(id) on delete cascade,
  subprocess_id uuid references public.subprocesses(id) on delete cascade,
  system_id uuid not null references public.systems(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, subprocess_id, system_id)
);

create table public.risks (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references public.processes(id) on delete cascade,
  subprocess_id uuid references public.subprocesses(id) on delete cascade,
  role_id uuid references public.roles(id) on delete set null,
  system_id uuid references public.systems(id) on delete set null,
  name text not null,
  description text,
  severity public.criticality_level not null default 'medium',
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.controls (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references public.processes(id) on delete cascade,
  risk_id uuid references public.risks(id) on delete set null,
  owner_role_id uuid references public.roles(id) on delete set null,
  name text not null,
  description text,
  frequency text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references public.processes(id) on delete cascade,
  subprocess_id uuid references public.subprocesses(id) on delete cascade,
  owner_role_id uuid references public.roles(id) on delete set null,
  name text not null,
  unit text,
  frequency text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_areas_company_id on public.areas(company_id);
create index idx_processes_company_area on public.processes(company_id, area_id);
create index idx_subprocesses_process_id on public.subprocesses(process_id);
create index idx_roles_area_id on public.roles(area_id);
create index idx_person_roles_role_id on public.person_roles(role_id);
create index idx_person_roles_person_id on public.person_roles(person_id);
create index idx_process_roles_process_id on public.process_roles(process_id);
create index idx_process_roles_role_id on public.process_roles(role_id);
create index idx_process_systems_process_id on public.process_systems(process_id);
create index idx_risks_process_id on public.risks(process_id);
create index idx_controls_process_id on public.controls(process_id);
create index idx_metrics_process_id on public.metrics(process_id);

create trigger set_countries_updated_at before update on public.countries for each row execute function public.set_updated_at();
create trigger set_companies_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger set_sites_updated_at before update on public.sites for each row execute function public.set_updated_at();
create trigger set_areas_updated_at before update on public.areas for each row execute function public.set_updated_at();
create trigger set_processes_updated_at before update on public.processes for each row execute function public.set_updated_at();
create trigger set_subprocesses_updated_at before update on public.subprocesses for each row execute function public.set_updated_at();
create trigger set_roles_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger set_people_updated_at before update on public.people for each row execute function public.set_updated_at();
create trigger set_person_roles_updated_at before update on public.person_roles for each row execute function public.set_updated_at();
create trigger set_process_roles_updated_at before update on public.process_roles for each row execute function public.set_updated_at();
create trigger set_systems_updated_at before update on public.systems for each row execute function public.set_updated_at();
create trigger set_process_systems_updated_at before update on public.process_systems for each row execute function public.set_updated_at();
create trigger set_risks_updated_at before update on public.risks for each row execute function public.set_updated_at();
create trigger set_controls_updated_at before update on public.controls for each row execute function public.set_updated_at();
create trigger set_metrics_updated_at before update on public.metrics for each row execute function public.set_updated_at();
