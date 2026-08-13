-- Extend the process master sheet schema.
-- Prepared for manual review before any remote application.

begin;

do $$
begin
  if (select count(*) from public.processes where status = 'active'::public.record_status) <> 19 then
    raise exception 'Expected 19 active processes before extending process master sheet schema';
  end if;

  if (
    select count(*)
    from public.subprocesses sp
    join public.processes p on p.id = sp.process_id
    where p.status = 'active'::public.record_status
      and sp.status = 'active'::public.record_status
  ) <> 94 then
    raise exception 'Expected 94 active subprocesses before extending process master sheet schema';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'processes'
      and column_name in (
        'process_code',
        'version',
        'effective_date',
        'process_start',
        'process_end',
        'scope',
        'pdca_plan',
        'pdca_do',
        'pdca_check',
        'pdca_act'
      )
  ) then
    raise exception 'Unexpected process master sheet columns already exist in public.processes';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'metrics'
      and column_name in ('formula', 'target', 'sort_order')
  ) then
    raise exception 'Unexpected process master sheet columns already exist in public.metrics';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'risks'
      and column_name = 'risk_type'
  ) then
    raise exception 'Unexpected process master sheet column already exists in public.risks';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'controls'
      and column_name = 'evidence'
  ) then
    raise exception 'Unexpected process master sheet column already exists in public.controls';
  end if;

  if to_regclass('public.process_role_profiles') is not null then
    raise exception 'Unexpected table public.process_role_profiles already exists';
  end if;

  if to_regclass('public.process_documents') is not null then
    raise exception 'Unexpected table public.process_documents already exists';
  end if;
end $$;

alter table public.processes
  add column process_code text,
  add column version text,
  add column effective_date date,
  add column process_start text,
  add column process_end text,
  add column scope text,
  add column pdca_plan text,
  add column pdca_do text,
  add column pdca_check text,
  add column pdca_act text;

alter table public.processes
  add constraint processes_process_code_not_blank
  check (process_code is null or btrim(process_code) <> '');

create unique index idx_processes_process_code_unique_ci
  on public.processes (lower(process_code))
  where process_code is not null and btrim(process_code) <> '';

alter table public.metrics
  add column formula text,
  add column target text,
  add column sort_order integer;

create index idx_metrics_process_sort_order
  on public.metrics(process_id, sort_order);

alter table public.risks
  add column risk_type text;

alter table public.risks
  add constraint risks_risk_type_check
  check (risk_type is null or risk_type in ('risk', 'opportunity'));

alter table public.controls
  add column evidence text;

create table public.process_role_profiles (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes(id) on delete restrict,
  role_id uuid not null references public.roles(id) on delete restrict,
  responsibility_description text,
  authority_description text,
  accountability_description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, role_id)
);

create index idx_process_role_profiles_process_id
  on public.process_role_profiles(process_id);

create index idx_process_role_profiles_role_id
  on public.process_role_profiles(role_id);

create table public.process_documents (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes(id) on delete restrict,
  document_type text not null default 'other',
  name text not null,
  usage text,
  document_url text,
  status public.record_status not null default 'active',
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (document_type in ('procedure', 'record', 'policy', 'instruction', 'evidence', 'other'))
);

create index idx_process_documents_process_id
  on public.process_documents(process_id);

create index idx_process_documents_process_sort_order
  on public.process_documents(process_id, sort_order);

create trigger set_process_role_profiles_updated_at
  before update on public.process_role_profiles
  for each row execute function public.set_updated_at();

create trigger set_process_documents_updated_at
  before update on public.process_documents
  for each row execute function public.set_updated_at();

alter table public.process_role_profiles enable row level security;
alter table public.process_documents enable row level security;

commit;
