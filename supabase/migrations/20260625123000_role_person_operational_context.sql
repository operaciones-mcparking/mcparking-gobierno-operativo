alter table public.roles
add column if not exists country_id uuid references public.countries(id) on delete set null,
add column if not exists site_id uuid references public.sites(id) on delete set null;

alter table public.people
add column if not exists country_id uuid references public.countries(id) on delete set null,
add column if not exists site_id uuid references public.sites(id) on delete set null;

create index if not exists idx_roles_country_id on public.roles(country_id);
create index if not exists idx_roles_site_id on public.roles(site_id);
create index if not exists idx_people_country_id on public.people(country_id);
create index if not exists idx_people_site_id on public.people(site_id);

update public.roles r
set
  country_id = coalesce(r.country_id, company_context.country_id),
  site_id = coalesce(r.site_id, company_context.site_id)
from public.areas a
join lateral (
  select
    c.country_id,
    s.id as site_id
  from public.companies c
  left join lateral (
    select site.id
    from public.sites site
    where site.company_id = c.id
      and (c.country_id is null or site.country_id = c.country_id)
      and site.status = 'active'::public.record_status
      and site.site_type <> 'client_site'::public.site_type
    order by
      case when site.site_type = 'operation'::public.site_type then 0 else 1 end,
      site.name
    limit 1
  ) s on true
  where c.id = a.company_id
) company_context on true
where r.area_id = a.id
  and (r.country_id is null or r.site_id is null);

with latest_person_context as (
  select distinct on (pr.person_id)
    pr.person_id,
    pr.country_id,
    pr.site_id
  from public.person_roles pr
  where pr.status = 'active'::public.record_status
  order by pr.person_id, pr.is_primary desc, pr.start_date desc, pr.created_at desc
)
update public.people p
set
  country_id = coalesce(p.country_id, latest_person_context.country_id),
  site_id = coalesce(p.site_id, latest_person_context.site_id)
from latest_person_context
where latest_person_context.person_id = p.id
  and (p.country_id is null or p.site_id is null);

drop view if exists public.v_role_dictionary;

create view public.v_role_dictionary as
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
  coalesce(r.country_id, c.country_id) as country_id,
  country.name as country_name,
  country.code as country_code,
  r.site_id,
  site.name as site_name,
  assigned.person_id as current_person_id,
  assigned.person_name as current_person_name
from public.roles r
left join public.roles parent_role on parent_role.id = r.org_parent_role_id
left join public.areas a on a.id = r.area_id
left join public.companies c on c.id = a.company_id
left join public.countries country on country.id = coalesce(r.country_id, c.country_id)
left join public.sites site on site.id = r.site_id
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
    and (r.country_id is null or pr.country_id is null or pr.country_id = r.country_id)
    and (r.site_id is null or pr.site_id is null or pr.site_id = r.site_id)
  order by
    case when r.site_id is not null and pr.site_id = r.site_id then 0 else 1 end,
    pr.start_date desc,
    pr.created_at desc
  limit 1
) assigned on true
where r.status = 'active'::public.record_status;
