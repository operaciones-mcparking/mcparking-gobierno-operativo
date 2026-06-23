alter table public.subprocesses
add column if not exists impact_percent numeric(5,2)
check (impact_percent is null or (impact_percent >= 0 and impact_percent <= 100));

update public.subprocesses sp
set impact_percent = owner_pr.impact_percent
from public.process_roles owner_pr
where owner_pr.subprocess_id = sp.id
  and owner_pr.responsibility_type = 'owner'::public.responsibility_type
  and sp.impact_percent is null;

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
  sp.sort_order
from public.subprocesses sp
join public.processes p on p.id = sp.process_id
left join public.process_roles owner_pr
  on owner_pr.subprocess_id = sp.id
  and owner_pr.responsibility_type = 'owner'::public.responsibility_type
left join public.roles owner_role on owner_role.id = owner_pr.role_id
left join public.person_roles owner_assignment
  on owner_assignment.role_id = owner_role.id
  and owner_assignment.is_primary = true
  and owner_assignment.status = 'active'::public.record_status
left join public.people owner_person on owner_person.id = owner_assignment.person_id
left join public.process_roles user_pr
  on user_pr.subprocess_id = sp.id
  and user_pr.responsibility_type = 'user'::public.responsibility_type
left join public.roles user_role on user_role.id = user_pr.role_id
left join public.person_roles user_assignment
  on user_assignment.role_id = user_role.id
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
left join public.person_roles support_assignment
  on support_assignment.role_id = support_role.id
  and support_assignment.is_primary = true
  and support_assignment.status = 'active'::public.record_status
left join public.people support_person on support_person.id = support_assignment.person_id
left join public.process_roles backup_pr
  on backup_pr.subprocess_id = sp.id
  and backup_pr.responsibility_type = 'backup'::public.responsibility_type
left join public.roles backup_role on backup_role.id = backup_pr.role_id
left join public.person_roles backup_assignment
  on backup_assignment.role_id = backup_role.id
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
  sp.id,
  sp.name,
  sp.description,
  sp.criticality,
  sp.impact_percent,
  sp.sort_order,
  owner_role.name,
  owner_person.name,
  user_role.name,
  user_person.name,
  support_role.name,
  support_person.name,
  owner_pr.impact_percent,
  backup_role.name,
  backup_person.name;
