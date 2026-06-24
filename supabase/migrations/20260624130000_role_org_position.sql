alter table public.roles
add column if not exists org_parent_role_id uuid references public.roles(id) on delete set null,
add column if not exists org_column integer,
add column if not exists org_row integer;

create index if not exists idx_roles_org_parent_role_id on public.roles(org_parent_role_id);
create index if not exists idx_roles_org_position on public.roles(org_row, org_column);

drop view if exists public.v_role_dictionary;

create or replace view public.v_role_dictionary as
select
  r.id as role_id,
  r.role_code,
  r.name as role_name,
  r.description as role_description,
  r.level::text as role_level,
  r.responsibilities,
  r.is_corporate,
  r.is_local,
  r.sort_order,
  r.org_parent_role_id,
  parent_role.name as org_parent_role_name,
  parent_role.role_code as org_parent_role_code,
  r.org_column,
  r.org_row,
  r.status::text as role_status,
  a.id as area_id,
  a.name as area_name,
  c.id as company_id,
  c.name as company_name,
  assigned.person_id as current_person_id,
  assigned.person_name as current_person_name
from public.roles r
left join public.roles parent_role on parent_role.id = r.org_parent_role_id
left join public.areas a on a.id = r.area_id
left join public.companies c on c.id = a.company_id
left join lateral (
  select
    p.id as person_id,
    p.name as person_name
  from public.person_roles pr
  join public.people p on p.id = pr.person_id
  where pr.role_id = r.id
    and pr.status = 'active'::public.record_status
    and pr.is_primary = true
    and (pr.end_date is null or pr.end_date >= current_date)
  order by pr.start_date desc, pr.created_at desc
  limit 1
) assigned on true
where r.status = 'active'::public.record_status;
