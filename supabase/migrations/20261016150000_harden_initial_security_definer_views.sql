begin;

do $$
declare
  role_assignment_columns constant text[] := array[
    'role_id', 'role_name', 'role_level', 'is_corporate', 'is_local',
    'area_name', 'company_name', 'person_id', 'person_name', 'is_primary',
    'is_backup', 'start_date', 'end_date', 'assignment_status'
  ];
  organizational_role_columns constant text[] := array[
    'id', 'area_id', 'name', 'description', 'level', 'is_corporate',
    'is_local', 'status', 'created_at', 'updated_at', 'role_code',
    'sort_order', 'responsibilities', 'org_parent_role_id', 'org_column',
    'org_row', 'country_id', 'site_id'
  ];
begin
  if to_regclass('public.v_role_assignments') is null
    or to_regclass('public.organizational_roles') is null then
    raise exception 'Expected organizational views are missing';
  end if;

  if to_regprocedure('public.is_app_admin()') is null then
    raise exception 'Expected authorization function public.is_app_admin() is missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('v_role_assignments', 'organizational_roles')
      and (
        pg_get_userbyid(c.relowner) <> 'postgres'
        or coalesce(c.reloptions @> array['security_invoker=true'], false)
        or not has_table_privilege('anon', c.oid, 'SELECT')
        or not has_table_privilege('authenticated', c.oid, 'SELECT')
        or not has_table_privilege('service_role', c.oid, 'SELECT')
      )
  ) then
    raise exception 'View owner, execution mode, or ACL differs from the certified precheck';
  end if;

  if (
    select array_agg(a.attname::text order by a.attnum)
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.v_role_assignments'::regclass
      and a.attnum > 0
      and not a.attisdropped
  ) <> role_assignment_columns then
    raise exception 'public.v_role_assignments column contract changed';
  end if;

  if (
    select array_agg(a.attname::text order by a.attnum)
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.organizational_roles'::regclass
      and a.attnum > 0
      and not a.attisdropped
  ) <> organizational_role_columns then
    raise exception 'public.organizational_roles column contract changed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('areas', 'companies')
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
    group by n.nspname
    having count(*) = 2
  ) then
    raise exception 'Expected RLS on public.areas and public.companies';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('areas', 'companies', 'people', 'person_roles', 'roles')
      and c.relkind in ('r', 'p')
      and (
        not has_table_privilege('authenticated', c.oid, 'SELECT')
        or not has_table_privilege('service_role', c.oid, 'SELECT')
      )
  ) then
    raise exception 'Base-table SELECT privileges differ from the certified invoker contract';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles r
    where r.rolname = 'service_role'
      and r.rolbypassrls
  ) then
    raise exception 'service_role must retain BYPASSRLS for the certified service contract';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'areas' and policyname = 'admin_areas_select')
        or (tablename = 'companies' and policyname = 'admin_companies_select')
      )
  ) then
    raise exception 'A planned admin SELECT policy already exists with unverified semantics';
  end if;
end
$$;

-- SECURITY INVOKER makes the base-table RLS contract effective. These two
-- policies preserve the complete result for authenticated administrators.
create policy admin_areas_select
  on public.areas
  for select
  to authenticated
  using (public.is_app_admin());

create policy admin_companies_select
  on public.companies
  for select
  to authenticated
  using (public.is_app_admin());

create or replace view public.v_role_assignments
with (security_invoker = true, security_barrier = true)
as
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
left join public.people pe on pe.id = per.person_id
where current_user = 'service_role'
  or coalesce(public.is_app_admin(), false);

create or replace view public.organizational_roles
with (security_invoker = true, security_barrier = true)
as
select
  r.id,
  r.area_id,
  r.name,
  r.description,
  r.level,
  r.is_corporate,
  r.is_local,
  r.status,
  r.created_at,
  r.updated_at,
  r.role_code,
  r.sort_order,
  r.responsibilities,
  r.org_parent_role_id,
  r.org_column,
  r.org_row,
  r.country_id,
  r.site_id
from public.roles r
where current_user = 'service_role'
  or coalesce(public.is_app_admin(), false);

comment on view public.organizational_roles is
  'Alias semantico de public.roles. Representa cargos o funciones organizacionales, no permisos de sistema.';

revoke all privileges on table public.v_role_assignments from public, anon, authenticated, service_role;
revoke all privileges on table public.organizational_roles from public, anon, authenticated, service_role;

grant select on table public.v_role_assignments to authenticated, service_role;
grant select on table public.organizational_roles to authenticated, service_role;

do $$
declare
  view_name text;
begin
  foreach view_name in array array['v_role_assignments', 'organizational_roles']
  loop
    if has_table_privilege('anon', format('public.%I', view_name), 'SELECT') then
      raise exception 'anon still has SELECT on public.%', view_name;
    end if;

    if not has_table_privilege('authenticated', format('public.%I', view_name), 'SELECT')
      or not has_table_privilege('service_role', format('public.%I', view_name), 'SELECT') then
      raise exception 'Expected authenticated and service_role SELECT on public.%', view_name;
    end if;
  end loop;
end
$$;

commit;
