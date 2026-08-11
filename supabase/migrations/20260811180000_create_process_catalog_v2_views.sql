-- Read-model views for the /procesos V2 catalog UI.
-- These views do not modify business data; they only expose active processes,
-- active stages, and role/person summaries derived from existing relations.

create or replace view public.v_process_catalog_v2 as
with active_processes as (
  select
    p.id,
    p.name,
    p.description,
    p.objective,
    p.expected_result,
    p.inputs_providers,
    p.outputs_clients,
    p.basic_kpi,
    p.process_type,
    p.criticality,
    p.status,
    p.documentation_status,
    p.is_replicable,
    p.is_global,
    p.company_id,
    p.area_id,
    p.owner_company_id,
    p.operating_company_id,
    p.country_id,
    p.owner_site_id,
    p.operating_site_id
  from public.processes p
  where p.status = 'active'::public.record_status
),
active_stages as (
  select
    sp.id,
    sp.process_id
  from public.subprocesses sp
  join active_processes p on p.id = sp.process_id
  where sp.status = 'active'::public.record_status
),
stage_counts as (
  select
    ast.process_id,
    count(*)::integer as active_stage_count
  from active_stages ast
  group by ast.process_id
),
owner_roles_raw as (
  select distinct
    pr.process_id,
    pr.role_id,
    r.name as role_name,
    coalesce(pr.role_company_id, p.operating_company_id, p.company_id) as role_company_id
  from public.process_roles pr
  join active_processes p on p.id = pr.process_id
  join active_stages ast on ast.id = pr.subprocess_id
  join public.roles r on r.id = pr.role_id
  where pr.responsibility_type = 'owner'::public.responsibility_type
),
owner_roles as (
  select
    process_id,
    array_agg(role_id order by role_name, role_id) as owner_role_ids,
    array_agg(role_name order by role_name, role_id) as owner_role_names
  from owner_roles_raw
  group by process_id
),
owner_people_raw as (
  select distinct
    owner.process_id,
    people.id as person_id,
    people.name as person_name,
    prsn.is_primary
  from owner_roles_raw owner
  join public.person_roles prsn
    on prsn.role_id = owner.role_id
    and prsn.status = 'active'::public.record_status
    and (prsn.end_date is null or prsn.end_date >= current_date)
    and (
      prsn.company_id = owner.role_company_id
      or prsn.company_id is null
      or owner.role_company_id is null
    )
  join public.people people
    on people.id = prsn.person_id
    and people.status = 'active'::public.record_status
),
owner_people as (
  select
    process_id,
    array_agg(person_id order by is_primary desc, person_name, person_id) as current_person_ids,
    array_agg(person_name order by is_primary desc, person_name, person_id) as current_person_names
  from owner_people_raw
  group by process_id
),
support_roles_raw as (
  select distinct
    pr.process_id,
    pr.role_id,
    r.name as role_name,
    pr.responsibility_type::text as responsibility_type
  from public.process_roles pr
  join active_processes p on p.id = pr.process_id
  join active_stages ast on ast.id = pr.subprocess_id
  join public.roles r on r.id = pr.role_id
  where pr.responsibility_type in (
    'consulted'::public.responsibility_type,
    'executor'::public.responsibility_type,
    'backup'::public.responsibility_type,
    'user'::public.responsibility_type
  )
),
support_roles as (
  select
    process_id,
    array_agg(role_id order by role_name, responsibility_type, role_id) as support_role_ids,
    array_agg(role_name order by role_name, responsibility_type, role_id) as support_role_names,
    array_agg(responsibility_type order by role_name, responsibility_type, role_id) as support_role_types
  from support_roles_raw
  group by process_id
)
select
  p.id as process_id,
  p.name as process_name,
  p.description as definition,
  p.objective,
  p.expected_result,
  p.inputs_providers,
  p.outputs_clients,
  p.basic_kpi,
  p.process_type,
  p.criticality,
  p.status,
  p.documentation_status,
  p.is_replicable,
  p.is_global,
  p.company_id,
  owner_company.name as company_name,
  p.area_id,
  area.name as area_name,
  p.owner_company_id,
  owner_company.name as owner_company_name,
  p.operating_company_id,
  operating_company.name as operating_company_name,
  process_country.id as country_id,
  process_country.name as country_name,
  process_country.code as country_code,
  p.owner_site_id,
  owner_site.name as owner_site_name,
  p.operating_site_id,
  operating_site.name as operating_site_name,
  owner_company.company_type as owner_company_type,
  operating_company.company_type as operating_company_type,
  coalesce(stage_counts.active_stage_count, 0) as active_stage_count,
  coalesce(owner_roles.owner_role_ids, array[]::uuid[]) as owner_role_ids,
  coalesce(owner_roles.owner_role_names, array[]::text[]) as owner_role_names,
  coalesce(owner_people.current_person_ids, array[]::uuid[]) as current_person_ids,
  coalesce(owner_people.current_person_names, array[]::text[]) as current_person_names,
  coalesce(support_roles.support_role_ids, array[]::uuid[]) as support_role_ids,
  coalesce(support_roles.support_role_names, array[]::text[]) as support_role_names,
  coalesce(support_roles.support_role_types, array[]::text[]) as support_role_types
