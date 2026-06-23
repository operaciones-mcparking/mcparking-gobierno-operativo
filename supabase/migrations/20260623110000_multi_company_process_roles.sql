alter table public.processes
add column if not exists owner_company_id uuid references public.companies(id) on delete set null,
add column if not exists operating_company_id uuid references public.companies(id) on delete set null;

alter table public.process_roles
add column if not exists role_company_id uuid references public.companies(id) on delete set null;

update public.processes
set owner_company_id = company_id
where owner_company_id is null;

update public.processes
set operating_company_id = company_id
where operating_company_id is null;

update public.process_roles pr
set role_company_id = p.operating_company_id
from public.processes p
where p.id = pr.process_id
  and pr.role_company_id is null;

create index if not exists idx_processes_owner_company_id
  on public.processes(owner_company_id);

create index if not exists idx_processes_operating_company_id
  on public.processes(operating_company_id);

create index if not exists idx_process_roles_role_company_id
  on public.process_roles(role_company_id);

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
  operating_company.name as operating_company_name
from public.processes p
left join public.companies owner_company
  on owner_company.id = coalesce(p.owner_company_id, p.company_id)
left join public.companies operating_company
  on operating_company.id = coalesce(p.operating_company_id, p.company_id)
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
  operating_company.name;

create or replace view public.v_process_subprocess_matrix as
select
  p.id as process_id,
  p.name as process_name,
  sp.id as subprocess_id,
  sp.name as subprocess_name,
  sp.description as subprocess_description,
  sp.criticality,
  owner_role.name as owner_role_name,
  owner_person.name as owner_person_name,
  user_role.name as user_role_name,
  user_person.name as user_person_name,
  support_role.name as support_role_name,
  support_person.name as support_person_name,
  coalesce(sp.impact_percent, owner_pr.impact_percent) as impact_percent,
  case
    when backup_role.name is not null then backup_role.name
    else 'No definido'
  end as backup_role_name,
  backup_person.name as backup_person_name,
  string_agg(distinct s.name, ', ' order by s.name) as systems,
  string_agg(distinct risk.name, ', ' order by risk.name) as risks,
  string_agg(distinct control.name, ', ' order by control.name) as controls,
  sp.sort_order,
  owner_company.name as owner_company_name,
  operating_company.name as operating_company_name,
  owner_role_company.name as owner_role_company_name,
  user_role_company.name as user_role_company_name,
  support_role_company.name as support_role_company_name,
  backup_role_company.name as backup_role_company_name
from public.subprocesses sp
join public.processes p on p.id = sp.process_id
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
  and owner_assignment.company_id = coalesce(owner_pr.role_company_id, p.operating_company_id, p.company_id)
  and owner_assignment.is_primary = true
  and owner_assignment.status = 'active'::public.record_status
left join public.people owner_person on owner_person.id = owner_assignment.person_id
left join public.process_roles user_pr
  on user_pr.subprocess_id = sp.id
  and user_pr.responsibility_type = 'user'::public.responsibility_type
left join public.roles user_role on user_role.id = user_pr.role_id
left join public.companies user_role_company
  on user_role_company.id = coalesce(user_pr.role_company_id, p.operating_company_id, p.company_id)
left join public.person_roles user_assignment
  on user_assignment.role_id = user_role.id
  and user_assignment.company_id = coalesce(user_pr.role_company_id, p.operating_company_id, p.company_id)
  and user_assignment.is_primary = true
  and user_assignment.status = 'active'::public.record_status
left join public.people user_person on user_person.id = user_assignment.person_id
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
  and support_assignment.company_id = coalesce(support_pr.role_company_id, p.operating_company_id, p.company_id)
  and support_assignment.is_primary = true
  and support_assignment.status = 'active'::public.record_status
left join public.people support_person on support_person.id = support_assignment.person_id
left join public.process_roles backup_pr
  on backup_pr.subprocess_id = sp.id
  and backup_pr.responsibility_type = 'backup'::public.responsibility_type
left join public.roles backup_role on backup_role.id = backup_pr.role_id
left join public.companies backup_role_company
  on backup_role_company.id = coalesce(backup_pr.role_company_id, p.operating_company_id, p.company_id)
left join public.person_roles backup_assignment
  on backup_assignment.role_id = backup_role.id
  and backup_assignment.company_id = coalesce(backup_pr.role_company_id, p.operating_company_id, p.company_id)
  and backup_assignment.is_backup = true
  and backup_assignment.status = 'active'::public.record_status
left join public.people backup_person on backup_person.id = backup_assignment.person_id
left join public.process_systems ps on ps.subprocess_id = sp.id
left join public.systems s on s.id = ps.system_id
left join public.risks risk on risk.subprocess_id = sp.id
left join public.controls control on control.risk_id = risk.id
group by
  p.id,
  p.name,
  owner_company.name,
  operating_company.name,
  sp.id,
  sp.name,
  sp.description,
  sp.criticality,
  sp.impact_percent,
  sp.sort_order,
  owner_role.name,
  owner_role_company.name,
  owner_person.name,
  user_role.name,
  user_role_company.name,
  user_person.name,
  support_role.name,
  support_role_company.name,
  support_person.name,
  owner_pr.impact_percent,
  backup_role.name,
  backup_role_company.name,
  backup_person.name;
