-- Normalized responsible roles for process metrics and controls.
-- Prepared for manual review. Do not apply before approval.
--
-- PRECHECK SQL READ-ONLY:
-- select
--   to_regclass('public.metrics') as metrics_table,
--   to_regclass('public.controls') as controls_table,
--   to_regclass('public.roles') as roles_table,
--   to_regclass('public.metric_responsible_roles') as metric_responsible_roles_table,
--   to_regclass('public.control_responsible_roles') as control_responsible_roles_table;
--
-- select 'metrics.owner_role_id' as legacy_source, count(*) as rows_to_backfill
-- from public.metrics
-- where owner_role_id is not null
-- union all
-- select 'controls.owner_role_id', count(*)
-- from public.controls
-- where owner_role_id is not null;

begin;

do $$
begin
  if to_regclass('public.metrics') is null
    or to_regclass('public.controls') is null
    or to_regclass('public.roles') is null then
    raise exception 'Required parent tables metrics, controls and roles must exist';
  end if;

  if to_regclass('public.metric_responsible_roles') is not null then
    raise exception 'Unexpected table public.metric_responsible_roles already exists';
  end if;

  if to_regclass('public.control_responsible_roles') is not null then
    raise exception 'Unexpected table public.control_responsible_roles already exists';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'metrics'
      and column_name = 'owner_role_id'
  ) then
    raise exception 'Required legacy column public.metrics.owner_role_id does not exist';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'controls'
      and column_name = 'owner_role_id'
  ) then
    raise exception 'Required legacy column public.controls.owner_role_id does not exist';
  end if;
end $$;

create table public.metric_responsible_roles (
  metric_id uuid not null references public.metrics(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (metric_id, role_id),
  check (sort_order >= 0)
);

create index idx_metric_responsible_roles_role_id
  on public.metric_responsible_roles(role_id);

create table public.control_responsible_roles (
  control_id uuid not null references public.controls(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (control_id, role_id),
  check (sort_order >= 0)
);

create index idx_control_responsible_roles_role_id
  on public.control_responsible_roles(role_id);

alter table public.metric_responsible_roles enable row level security;
alter table public.control_responsible_roles enable row level security;

revoke all on table public.metric_responsible_roles from public;
revoke all on table public.metric_responsible_roles from anon;
revoke all on table public.metric_responsible_roles from authenticated;
grant select, insert, update, delete on table public.metric_responsible_roles to service_role;

revoke all on table public.control_responsible_roles from public;
revoke all on table public.control_responsible_roles from anon;
revoke all on table public.control_responsible_roles from authenticated;
grant select, insert, update, delete on table public.control_responsible_roles to service_role;

insert into public.metric_responsible_roles (metric_id, role_id, sort_order)
select metrics.id, metrics.owner_role_id, 0
from public.metrics as metrics
where metrics.owner_role_id is not null
on conflict (metric_id, role_id) do nothing;

insert into public.control_responsible_roles (control_id, role_id, sort_order)
select controls.id, controls.owner_role_id, 0
from public.controls as controls
where controls.owner_role_id is not null
on conflict (control_id, role_id) do nothing;

comment on table public.metric_responsible_roles is
  'Ordered official roles responsible for a process metric. Legacy metrics.owner_role_id remains available during transition.';

comment on table public.control_responsible_roles is
  'Ordered official roles responsible for a control. Deleting a control cascades these assignments; deleting a role is restricted.';

-- Contract for the future section 5 editor:
-- - public.risks to public.controls remains one-to-many through controls.risk_id.
-- - deleting one documentary line deletes its control and cascades its responsible roles.
-- - a risk is never deleted automatically when its final control is removed.
-- - public.risks.role_id and public.controls.owner_role_id remain legacy fields.
--
-- POSTCHECK SQL READ-ONLY:
-- select count(*) as created_tables
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in ('metric_responsible_roles', 'control_responsible_roles');
--
-- select
--   conrelid::regclass as table_name,
--   conname,
--   contype,
--   pg_get_constraintdef(oid) as definition
-- from pg_constraint
-- where conrelid in (
--   'public.metric_responsible_roles'::regclass,
--   'public.control_responsible_roles'::regclass
-- )
-- order by conrelid::regclass::text, contype, conname;
--
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in ('metric_responsible_roles', 'control_responsible_roles')
-- order by tablename;
--
-- select
--   (select count(*) from public.metrics where owner_role_id is not null) as expected_metric_backfill,
--   (select count(*) from public.metric_responsible_roles assignments
--     join public.metrics metrics on metrics.id = assignments.metric_id
--     where assignments.role_id = metrics.owner_role_id) as matched_metric_backfill,
--   (select count(*) from public.controls where owner_role_id is not null) as expected_control_backfill,
--   (select count(*) from public.control_responsible_roles assignments
--     join public.controls controls on controls.id = assignments.control_id
--     where assignments.role_id = controls.owner_role_id) as matched_control_backfill;
--
-- select 'metric_responsible_roles' as table_name, count(*) as duplicate_pairs
-- from (
--   select metric_id, role_id
--   from public.metric_responsible_roles
--   group by metric_id, role_id
--   having count(*) > 1
-- ) duplicates
-- union all
-- select 'control_responsible_roles', count(*)
-- from (
--   select control_id, role_id
--   from public.control_responsible_roles
--   group by control_id, role_id
--   having count(*) > 1
-- ) duplicates;
--
-- select table_name, column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and (
--     (table_name = 'metrics' and column_name = 'owner_role_id')
--     or (table_name = 'risks' and column_name = 'role_id')
--     or (table_name = 'controls' and column_name in ('owner_role_id', 'risk_id'))
--   )
-- order by table_name, column_name;
--
-- select count(*) as controls_risk_id_unique_indexes
-- from pg_index
-- where indrelid = 'public.controls'::regclass
--   and indisunique
--   and pg_get_indexdef(indexrelid) ~* '\(risk_id\)';
--
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in ('metric_responsible_roles', 'control_responsible_roles')
-- order by table_name, grantee, privilege_type;

commit;