from active_processes p
left join public.companies owner_company
  on owner_company.id = coalesce(p.owner_company_id, p.company_id)
left join public.companies operating_company
  on operating_company.id = coalesce(p.operating_company_id, p.company_id)
left join public.countries process_country
  on process_country.id = coalesce(p.country_id, owner_company.country_id, operating_company.country_id)
left join public.sites owner_site on owner_site.id = p.owner_site_id
left join public.sites operating_site on operating_site.id = p.operating_site_id
left join public.areas area on area.id = p.area_id
left join stage_counts on stage_counts.process_id = p.id
left join owner_roles on owner_roles.process_id = p.id
left join owner_people on owner_people.process_id = p.id
left join support_roles on support_roles.process_id = p.id;

create or replace view public.v_process_subprocess_matrix_v2 as
select
  p.id as process_id,
  p.name as process_name,
  owner_company.name as owner_company_name,
  operating_company.name as operating_company_name,
  sp.id as subprocess_id,
  sp.name as subprocess_name,
  sp.description as subprocess_description,
  sp.sort_order,
  sp.criticality,
  sp.status as subprocess_status,
  owner_role.name as owner_role_name,
  owner_role_company.name as owner_role_company_name,
  owner_person.name as owner_person_name,
  user_role.name as user_role_name,
  user_role_company.name as user_role_company_name,
  user_person.name as user_person_name,
  support_role.name as support_role_name,
  support_role_company.name as support_role_company_name,
  support_person.name as support_person_name,
  coalesce(sp.impact_percent, owner_pr.impact_percent) as impact_percent,
  case
    when backup_role.name is not null then backup_role.name
    else 'No definido'
  end as backup_role_name,
  backup_role_company.name as backup_role_company_name,
  backup_person.name as backup_person_name,
  string_agg(distinct systems.name, ', ' order by systems.name) as systems,
  string_agg(distinct risks.name, ', ' order by risks.name) as risks,
  string_agg(distinct controls.name, ', ' order by controls.name) as controls
from public.subprocesses sp
join public.processes p
  on p.id = sp.process_id
  and p.status = 'active'::public.record_status
left join public.companies owner_company
  on owner_company.id = coalesce(p.owner_company_id, p.company_id)
left join public.companies operating_company
  on operating_company.id = coalesce(p.operating_company_id, p.company_id)
left join public.process_roles owner_pr
  on owner_pr.subprocess_id = sp.id
  and owner_pr.responsibility_type = 'owner'::public.responsibility_type
left join public.roles owner_role on owner_role.id = owner_pr.role_id
left join public.companies owner_role_company
  on owner_role_company.id = coalesce(owner_pr.role_company_id, p.operating_company_id, p.company_id)
