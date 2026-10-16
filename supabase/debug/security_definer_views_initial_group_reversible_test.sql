\set ON_ERROR_STOP on

do $$
begin
  if current_database() <> 'security_definer_views_p0_test'
    or inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet) then
    raise exception 'This harness may run only in the isolated local test database';
  end if;
end
$$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create type public.record_status as enum ('active', 'inactive');

create table public.companies (
  id uuid primary key,
  name text not null
);

create table public.areas (
  id uuid primary key,
  company_id uuid references public.companies(id),
  name text not null
);

create table public.roles (
  id uuid primary key,
  area_id uuid references public.areas(id),
  name text not null,
  description text,
  level integer,
  is_corporate boolean,
  is_local boolean,
  status public.record_status,
  created_at timestamptz,
  updated_at timestamptz,
  role_code text,
  sort_order integer,
  responsibilities text,
  org_parent_role_id uuid,
  org_column integer,
  org_row integer,
  country_id uuid,
  site_id uuid
);

create table public.people (
  id uuid primary key,
  name text not null
);

create table public.person_roles (
  id uuid primary key,
  role_id uuid references public.roles(id),
  person_id uuid references public.people(id),
  is_primary boolean,
  is_backup boolean,
  start_date date,
  end_date date,
  status public.record_status
);

alter table public.companies enable row level security;
alter table public.areas enable row level security;
alter table public.roles enable row level security;
alter table public.people enable row level security;
alter table public.person_roles enable row level security;

create policy roles_public_read on public.roles for select to public using (true);
create policy people_public_read on public.people for select to public using (true);
create policy person_roles_public_read on public.person_roles for select to public using (true);

grant select on public.companies, public.areas, public.roles, public.people, public.person_roles
  to anon, authenticated, service_role;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(current_setting('request.jwt.claim.app_role', true), '') = 'admin';
$$;

grant execute on function public.is_app_admin() to authenticated, service_role;

insert into public.companies values ('00000000-0000-0000-0000-000000000001', 'McParking');
insert into public.areas values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Operaciones'
);
insert into public.roles values (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'Supervisor', 'Control operativo', 1, false, true, 'active', now(), now(),
  'SUPERVISOR', 1, 'Supervisar', null, 1, 1, null, null
);
insert into public.people values ('00000000-0000-0000-0000-000000000004', 'Persona control');
insert into public.person_roles values (
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
  true, false, current_date, null, 'active'
);

create view public.v_role_assignments as
select
  r.id as role_id,
  r.name as role_name,
  r.level as role_level,
  r.is_corporate,
  r.is_local,
  a.name as area_name,
  c.name as company_name,
  pe.id as person_id,
  pe.name as person_name,
  per.is_primary,
  per.is_backup,
  per.start_date,
  per.end_date,
  per.status as assignment_status
from public.roles r
left join public.areas a on a.id = r.area_id
left join public.companies c on c.id = a.company_id
left join public.person_roles per
  on per.role_id = r.id
  and per.status = 'active'::public.record_status
  and per.end_date is null
left join public.people pe on pe.id = per.person_id;

create view public.organizational_roles as
select * from public.roles;

comment on view public.organizational_roles is
  'Alias semantico de public.roles. Representa cargos o funciones organizacionales, no permisos de sistema.';

grant all privileges on public.v_role_assignments, public.organizational_roles
  to anon, authenticated, service_role;

create table public.expected_role_assignments as table public.v_role_assignments;
create table public.expected_organizational_roles as table public.organizational_roles;
grant select on public.expected_role_assignments, public.expected_organizational_roles
  to authenticated, service_role;

select jsonb_build_object(
  'phase', 'before',
  'anon_can_insert', has_table_privilege('anon', 'public.organizational_roles', 'INSERT'),
  'anon_can_update', has_table_privilege('anon', 'public.organizational_roles', 'UPDATE'),
  'anon_can_delete', has_table_privilege('anon', 'public.organizational_roles', 'DELETE'),
  'view_insertable', is_insertable_into
) as result
from information_schema.views
where table_schema = 'public' and table_name = 'organizational_roles';

\ir ../migrations/20261016150000_harden_initial_security_definer_views.sql

select jsonb_build_object(
  'phase', 'acl_after',
  'anon_select_blocked', not has_table_privilege('anon', 'public.organizational_roles', 'SELECT'),
  'anon_insert_blocked', not has_table_privilege('anon', 'public.organizational_roles', 'INSERT'),
  'anon_update_blocked', not has_table_privilege('anon', 'public.organizational_roles', 'UPDATE'),
  'anon_delete_blocked', not has_table_privilege('anon', 'public.organizational_roles', 'DELETE'),
  'assignments_anon_select_blocked', not has_table_privilege('anon', 'public.v_role_assignments', 'SELECT')
) as result;

begin;
set local role authenticated;
select set_config('request.jwt.claim.app_role', 'user', true);
select jsonb_build_object(
  'phase', 'authenticated_non_admin',
  'roles_empty', (select count(*) = 0 from public.organizational_roles),
  'assignments_empty', (select count(*) = 0 from public.v_role_assignments)
) as result;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.app_role', 'admin', true);
select jsonb_build_object(
  'phase', 'authenticated_admin',
  'roles_presence_delta', (
    select count(*) from (
      (select * from public.organizational_roles except select * from public.expected_organizational_roles)
      union all
      (select * from public.expected_organizational_roles except select * from public.organizational_roles)
    ) delta
  ),
  'assignments_presence_delta', (
    select count(*) from (
      (select * from public.v_role_assignments except select * from public.expected_role_assignments)
      union all
      (select * from public.expected_role_assignments except select * from public.v_role_assignments)
    ) delta
  )
) as result;
rollback;

begin;
set local role service_role;
select jsonb_build_object(
  'phase', 'service_role',
  'roles_presence_delta', (
    select count(*) from (
      (select * from public.organizational_roles except select * from public.expected_organizational_roles)
      union all
      (select * from public.expected_organizational_roles except select * from public.organizational_roles)
    ) delta
  ),
  'assignments_presence_delta', (
    select count(*) from (
      (select * from public.v_role_assignments except select * from public.expected_role_assignments)
      union all
      (select * from public.expected_role_assignments except select * from public.v_role_assignments)
    ) delta
  )
) as result;
rollback;

select jsonb_build_object(
  'phase', 'view_options',
  'all_invoker', bool_and(c.reloptions @> array['security_invoker=true']),
  'all_barrier', bool_and(c.reloptions @> array['security_barrier=true'])
) as result
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('v_role_assignments', 'organizational_roles');

\ir security_definer_views_initial_group_rollback.sql

select jsonb_build_object(
  'phase', 'rollback_warning_contract',
  'anon_select_restored', has_table_privilege('anon', 'public.organizational_roles', 'SELECT'),
  'anon_insert_restored', has_table_privilege('anon', 'public.organizational_roles', 'INSERT'),
  'security_invoker_removed', not coalesce(c.reloptions @> array['security_invoker=true'], false)
) as result
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'organizational_roles';
