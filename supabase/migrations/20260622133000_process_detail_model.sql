alter table public.processes
  add column if not exists objective text,
  add column if not exists expected_result text;

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
  c.name as company_name,
  count(distinct sp.id) as subprocess_count,
  count(distinct pr.id) as responsibility_count,
  count(distinct ps.system_id) as system_count
from public.processes p
join public.companies c on c.id = p.company_id
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
  c.name;

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
  owner_pr.impact_percent,
  case
    when backup_role.name is not null then backup_role.name
    else 'No definido'
  end as backup_role_name,
  backup_person.name as backup_person_name,
  string_agg(distinct s.name, ', ' order by s.name) as systems,
  string_agg(distinct r.name, ' | ' order by r.name) as risks,
  string_agg(distinct co.name, ' | ' order by co.name) as controls
from public.subprocesses sp
join public.processes p on p.id = sp.process_id
left join public.process_roles owner_pr
  on owner_pr.process_id = p.id
  and owner_pr.subprocess_id = sp.id
  and owner_pr.responsibility_type = 'owner'::public.responsibility_type
left join public.roles owner_role on owner_role.id = owner_pr.role_id
left join public.person_roles owner_assignment
  on owner_assignment.role_id = owner_role.id
  and owner_assignment.status = 'active'::public.record_status
  and owner_assignment.is_primary = true
  and owner_assignment.end_date is null
left join public.people owner_person on owner_person.id = owner_assignment.person_id
left join public.process_roles user_pr
  on user_pr.process_id = p.id
  and user_pr.subprocess_id = sp.id
  and user_pr.responsibility_type = 'user'::public.responsibility_type
left join public.roles user_role on user_role.id = user_pr.role_id
left join public.person_roles user_assignment
  on user_assignment.role_id = user_role.id
  and user_assignment.status = 'active'::public.record_status
  and user_assignment.is_primary = true
  and user_assignment.end_date is null
left join public.people user_person on user_person.id = user_assignment.person_id
left join public.process_roles support_pr
  on support_pr.process_id = p.id
  and support_pr.subprocess_id = sp.id
  and support_pr.responsibility_type = 'consulted'::public.responsibility_type
left join public.roles support_role on support_role.id = support_pr.role_id
left join public.person_roles support_assignment
  on support_assignment.role_id = support_role.id
  and support_assignment.status = 'active'::public.record_status
  and support_assignment.is_primary = true
  and support_assignment.end_date is null
left join public.people support_person on support_person.id = support_assignment.person_id
left join public.process_roles backup_pr
  on backup_pr.process_id = p.id
  and backup_pr.subprocess_id = sp.id
  and backup_pr.responsibility_type = 'backup'::public.responsibility_type
left join public.roles backup_role on backup_role.id = backup_pr.role_id
left join public.person_roles backup_assignment
  on backup_assignment.role_id = backup_role.id
  and backup_assignment.status = 'active'::public.record_status
  and backup_assignment.is_backup = true
  and backup_assignment.end_date is null
left join public.people backup_person on backup_person.id = backup_assignment.person_id
left join public.process_systems ps
  on ps.process_id = p.id
  and ps.subprocess_id = sp.id
left join public.systems s on s.id = ps.system_id
left join public.risks r
  on r.process_id = p.id
  and r.subprocess_id = sp.id
left join public.controls co on co.risk_id = r.id
group by
  p.id,
  p.name,
  sp.id,
  sp.name,
  sp.description,
  sp.criticality,
  owner_role.name,
  owner_person.name,
  user_role.name,
  user_person.name,
  support_role.name,
  support_person.name,
  owner_pr.impact_percent,
  backup_role.name,
  backup_person.name;

create or replace view public.v_process_bottlenecks as
select
  p.id as process_id,
  p.name as process_name,
  'role_impact' as alert_type,
  r.name as subject_name,
  sum(coalesce(pr.impact_percent, 0)) as impact_percent,
  false as is_gap
from public.process_roles pr
join public.processes p on p.id = pr.process_id
join public.roles r on r.id = pr.role_id
where pr.responsibility_type in (
  'owner'::public.responsibility_type,
  'responsible'::public.responsibility_type,
  'executor'::public.responsibility_type,
  'backup'::public.responsibility_type
)
group by p.id, p.name, r.name
union all
select
  p.id as process_id,
  p.name as process_name,
  'person_impact' as alert_type,
  pe.name as subject_name,
  sum(coalesce(pr.impact_percent, 0)) as impact_percent,
  false as is_gap
from public.process_roles pr
join public.processes p on p.id = pr.process_id
join public.person_roles per
  on per.role_id = pr.role_id
  and per.status = 'active'::public.record_status
  and per.end_date is null
join public.people pe on pe.id = per.person_id
where pr.responsibility_type in (
  'owner'::public.responsibility_type,
  'responsible'::public.responsibility_type,
  'executor'::public.responsibility_type,
  'backup'::public.responsibility_type
)
group by p.id, p.name, pe.name
union all
select
  p.id as process_id,
  p.name as process_name,
  'role_without_person' as alert_type,
  r.name as subject_name,
  0 as impact_percent,
  true as is_gap
from public.process_roles pr
join public.processes p on p.id = pr.process_id
join public.roles r on r.id = pr.role_id
where not exists (
  select 1
  from public.person_roles per
  where per.role_id = r.id
    and per.status = 'active'::public.record_status
    and per.is_primary = true
    and per.end_date is null
)
union all
select
  p.id as process_id,
  p.name as process_name,
  'critical_subprocess_without_backup' as alert_type,
  sp.name as subject_name,
  0 as impact_percent,
  true as is_gap
from public.subprocesses sp
join public.processes p on p.id = sp.process_id
where sp.criticality in ('high'::public.criticality_level, 'critical'::public.criticality_level)
  and not exists (
    select 1
    from public.process_roles pr
    where pr.subprocess_id = sp.id
      and pr.responsibility_type = 'backup'::public.responsibility_type
  )
union all
select
  p.id as process_id,
  p.name as process_name,
  'critical_process_without_owner' as alert_type,
  p.name as subject_name,
  0 as impact_percent,
  true as is_gap
from public.processes p
where p.criticality in ('high'::public.criticality_level, 'critical'::public.criticality_level)
  and not exists (
    select 1
    from public.process_roles pr
    where pr.process_id = p.id
      and pr.responsibility_type = 'owner'::public.responsibility_type
  )
union all
select
  p.id as process_id,
  p.name as process_name,
  'person_many_critical_roles' as alert_type,
  pe.name as subject_name,
  count(distinct per.role_id)::numeric as impact_percent,
  count(distinct per.role_id) > 1 as is_gap
from public.people pe
join public.person_roles per
  on per.person_id = pe.id
  and per.status = 'active'::public.record_status
  and per.end_date is null
join public.process_roles pr on pr.role_id = per.role_id
join public.processes p on p.id = pr.process_id
where pr.criticality in ('high'::public.criticality_level, 'critical'::public.criticality_level)
group by p.id, p.name, pe.name;
