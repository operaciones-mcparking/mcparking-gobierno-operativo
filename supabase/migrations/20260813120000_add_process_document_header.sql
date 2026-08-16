-- Add schema primitives for the process document header.
-- Prepared for manual review. Do not apply before approval.
--
-- PRECHECK SQL READ-ONLY:
-- select 'processes.owner_role_id' as check_name, count(*) as existing_columns
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'processes' and column_name = 'owner_role_id'
-- union all
-- select 'processes.master_updated_at', count(*)
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'processes' and column_name = 'master_updated_at'
-- union all
-- select 'process_versions table', case when to_regclass('public.process_versions') is null then 0 else 1 end
-- union all
-- select 'process_code_sequences table', case when to_regclass('public.process_code_sequences') is null then 0 else 1 end;

begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'processes'
      and column_name = 'process_code'
  ) then
    raise exception 'Expected public.processes.process_code to exist before adding document header schema';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'processes'
      and column_name = 'version'
  ) then
    raise exception 'Expected public.processes.version to exist before adding document header schema';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'processes'
      and column_name in ('owner_role_id', 'master_updated_at')
  ) then
    raise exception 'Unexpected process document header columns already exist in public.processes';
  end if;

  if to_regclass('public.process_versions') is not null then
    raise exception 'Unexpected table public.process_versions already exists';
  end if;

  if to_regclass('public.process_code_sequences') is not null then
    raise exception 'Unexpected table public.process_code_sequences already exists';
  end if;

  if to_regprocedure('public.reserve_process_code()') is not null then
    raise exception 'Unexpected function public.reserve_process_code() already exists';
  end if;

  if to_regprocedure('public.touch_process_master_updated_at()') is not null then
    raise exception 'Unexpected function public.touch_process_master_updated_at() already exists';
  end if;

  if exists (
    select 1
    from (
      values
        ('subprocesses'),
        ('process_roles'),
        ('process_role_profiles'),
        ('metrics'),
        ('risks'),
        ('controls'),
        ('process_documents'),
        ('process_systems'),
        ('process_clients')
    ) as expected(table_name)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = expected.table_name
        and c.column_name = 'process_id'
    )
  ) then
    raise exception 'Expected every process document child table to expose process_id';
  end if;
end $$;

alter table public.processes
  add column owner_role_id uuid null,
  add column master_updated_at timestamptz null;

alter table public.processes
  add constraint processes_owner_role_id_fkey
  foreign key (owner_role_id)
  references public.roles(id)
  on delete restrict;

create index idx_processes_owner_role_id
  on public.processes(owner_role_id);

create index idx_processes_master_updated_at
  on public.processes(master_updated_at desc);

create table public.process_code_sequences (
  sequence_key text primary key,
  code_prefix text not null,
  last_value bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint process_code_sequences_key_not_blank check (btrim(sequence_key) <> ''),
  constraint process_code_sequences_prefix_not_blank check (btrim(code_prefix) <> ''),
  constraint process_code_sequences_last_value_non_negative check (last_value >= 0)
);

create trigger set_process_code_sequences_updated_at
  before update on public.process_code_sequences
  for each row execute function public.set_updated_at();

revoke all on table public.process_code_sequences from public;
revoke all on table public.process_code_sequences from anon;
revoke all on table public.process_code_sequences from authenticated;
grant all on table public.process_code_sequences to service_role;

alter table public.process_code_sequences enable row level security;

create function public.reserve_process_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next_value bigint;
  v_code_prefix text;
begin
  perform pg_advisory_xact_lock(hashtextextended('process_code_sequence_process', 0));

  insert into public.process_code_sequences (sequence_key, code_prefix, last_value)
  values ('process', 'PROC', 1)
  on conflict (sequence_key) do update
    set last_value = public.process_code_sequences.last_value + 1
  returning last_value, code_prefix
  into v_next_value, v_code_prefix;

  if v_next_value > 999999 then
    raise exception 'Process document code sequence exhausted at PROC-999999';
  end if;

  return v_code_prefix || '-' || lpad(v_next_value::text, 6, '0');
