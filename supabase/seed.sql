insert into public.countries (name, code)
values ('Chile', 'CL')
on conflict (code) do nothing;

with country as (
  select id from public.countries where code = 'CL'
),
company as (
  insert into public.companies (country_id, name, description)
  select id, 'McParking', 'Empresa base para el MVP de roles y procesos'
  from country
  where not exists (select 1 from public.companies where name = 'McParking')
  returning id
),
selected_company as (
  select id from company
  union all
  select id from public.companies where name = 'McParking'
  limit 1
),
area as (
  insert into public.areas (company_id, name, description)
  select id, 'Revenue', 'Area responsable de analisis comercial, ocupacion e ingresos'
  from selected_company
  on conflict (company_id, name) do nothing
  returning id
),
selected_area as (
  select id from area
  union all
  select areas.id
  from public.areas
  join selected_company on selected_company.id = areas.company_id
  where areas.name = 'Revenue'
  limit 1
),
process as (
  insert into public.processes (company_id, area_id, name, description, criticality, is_replicable, documentation_status)
  select selected_company.id, selected_area.id, 'Revenue Management', 'Proceso para gestionar ingresos, ocupacion, precios y comportamiento comercial', 'high'::public.criticality_level, true, 'draft'::public.documentation_status
  from selected_company, selected_area
  on conflict (company_id, name) do nothing
  returning id
),
selected_process as (
  select id from process
  union all
  select processes.id
  from public.processes
  join selected_company on selected_company.id = processes.company_id
  where processes.name = 'Revenue Management'
  limit 1
),
subprocess as (
  insert into public.subprocesses (process_id, name, description, frequency, criticality)
  select id, 'Dashboard de Revenue', 'Seguimiento de ingresos, ocupacion, descuentos, reservas y comportamiento comercial', 'Diaria', 'high'::public.criticality_level
  from selected_process
  on conflict (process_id, name) do nothing
  returning id
),
selected_subprocess as (
  select id from subprocess
  union all
  select subprocesses.id
  from public.subprocesses
  join selected_process on selected_process.id = subprocesses.process_id
  where subprocesses.name = 'Dashboard de Revenue'
  limit 1
),
revenue_role as (
  insert into public.roles (area_id, name, description, level, is_corporate, is_local)
  select id, 'Analista de Revenue', 'Rol dueno del analisis de revenue y sus reportes principales', 'tactical'::public.role_level, true, false
  from selected_area
  on conflict (area_id, name) do nothing
  returning id
),
selected_revenue_role as (
  select id from revenue_role
  union all
  select roles.id
  from public.roles
  join selected_area on selected_area.id = roles.area_id
  where roles.name = 'Analista de Revenue'
  limit 1
),
general_manager_role as (
  insert into public.roles (area_id, name, description, level, is_corporate, is_local)
  select id, 'Gerente General', 'Rol usuario principal y aprobador de informacion ejecutiva', 'executive'::public.role_level, true, false
  from selected_area
  on conflict (area_id, name) do nothing
  returning id
),
selected_general_manager_role as (
  select id from general_manager_role
  union all
  select roles.id
  from public.roles
  join selected_area on selected_area.id = roles.area_id
  where roles.name = 'Gerente General'
  limit 1
),
agustin as (
  insert into public.people (name, email)
  values ('Agustin', 'agustin@example.com')
  on conflict (email) do nothing
  returning id
),
selected_agustin as (
  select id from agustin
  union all
  select id from public.people where email = 'agustin@example.com'
  limit 1
),
german as (
  insert into public.people (name, email)
  values ('German', 'german@example.com')
  on conflict (email) do nothing
  returning id
),
selected_german as (
  select id from german
  union all
  select id from public.people where email = 'german@example.com'
  limit 1
)
insert into public.person_roles (person_id, role_id, company_id, is_primary, is_backup)
select selected_agustin.id, selected_revenue_role.id, selected_company.id, true, false
from selected_agustin, selected_revenue_role, selected_company
where not exists (
  select 1
  from public.person_roles
  where person_id = selected_agustin.id
    and role_id = selected_revenue_role.id
    and company_id = selected_company.id
    and site_id is null
    and end_date is null
)
union all
select selected_german.id, selected_general_manager_role.id, selected_company.id, true, false
from selected_german, selected_general_manager_role, selected_company
where not exists (
  select 1
  from public.person_roles
  where person_id = selected_german.id
    and role_id = selected_general_manager_role.id
    and company_id = selected_company.id
    and site_id is null
    and end_date is null
);

insert into public.process_roles (process_id, subprocess_id, role_id, responsibility_type, impact_percent, criticality, notes)
select p.id, sp.id, r.id, 'owner'::public.responsibility_type, 100, 'high'::public.criticality_level, 'Rol dueno del Dashboard de Revenue'
from public.processes p
join public.subprocesses sp on sp.process_id = p.id and sp.name = 'Dashboard de Revenue'
join public.roles r on r.name = 'Analista de Revenue'
where p.name = 'Revenue Management'
union all
select p.id, sp.id, r.id, 'user'::public.responsibility_type, 100, 'high'::public.criticality_level, 'Usuario principal de la informacion ejecutiva'
from public.processes p
join public.subprocesses sp on sp.process_id = p.id and sp.name = 'Dashboard de Revenue'
join public.roles r on r.name = 'Gerente General'
where p.name = 'Revenue Management'
on conflict (process_id, subprocess_id, role_id, responsibility_type) do nothing;

insert into public.systems (name, description)
values
  ('Power BI', 'Visualizacion de dashboards'),
  ('Supabase', 'Base de datos y backend del MVP'),
  ('Banco de Reservas', 'Sistema o repositorio operacional de reservas')
on conflict (name) do nothing;

insert into public.process_systems (process_id, subprocess_id, system_id, notes)
select p.id, sp.id, s.id, 'Sistema asociado al Dashboard de Revenue'
from public.processes p
join public.subprocesses sp on sp.process_id = p.id and sp.name = 'Dashboard de Revenue'
join public.systems s on s.name in ('Power BI', 'Supabase', 'Banco de Reservas')
where p.name = 'Revenue Management'
on conflict (process_id, subprocess_id, system_id) do nothing;