left join public.person_roles owner_assignment
  on owner_assignment.role_id = owner_role.id
  and owner_assignment.status = 'active'::public.record_status
  and owner_assignment.is_primary = true
  and (owner_assignment.end_date is null or owner_assignment.end_date >= current_date)
  and (
    owner_assignment.company_id = coalesce(owner_pr.role_company_id, p.operating_company_id, p.company_id)
    or owner_assignment.company_id is null
  )
left join public.people owner_person
  on owner_person.id = owner_assignment.person_id
  and owner_person.status = 'active'::public.record_status
left join public.process_roles user_pr
  on user_pr.subprocess_id = sp.id
  and user_pr.responsibility_type = 'user'::public.responsibility_type
left join public.roles user_role on user_role.id = user_pr.role_id
left join public.companies user_role_company
  on user_role_company.id = coalesce(user_pr.role_company_id, p.operating_company_id, p.company_id)
left join public.person_roles user_assignment
  on user_assignment.role_id = user_role.id
  and user_assignment.status = 'active'::public.record_status
  and user_assignment.is_primary = true
  and (user_assignment.end_date is null or user_assignment.end_date >= current_date)
  and (
    user_assignment.company_id = coalesce(user_pr.role_company_id, p.operating_company_id, p.company_id)
    or user_assignment.company_id is null
  )
left join public.people user_person
  on user_person.id = user_assignment.person_id
  and user_person.status = 'active'::public.record_status
left join public.process_roles support_pr
  on support_pr.subprocess_id = sp.id
  and support_pr.responsibility_type in (
    'consulted'::public.responsibility_type,
    'executor'::public.responsibility_type
  )
left join public.roles support_role on support_role.id = support_pr.role_id
left join public.companies support_role_company
  on support_role_company.id = coalesce(support_pr.role_company_id, p.operating_company_id, p.company_id)
left join public.person_roles support_assignment
  on support_assignment.role_id = support_role.id
  and support_assignment.status = 'active'::public.record_status
  and support_assignment.is_primary = true
  and (support_assignment.end_date is null or support_assignment.end_date >= current_date)
  and (
    support_assignment.company_id = coalesce(support_pr.role_company_id, p.operating_company_id, p.company_id)
    or support_assignment.company_id is null
  )
left join public.people support_person
  on support_person.id = support_assignment.person_id
  and support_person.status = 'active'::public.record_status
left join public.process_roles backup_pr
  on backup_pr.subprocess_id = sp.id
  and backup_pr.responsibility_type = 'backup'::public.responsibility_type
left join public.roles backup_role on backup_role.id = backup_pr.role_id
left join public.companies backup_role_company
  on backup_role_company.id = coalesce(backup_pr.role_company_id, p.operating_company_id, p.company_id)
left join public.person_roles backup_assignment
  on backup_assignment.role_id = backup_role.id
  and backup_assignment.status = 'active'::public.record_status
  and backup_assignment.is_backup = true
  and (backup_assignment.end_date is null or backup_assignment.end_date >= current_date)
  and (
    backup_assignment.company_id = coalesce(backup_pr.role_company_id, p.operating_company_id, p.company_id)
    or backup_assignment.company_id is null
  )
left join public.people backup_person
  on backup_person.id = backup_assignment.person_id
  and backup_person.status = 'active'::public.record_status
left join public.process_systems process_systems on process_systems.subprocess_id = sp.id
left join public.systems systems on systems.id = process_systems.system_id
left join public.risks risks on risks.subprocess_id = sp.id
left join public.controls controls on controls.risk_id = risks.id
where sp.status = 'active'::public.record_status
group by
  p.id,
  p.name,
  owner_company.name,
  operating_company.name,
  sp.id,
  sp.name,
  sp.description,
  sp.sort_order,
  sp.criticality,
  sp.status,
  sp.impact_percent,
  owner_pr.impact_percent,
  owner_role.name,
  owner_role_company.name,
  owner_person.name,
  user_role.name,
  user_role_company.name,
  user_person.name,
  support_role.name,
  support_role_company.name,
  support_person.name,
  backup_role.name,
  backup_role_company.name,
  backup_person.name;