end;
$$;

revoke all on function public.reserve_process_code() from public;
revoke execute on function public.reserve_process_code() from anon;
revoke execute on function public.reserve_process_code() from authenticated;
grant execute on function public.reserve_process_code() to service_role;

create table public.process_versions (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null,
  version text not null,
  snapshot jsonb not null,
  snapshot_schema_version integer not null default 1,
  published_at timestamptz not null default now(),
  published_by uuid null,
  change_summary text,
  created_at timestamptz not null default now(),
  constraint process_versions_process_id_fkey
    foreign key (process_id) references public.processes(id) on delete restrict,
  constraint process_versions_published_by_fkey
    foreign key (published_by) references public.user_profiles(user_id) on delete set null,
  constraint process_versions_version_not_blank check (btrim(version) <> ''),
  constraint process_versions_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  constraint process_versions_snapshot_schema_version_positive check (snapshot_schema_version > 0),
  constraint process_versions_process_version_key unique (process_id, version)
);

create index idx_process_versions_process_published_at
  on public.process_versions(process_id, published_at desc);

create index idx_process_versions_published_by
  on public.process_versions(published_by);

revoke all on table public.process_versions from public;
revoke all on table public.process_versions from anon;
revoke all on table public.process_versions from authenticated;
grant all on table public.process_versions to service_role;

alter table public.process_versions enable row level security;

create function public.touch_process_master_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_process_id uuid;
  v_new_process_id uuid;
begin
  if tg_table_name = 'processes' then
    if tg_op = 'INSERT' then
      new.master_updated_at := coalesce(new.master_updated_at, now());
      return new;
    end if;

    if tg_op = 'UPDATE' then
      if (to_jsonb(new) - 'updated_at' - 'master_updated_at') is distinct from (to_jsonb(old) - 'updated_at' - 'master_updated_at') then
        new.master_updated_at := now();
      end if;
      return new;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old_process_id := old.process_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_new_process_id := new.process_id;
  end if;

  if v_old_process_id is not null or v_new_process_id is not null then
    update public.processes
    set master_updated_at = now()
    where id in (v_old_process_id, v_new_process_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.touch_process_master_updated_at() from public;
revoke execute on function public.touch_process_master_updated_at() from anon;
revoke execute on function public.touch_process_master_updated_at() from authenticated;
grant execute on function public.touch_process_master_updated_at() to service_role;

create trigger set_processes_master_updated_at
  before insert or update on public.processes
  for each row execute function public.touch_process_master_updated_at();

create trigger touch_processes_master_updated_at_from_subprocesses
  after insert or update or delete on public.subprocesses
  for each row execute function public.touch_process_master_updated_at();

create trigger touch_processes_master_updated_at_from_process_roles
  after insert or update or delete on public.process_roles
  for each row execute function public.touch_process_master_updated_at();

create trigger touch_processes_master_updated_at_from_process_role_profiles
  after insert or update or delete on public.process_role_profiles
  for each row execute function public.touch_process_master_updated_at();

create trigger touch_processes_master_updated_at_from_metrics
  after insert or update or delete on public.metrics
  for each row execute function public.touch_process_master_updated_at();

create trigger touch_processes_master_updated_at_from_risks
  after insert or update or delete on public.risks
  for each row execute function public.touch_process_master_updated_at();

create trigger touch_processes_master_updated_at_from_controls
  after insert or update or delete on public.controls
  for each row execute function public.touch_process_master_updated_at();

create trigger touch_processes_master_updated_at_from_process_documents
  after insert or update or delete on public.process_documents
  for each row execute function public.touch_process_master_updated_at();

create trigger touch_processes_master_updated_at_from_process_systems
  after insert or update or delete on public.process_systems
  for each row execute function public.touch_process_master_updated_at();

create trigger touch_processes_master_updated_at_from_process_clients
  after insert or update or delete on public.process_clients
  for each row execute function public.touch_process_master_updated_at();

commit;