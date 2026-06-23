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
  count(distinct per.id) filter (where per.is_backup = true) as backup_assignment_count
from public.people pe
left join public.person_roles per
  on per.person_id = pe.id
  and per.status = 'active'::public.record_status
  and per.end_date is null
left join public.process_roles pr on pr.role_id = per.role_id
left join public.processes p on p.id = pr.process_id
left join public.process_systems ps on ps.process_id = p.id
group by pe.id, pe.name;
