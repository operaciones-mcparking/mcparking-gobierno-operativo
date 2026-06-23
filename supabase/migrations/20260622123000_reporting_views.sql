create or replace view public.v_process_responsibilities as
select
  p.id as process_id,
  p.name as process_name,
  sp.id as subprocess_id,
  sp.name as subprocess_name,
  p.criticality as process_criticality,
  p.documentation_status,
  pr.responsibility_type,
  r.id as role_id,
  r.name as role_name,
  r.level as role_level,
  r.is_corporate,
  r.is_local,
  pe.id as current_person_id,
  pe.name as current_person_name,
  pr.impact_percent,
  pr.criticality as responsibility_criticality,
  pr.is_required,
  pr.notes
from public.process_roles pr
join public.processes p on p.id = pr.process_id
left join public.subprocesses sp on sp.id = pr.subprocess_id
join public.roles r on r.id = pr.role_id
left join public.person_roles per
  on per.role_id = r.id
  and per.status = 'active'::public.record_status
  and per.is_primary = true
  and per.end_date is null
left join public.people pe on pe.id = per.person_id;

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

create or replace view public.v_process_gaps as
select
  p.id as process_id,
  p.name as process_name,
  p.criticality,
  p.documentation_status,
  not exists (
    select 1
    from public.process_roles pr
    where pr.process_id = p.id
      and pr.responsibility_type = 'owner'::public.responsibility_type
      and pr.is_required = true
  ) as missing_owner_role,
  not exists (
    select 1
    from public.process_roles pr
    join public.person_roles per
      on per.role_id = pr.role_id
      and per.status = 'active'::public.record_status
      and per.is_primary = true
      and per.end_date is null
    where pr.process_id = p.id
      and pr.responsibility_type = 'owner'::public.responsibility_type
  ) as missing_owner_person,
  not exists (
    select 1
    from public.process_roles pr
    where pr.process_id = p.id
      and pr.responsibility_type = 'backup'::public.responsibility_type
  ) as missing_backup_role,
  p.documentation_status in (
    'not_started'::public.documentation_status,
    'needs_update'::public.documentation_status
  ) as documentation_gap
from public.processes p;

create or replace view public.v_role_bottlenecks as
select
  r.id as role_id,
  r.name as role_name,
  r.level as role_level,
  r.is_corporate,
  r.is_local,
  count(distinct pr.process_id) as process_count,
  count(distinct pr.process_id) filter (
    where p.criticality in ('high'::public.criticality_level, 'critical'::public.criticality_level)
  ) as critical_process_count,
  count(*) filter (
    where pr.responsibility_type = 'owner'::public.responsibility_type
  ) as owner_responsibility_count,
  count(*) filter (
    where pr.responsibility_type = 'approver'::public.responsibility_type
  ) as approver_responsibility_count,
  count(distinct ps.system_id) as system_count,
  not exists (
    select 1
    from public.person_roles backup_assignment
    where backup_assignment.role_id = r.id
      and backup_assignment.is_backup = true
      and backup_assignment.status = 'active'::public.record_status
      and backup_assignment.end_date is null
  ) as missing_backup_person
from public.roles r
left join public.process_roles pr on pr.role_id = r.id
left join public.processes p on p.id = pr.process_id
left join public.process_systems ps on ps.process_id = p.id
group by r.id, r.name, r.level, r.is_corporate, r.is_local;

create or replace view public.v_person_bottlenecks as
select
  pe.id as person_id,
  pe.name as person_name,
  count(distinct per.role_id) as role_count,
  count(distinct pr.process_id) as process_count,
  count(distinct pr.process_id) filter (
    where p.criticality in ('high'::public.criticality_level, 'critical'::public.criticality_level)
  ) as critical_process_count,
  count(distinct ps.system_id) as system_count,
  count(*) filter (where per.is_backup = true) as backup_assignment_count
from public.people pe
left join public.person_roles per
  on per.person_id = pe.id
  and per.status = 'active'::public.record_status
  and per.end_date is null
left join public.process_roles pr on pr.role_id = per.role_id
left join public.processes p on p.id = pr.process_id
left join public.process_systems ps on ps.process_id = p.id
group by pe.id, pe.name;
