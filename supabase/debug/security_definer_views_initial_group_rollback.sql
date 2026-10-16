-- Emergency rollback only. This restores the exact pre-remediation exposure,
-- including anonymous access, and therefore reopens the Security Advisor issue.
begin;

create or replace view public.v_role_assignments as
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

create or replace view public.organizational_roles as
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
from public.roles r;

alter view public.v_role_assignments reset (security_invoker, security_barrier);
alter view public.organizational_roles reset (security_invoker, security_barrier);

comment on view public.organizational_roles is
  'Alias semantico de public.roles. Representa cargos o funciones organizacionales, no permisos de sistema.';

revoke all privileges on table public.v_role_assignments from public, anon, authenticated, service_role;
revoke all privileges on table public.organizational_roles from public, anon, authenticated, service_role;
grant all privileges on table public.v_role_assignments to anon, authenticated, service_role;
grant all privileges on table public.organizational_roles to anon, authenticated, service_role;

drop policy if exists admin_areas_select on public.areas;
drop policy if exists admin_companies_select on public.companies;

commit;
