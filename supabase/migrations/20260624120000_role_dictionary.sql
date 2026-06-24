alter table public.roles
add column if not exists role_code text,
add column if not exists sort_order integer,
add column if not exists responsibilities text[] not null default '{}'::text[];

create index if not exists idx_roles_role_code on public.roles(role_code);
create index if not exists idx_roles_sort_order on public.roles(sort_order);

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
  r.status::text as role_status,
  a.id as area_id,
  a.name as area_name,
  c.id as company_id,
  c.name as company_name,
  assigned.person_id as current_person_id,
  assigned.person_name as current_person_name
from public.roles r
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
