create or replace view public.v_process_systems as
select
  p.id as process_id,
  p.name as process_name,
  sp.id as subprocess_id,
  sp.name as subprocess_name,
  s.id as system_id,
  s.name as system_name,
  s.status as system_status,
  owner_role.id as owner_role_id,
  owner_role.name as owner_role_name,
  pe.id as owner_person_id,
  pe.name as owner_person_name,
  ps.notes
from public.process_systems ps
join public.processes p on p.id = ps.process_id
left join public.subprocesses sp on sp.id = ps.subprocess_id
join public.systems s on s.id = ps.system_id
left join public.roles owner_role on owner_role.id = s.owner_role_id
left join public.person_roles per
  on per.role_id = owner_role.id
  and per.status = 'active'::public.record_status
  and per.is_primary = true
  and per.end_date is null
left join public.people pe on pe.id = per.person_id;
