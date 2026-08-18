begin;

do $$
begin
  if to_regclass('public.user_profiles') is null
    or to_regclass('public.people') is null
    or to_regclass('public.permissions') is null
    or to_regclass('public.access_roles') is null
    or to_regclass('public.access_role_permissions') is null
    or to_regclass('public.user_access_assignments') is null
    or to_regclass('public.role_governance_processes') is null then
    raise exception 'Required RBAC or structure tables are missing';
  end if;
end
$$;

insert into public.permissions (code, name, module, description, status)
values
  ('structure.view', 'Ver Estructura', 'structure', 'Puede consultar el modulo Estructura.', 'active'::public.record_status),
  ('structure.matrix.edit', 'Editar matriz de Estructura', 'structure', 'Puede agregar o quitar relaciones en la matriz por rol.', 'active'::public.record_status),
  ('structure.export.excel', 'Descargar Excel de Estructura', 'structure', 'Puede descargar el maestro Excel disponible desde Estructura.', 'active'::public.record_status),
  ('structure.export.pdf', 'Descargar PDF de Estructura', 'structure', 'Puede descargar fichas PDF desde Estructura.', 'active'::public.record_status)
on conflict (code) do update
set name = excluded.name,
    module = excluded.module,
    description = excluded.description,
    status = excluded.status;

insert into public.access_roles (role_code, name, description, status)
values (
  'STRUCTURE_EDITOR',
  'Editor de Estructura',
  'Acceso restringido al modulo Estructura con permisos granulares.',
  'active'::public.record_status
)
on conflict (role_code) do update
set name = excluded.name,
    description = excluded.description,
    status = excluded.status;

insert into public.access_role_permissions (access_role_id, permission_id, status)
select ar.id, p.id, 'active'::public.record_status
from public.access_roles ar
join public.permissions p on p.code in (
  'structure.view',
  'structure.matrix.edit',
  'structure.export.excel',
  'structure.export.pdf'
)
where ar.role_code = 'STRUCTURE_EDITOR'
on conflict (access_role_id, permission_id) do update
set status = excluded.status;

delete from public.access_role_permissions relation
using public.access_roles role, public.permissions permission
where relation.access_role_id = role.id
  and relation.permission_id = permission.id
  and role.role_code = 'STRUCTURE_EDITOR'
  and permission.code not in (
    'structure.view',
    'structure.matrix.edit',
    'structure.export.excel',
    'structure.export.pdf'
  );

create or replace function public.current_user_has_access_role(p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles up
    join public.user_access_assignments uaa on uaa.person_id = up.person_id
    join public.access_roles ar on ar.id = uaa.access_role_id
    where up.user_id = auth.uid()
      and up.status = 'active'::public.record_status
      and uaa.status = 'active'::public.record_status
      and uaa.start_date <= current_date
      and ar.status = 'active'::public.record_status
      and (uaa.end_date is null or uaa.end_date >= current_date)
      and ar.role_code = p_role_code
  );
$$;

create or replace function public.current_user_has_permission(p_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.user_profiles up
      join public.v_person_effective_permissions permission
        on permission.person_id = up.person_id
      where up.user_id = auth.uid()
        and up.status = 'active'::public.record_status
        and permission.permission_code = p_permission_code
    );
$$;

revoke all on function public.current_user_has_access_role(text) from public, anon;
revoke all on function public.current_user_has_permission(text) from public, anon;
grant execute on function public.current_user_has_access_role(text) to authenticated, service_role;
grant execute on function public.current_user_has_permission(text) to authenticated, service_role;

drop policy if exists "mvp_role_governance_processes_write" on public.role_governance_processes;
drop policy if exists "role_governance_processes_insert_authorized" on public.role_governance_processes;
drop policy if exists "role_governance_processes_update_authorized" on public.role_governance_processes;

revoke insert, update, delete on public.role_governance_processes from public, anon;
revoke delete on public.role_governance_processes from authenticated;
grant select, insert, update on public.role_governance_processes to authenticated;

create policy "role_governance_processes_insert_authorized"
on public.role_governance_processes
for insert
to authenticated
with check (public.current_user_has_permission('structure.matrix.edit'));

create policy "role_governance_processes_update_authorized"
on public.role_governance_processes
for update
to authenticated
using (public.current_user_has_permission('structure.matrix.edit'))
with check (public.current_user_has_permission('structure.matrix.edit'));

commit;