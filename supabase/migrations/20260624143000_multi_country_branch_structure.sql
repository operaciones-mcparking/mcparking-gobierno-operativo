do $$
begin
  create type public.company_type as enum (
    'holding',
    'operating_company',
    'client',
    'partner',
    'supplier',
    'internal_unit'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.site_type as enum (
    'branch',
    'office',
    'parking',
    'client_site',
    'operation'
  );
exception when duplicate_object then null;
end $$;

alter table public.companies
add column if not exists parent_company_id uuid references public.companies(id) on delete set null,
add column if not exists company_type public.company_type not null default 'operating_company'::public.company_type;

do $$
begin
  alter table public.companies
  add constraint companies_parent_not_self
  check (parent_company_id is null or parent_company_id <> id);
exception when duplicate_object then null;
end $$;

alter table public.sites
add column if not exists parent_site_id uuid references public.sites(id) on delete set null,
add column if not exists site_type public.site_type not null default 'branch'::public.site_type,
add column if not exists address text,
add column if not exists city text;

do $$
begin
  alter table public.sites
  add constraint sites_parent_not_self
  check (parent_site_id is null or parent_site_id <> id);
exception when duplicate_object then null;
end $$;

alter table public.processes
add column if not exists country_id uuid references public.countries(id) on delete set null,
add column if not exists owner_site_id uuid references public.sites(id) on delete set null,
add column if not exists operating_site_id uuid references public.sites(id) on delete set null;

update public.processes p
set country_id = c.country_id
from public.companies c
where c.id = coalesce(p.owner_company_id, p.company_id)
  and p.country_id is null;

update public.companies
set company_type = 'client'::public.company_type
where name in ('El Alba', 'Los Cumas', 'Rixtath EIRL')
  and company_type = 'operating_company'::public.company_type;

create index if not exists idx_companies_parent_company_id
  on public.companies(parent_company_id);

create index if not exists idx_companies_country_type
  on public.companies(country_id, company_type);

create index if not exists idx_sites_company_country_type
  on public.sites(company_id, country_id, site_type);

create index if not exists idx_processes_country_id
  on public.processes(country_id);

create index if not exists idx_processes_owner_site_id
  on public.processes(owner_site_id);

create index if not exists idx_processes_operating_site_id
  on public.processes(operating_site_id);

create or replace view public.v_company_service_network as
select
  provider.id as provider_company_id,
  provider.name as provider_company_name,
  client.id as client_company_id,
  client.name as client_company_name,
  cr.relationship_type,
  cr.description as relationship_description,
  cr.status as relationship_status,
  count(distinct pc.process_id) as process_count,
  string_agg(distinct p.name, ', ' order by p.name) as processes,
  provider.company_type as provider_company_type,
  client.company_type as client_company_type,
  provider_country.name as provider_country_name,
  provider_country.code as provider_country_code,
  client_country.name as client_country_name,
  client_country.code as client_country_code
from public.company_relationships cr
join public.companies provider on provider.id = cr.provider_company_id
join public.companies client on client.id = cr.client_company_id
left join public.countries provider_country on provider_country.id = provider.country_id
left join public.countries client_country on client_country.id = client.country_id
left join public.process_clients pc
  on pc.client_company_id = client.id
  and pc.status = 'active'::public.record_status
left join public.processes p on p.id = pc.process_id
group by
  provider.id,
  provider.name,
  provider.company_type,
  provider_country.name,
  provider_country.code,
  client.id,
  client.name,
  client.company_type,
  client_country.name,
  client_country.code,
  cr.relationship_type,
  cr.description,
  cr.status;

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
  operating_company.company_type as operating_company_type
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
  owner_company.name,
  owner_company.company_type,
  operating_company.name,
  operating_company.company_type,
  process_country.name,
  process_country.code,
  owner_site.name,
  operating_site.name;
