-- Fix /procesos V2 stage matrix so each active subprocess appears exactly once.
-- All 1:N relationships are aggregated by subprocess_id before joining the base stage row.

create or replace view public.v_process_subprocess_matrix_v2 as
with active_stage_base as (
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
    sp.impact_percent as subprocess_impact_percent,
    coalesce(p.operating_company_id, p.company_id) as default_role_company_id
  from public.subprocesses sp
  join public.processes p
    on p.id = sp.process_id
    and p.status = 'active'::public.record_status
  left join public.companies owner_company
    on owner_company.id = coalesce(p.owner_company_id, p.company_id)
  left join public.companies operating_company
    on operating_company.id = coalesce(p.operating_company_id, p.company_id)
  where sp.status = 'active'::public.record_status
),
stage_owner as (
  select
    pr.subprocess_id,
    string_agg(distinct role_owner.name, ', ' order by role_owner.name) as owner_role_name,
    string_agg(distinct owner_role_company.name, ', ' order by owner_role_company.name) as owner_role_company_name,
    string_agg(distinct owner_person.name, ', ' order by owner_person.name) as owner_person_name,
    max(pr.impact_percent)::numeric(5,2) as owner_impact_percent
  from public.process_roles pr
  join active_stage_base base on base.subprocess_id = pr.subprocess_id
  join public.roles role_owner on role_owner.id = pr.role_id
  left join public.companies owner_role_company
    on owner_role_company.id = coalesce(pr.role_company_id, base.default_role_company_id)
  left join public.person_roles owner_assignment
    on owner_assignment.role_id = role_owner.id
    and owner_assignment.status = 'active'::public.record_status
    and owner_assignment.is_primary = true
    and (owner_assignment.end_date is null or owner_assignment.end_date >= current_date)
    and (
      owner_assignment.company_id = coalesce(pr.role_company_id, base.default_role_company_id)
      or owner_assignment.company_id is null
    )
  left join public.people owner_person
    on owner_person.id = owner_assignment.person_id
    and owner_person.status = 'active'::public.record_status
  where pr.responsibility_type = 'owner'::public.responsibility_type
  group by pr.subprocess_id
),
stage_user as (
  select
    pr.subprocess_id,
    string_agg(distinct role_user.name, ', ' order by role_user.name) as user_role_name,
    string_agg(distinct user_role_company.name, ', ' order by user_role_company.name) as user_role_company_name,
    string_agg(distinct user_person.name, ', ' order by user_person.name) as user_person_name
  from public.process_roles pr
  join active_stage_base base on base.subprocess_id = pr.subprocess_id
  join public.roles role_user on role_user.id = pr.role_id
  left join public.companies user_role_company
    on user_role_company.id = coalesce(pr.role_company_id, base.default_role_company_id)
  left join public.person_roles user_assignment
    on user_assignment.role_id = role_user.id
    and user_assignment.status = 'active'::public.record_status
    and user_assignment.is_primary = true
    and (user_assignment.end_date is null or user_assignment.end_date >= current_date)
    and (
      user_assignment.company_id = coalesce(pr.role_company_id, base.default_role_company_id)
      or user_assignment.company_id is null
    )
  left join public.people user_person
    on user_person.id = user_assignment.person_id
    and user_person.status = 'active'::public.record_status
  where pr.responsibility_type = 'user'::public.responsibility_type
  group by pr.subprocess_id
),
stage_support as (
  select
    pr.subprocess_id,
    string_agg(distinct role_support.name, ', ' order by role_support.name) as support_role_name,
    string_agg(distinct support_role_company.name, ', ' order by support_role_company.name) as support_role_company_name,
    string_agg(distinct support_person.name, ', ' order by support_person.name) as support_person_name
  from public.process_roles pr
  join active_stage_base base on base.subprocess_id = pr.subprocess_id
  join public.roles role_support on role_support.id = pr.role_id
  left join public.companies support_role_company
    on support_role_company.id = coalesce(pr.role_company_id, base.default_role_company_id)
  left join public.person_roles support_assignment
    on support_assignment.role_id = role_support.id
    and support_assignment.status = 'active'::public.record_status
    and support_assignment.is_primary = true
    and (support_assignment.end_date is null or support_assignment.end_date >= current_date)
    and (
      support_assignment.company_id = coalesce(pr.role_company_id, base.default_role_company_id)
      or support_assignment.company_id is null
    )
  left join public.people support_person
    on support_person.id = support_assignment.person_id
    and support_person.status = 'active'::public.record_status
  where pr.responsibility_type in (
    'consulted'::public.responsibility_type,
    'executor'::public.responsibility_type
  )
  group by pr.subprocess_id
),
stage_backup as (
  select
    pr.subprocess_id,
    string_agg(distinct role_backup.name, ', ' order by role_backup.name) as backup_role_name,
    string_agg(distinct backup_role_company.name, ', ' order by backup_role_company.name) as backup_role_company_name,
    string_agg(distinct backup_person.name, ', ' order by backup_person.name) as backup_person_name
  from public.process_roles pr
  join active_stage_base base on base.subprocess_id = pr.subprocess_id
  join public.roles role_backup on role_backup.id = pr.role_id
  left join public.companies backup_role_company
    on backup_role_company.id = coalesce(pr.role_company_id, base.default_role_company_id)
  left join public.person_roles backup_assignment
    on backup_assignment.role_id = role_backup.id
    and backup_assignment.status = 'active'::public.record_status
    and backup_assignment.is_backup = true
    and (backup_assignment.end_date is null or backup_assignment.end_date >= current_date)
    and (
      backup_assignment.company_id = coalesce(pr.role_company_id, base.default_role_company_id)
      or backup_assignment.company_id is null
    )
  left join public.people backup_person
    on backup_person.id = backup_assignment.person_id
    and backup_person.status = 'active'::public.record_status
  where pr.responsibility_type = 'backup'::public.responsibility_type
  group by pr.subprocess_id
),
stage_systems as (
  select
    ps.subprocess_id,
    string_agg(distinct systems.name, ', ' order by systems.name) as systems
  from public.process_systems ps
  join active_stage_base base on base.subprocess_id = ps.subprocess_id
  join public.systems systems on systems.id = ps.system_id
  group by ps.subprocess_id
),
stage_risks_controls as (
  select
    risks.subprocess_id,
    string_agg(distinct risks.name, ', ' order by risks.name) as risks,
    string_agg(distinct controls.name, ', ' order by controls.name) as controls
  from public.risks risks
  join active_stage_base base on base.subprocess_id = risks.subprocess_id
  left join public.controls controls on controls.risk_id = risks.id
  group by risks.subprocess_id
)
select
  base.process_id,
  base.process_name,
  base.owner_company_name,
  base.operating_company_name,
  base.subprocess_id,
  base.subprocess_name,
  base.subprocess_description,
  base.sort_order,
  base.criticality,
  base.subprocess_status,
  stage_owner.owner_role_name,
  stage_owner.owner_role_company_name,
  stage_owner.owner_person_name,
  stage_user.user_role_name,
  stage_user.user_role_company_name,
  stage_user.user_person_name,
  stage_support.support_role_name,
  stage_support.support_role_company_name,
  stage_support.support_person_name,
  coalesce(base.subprocess_impact_percent, stage_owner.owner_impact_percent)::numeric(5,2) as impact_percent,
  coalesce(stage_backup.backup_role_name, 'No definido') as backup_role_name,
  stage_backup.backup_role_company_name,
  stage_backup.backup_person_name,
  stage_systems.systems,
  stage_risks_controls.risks,
  stage_risks_controls.controls
from active_stage_base base
left join stage_owner on stage_owner.subprocess_id = base.subprocess_id
left join stage_user on stage_user.subprocess_id = base.subprocess_id
left join stage_support on stage_support.subprocess_id = base.subprocess_id
left join stage_backup on stage_backup.subprocess_id = base.subprocess_id
left join stage_systems on stage_systems.subprocess_id = base.subprocess_id
left join stage_risks_controls on stage_risks_controls.subprocess_id = base.subprocess_id;