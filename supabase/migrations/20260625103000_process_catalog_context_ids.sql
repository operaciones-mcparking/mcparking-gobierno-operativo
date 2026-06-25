create or replace view public.v_process_catalog as
select
  p.id as process_id,
  p.name as process_name,
  p.description as definition,
  p.objective,
  p.expected_result,
  p.criticality,
  p.status,
  p.documentation_status,
  p.is_replicable,
  p.is_global,
  a.name as area_name,
  owner_company.name as company_name,
  count(distinct sp.id) as subprocess_count,
  count(distinct pr.id) as responsibility_count,
  count(distinct ps.system_id) as system_count,
  owner_company.name as owner_company_name,
  operating_company.name as operating_company_name,
  process_country.name as country_name,
  process_country.code as country_code,
  owner_site.name as owner_site_name,
  operating_site.name as operating_site_name,
  owner_company.company_type as owner_company_type,
  operating_company.company_type as operating_company_type,
  owner_company.id as owner_company_id,
  operating_company.id as operating_company_id,
  process_country.id as country_id,
  owner_site.id as owner_site_id,
  operating_site.id as operating_site_id
from public.processes p
left join public.companies owner_company
  on owner_company.id = coalesce(p.owner_company_id, p.company_id)
left join public.companies operating_company
  on operating_company.id = coalesce(p.operating_company_id, p.company_id)
left join public.countries process_country
  on process_country.id = coalesce(p.country_id, owner_company.country_id, operating_company.country_id)
left join public.sites owner_site on owner_site.id = p.owner_site_id
left join public.sites operating_site on operating_site.id = p.operating_site_id
left join public.areas a on a.id = p.area_id
left join public.subprocesses sp on sp.process_id = p.id
left join public.process_roles pr on pr.process_id = p.id
left join public.process_systems ps on ps.process_id = p.id
group by
  p.id,
  p.name,
  p.description,
  p.objective,
  p.expected_result,
  p.criticality,
  p.status,
  p.documentation_status,
  p.is_replicable,
  p.is_global,
  a.name,
  owner_company.id,
  owner_company.name,
  owner_company.company_type,
  operating_company.id,
  operating_company.name,
  operating_company.company_type,
  process_country.id,
  process_country.name,
  process_country.code,
  owner_site.id,
  owner_site.name,
  operating_site.id,
  operating_site.name;
