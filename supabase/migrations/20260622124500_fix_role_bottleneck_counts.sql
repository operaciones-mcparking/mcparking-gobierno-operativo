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
  count(distinct pr.id) filter (
    where pr.responsibility_type = 'owner'::public.responsibility_type
  ) as owner_responsibility_count,
  count(distinct pr.id) filter (
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
