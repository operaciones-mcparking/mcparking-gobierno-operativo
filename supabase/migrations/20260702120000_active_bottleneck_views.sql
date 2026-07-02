-- Active-only bottleneck views for /brechas.
-- These views intentionally keep the legacy bottleneck views unchanged.

create or replace view public.v_active_role_bottlenecks as
select
  r.id as role_id,
  r.name as role_name,
  r.level as role_level,
  r.status as role_status,
  r.is_corporate,
  r.is_local,
  count(distinct p.id) as process_count,
  count(distinct p.id) filter (
    where p.criticality in ('high'::public.criticality_level, 'critical'::public.criticality_level)
  ) as critical_process_count,
  count(distinct pr.id) filter (
    where pr.responsibility_type = 'owner'::public.responsibility_type
      and p.id is not null
  ) as owner_responsibility_count,
  count(distinct pr.id) filter (
    where pr.responsibility_type = 'approver'::public.responsibility_type
      and p.id is not null
  ) as approver_responsibility_count,
  count(distinct s.id) as system_count,
  not exists (
    select 1
    from public.person_roles backup_assignment
    join public.people backup_person
      on backup_person.id = backup_assignment.person_id
      and backup_person.status = 'active'::public.record_status
    where backup_assignment.role_id = r.id
      and backup_assignment.is_backup = true
      and backup_assignment.status = 'active'::public.record_status
      and backup_assignment.end_date is null
  ) as missing_backup_person
from public.roles r
left join public.process_roles pr
  on pr.role_id = r.id
left join public.processes p
  on p.id = pr.process_id
  and p.status = 'active'::public.record_status
left join public.process_systems ps
  on ps.process_id = p.id
left join public.systems s
  on s.id = ps.system_id
  and s.status = 'active'::public.record_status
where r.status = 'active'::public.record_status
group by r.id, r.name, r.level, r.status, r.is_corporate, r.is_local;

comment on view public.v_active_role_bottlenecks is
  'Active-only role bottleneck metrics for /brechas. Excludes archived roles and inactive processes.';

create or replace view public.v_active_person_bottlenecks as
select
  pe.id as person_id,
  pe.name as person_name,
  pe.status as person_status,
  count(distinct r.id) as role_count,
  count(distinct p.id) as process_count,
  count(distinct p.id) filter (
    where p.criticality in ('high'::public.criticality_level, 'critical'::public.criticality_level)
  ) as critical_process_count,
  count(distinct s.id) as system_count,
  count(distinct per.id) filter (
    where per.is_backup = true
      and r.id is not null
  ) as backup_assignment_count
from public.people pe
left join public.person_roles per
  on per.person_id = pe.id
  and per.status = 'active'::public.record_status
  and per.end_date is null
left join public.roles r
  on r.id = per.role_id
  and r.status = 'active'::public.record_status
left join public.process_roles pr
  on pr.role_id = r.id
left join public.processes p
  on p.id = pr.process_id
  and p.status = 'active'::public.record_status
left join public.process_systems ps
  on ps.process_id = p.id
left join public.systems s
  on s.id = ps.system_id
  and s.status = 'active'::public.record_status
where pe.status = 'active'::public.record_status
group by pe.id, pe.name, pe.status;

comment on view public.v_active_person_bottlenecks is
  'Active-only person bottleneck metrics for /brechas. Excludes archived people, archived roles and inactive processes.';
