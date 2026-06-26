do $$
begin
  create type public.access_scope_type as enum (
    'global',
    'country',
    'company',
    'site'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.permission_override_effect as enum (
    'allow',
    'deny'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  module text not null,
  description text,
  status public.record_status not null default 'active'::public.record_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_roles (
  id uuid primary key default gen_random_uuid(),
  role_code text not null unique,
  name text not null unique,
  description text,
  status public.record_status not null default 'active'::public.record_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_role_permissions (
  id uuid primary key default gen_random_uuid(),
  access_role_id uuid not null references public.access_roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  status public.record_status not null default 'active'::public.record_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_role_permissions_unique unique (access_role_id, permission_id)
);

create table if not exists public.user_access_assignments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  access_role_id uuid not null references public.access_roles(id) on delete cascade,
  scope_type public.access_scope_type not null,
  country_id uuid references public.countries(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  status public.record_status not null default 'active'::public.record_status,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_access_assignments_scope_check check (
    (scope_type = 'global'::public.access_scope_type and country_id is null and company_id is null and site_id is null)
    or (scope_type = 'country'::public.access_scope_type and country_id is not null and company_id is null and site_id is null)
    or (scope_type = 'company'::public.access_scope_type and country_id is not null and company_id is not null and site_id is null)
    or (scope_type = 'site'::public.access_scope_type and country_id is not null and company_id is not null and site_id is not null)
  ),
  constraint user_access_assignments_dates_check check (end_date is null or end_date >= start_date)
);

create table if not exists public.permission_overrides (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  effect public.permission_override_effect not null,
  scope_type public.access_scope_type not null,
  country_id uuid references public.countries(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  reason text,
  status public.record_status not null default 'active'::public.record_status,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permission_overrides_scope_check check (
    (scope_type = 'global'::public.access_scope_type and country_id is null and company_id is null and site_id is null)
    or (scope_type = 'country'::public.access_scope_type and country_id is not null and company_id is null and site_id is null)
    or (scope_type = 'company'::public.access_scope_type and country_id is not null and company_id is not null and site_id is null)
    or (scope_type = 'site'::public.access_scope_type and country_id is not null and company_id is not null and site_id is not null)
  ),
  constraint permission_overrides_dates_check check (end_date is null or end_date >= start_date)
);

create unique index if not exists user_access_assignments_active_unique
  on public.user_access_assignments (
    person_id,
    access_role_id,
    scope_type,
    coalesce(country_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'active'::public.record_status;

create unique index if not exists permission_overrides_active_unique
  on public.permission_overrides (
    person_id,
    permission_id,
    effect,
    scope_type,
    coalesce(country_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'active'::public.record_status;

create index if not exists permissions_module_idx on public.permissions(module);
create index if not exists access_role_permissions_role_idx on public.access_role_permissions(access_role_id);
create index if not exists access_role_permissions_permission_idx on public.access_role_permissions(permission_id);
create index if not exists user_access_assignments_person_idx on public.user_access_assignments(person_id);
create index if not exists user_access_assignments_scope_idx on public.user_access_assignments(scope_type, country_id, company_id, site_id);
create index if not exists permission_overrides_person_idx on public.permission_overrides(person_id);

create or replace view public.organizational_roles as
select *
from public.roles;

comment on view public.organizational_roles is
  'Alias semantico de public.roles. Representa cargos o funciones organizacionales, no permisos de sistema.';
comment on table public.access_roles is
  'Roles de acceso de plataforma. Se asignan a personas con alcance global, pais, empresa o sede.';
comment on table public.user_access_assignments is
  'Asignaciones RBAC: persona + rol de acceso + alcance operativo.';
comment on table public.permission_overrides is
  'Excepciones puntuales de permisos. No debe ser el mecanismo principal de acceso.';

drop trigger if exists set_permissions_updated_at on public.permissions;
create trigger set_permissions_updated_at
before update on public.permissions
for each row execute function public.set_updated_at();

drop trigger if exists set_access_roles_updated_at on public.access_roles;
create trigger set_access_roles_updated_at
before update on public.access_roles
for each row execute function public.set_updated_at();

drop trigger if exists set_access_role_permissions_updated_at on public.access_role_permissions;
create trigger set_access_role_permissions_updated_at
before update on public.access_role_permissions
for each row execute function public.set_updated_at();

drop trigger if exists set_user_access_assignments_updated_at on public.user_access_assignments;
create trigger set_user_access_assignments_updated_at
before update on public.user_access_assignments
for each row execute function public.set_updated_at();

drop trigger if exists set_permission_overrides_updated_at on public.permission_overrides;
create trigger set_permission_overrides_updated_at
before update on public.permission_overrides
for each row execute function public.set_updated_at();

alter table public.permissions enable row level security;
alter table public.access_roles enable row level security;
alter table public.access_role_permissions enable row level security;
alter table public.user_access_assignments enable row level security;
alter table public.permission_overrides enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'permissions' and policyname = 'permissions_read_authenticated'
  ) then
    create policy "permissions_read_authenticated"
      on public.permissions for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'access_roles' and policyname = 'access_roles_read_authenticated'
  ) then
    create policy "access_roles_read_authenticated"
      on public.access_roles for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'access_role_permissions' and policyname = 'access_role_permissions_read_authenticated'
  ) then
    create policy "access_role_permissions_read_authenticated"
      on public.access_role_permissions for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_access_assignments' and policyname = 'user_access_assignments_read_authenticated'
  ) then
    create policy "user_access_assignments_read_authenticated"
      on public.user_access_assignments for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'permission_overrides' and policyname = 'permission_overrides_read_authenticated'
  ) then
    create policy "permission_overrides_read_authenticated"
      on public.permission_overrides for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'permissions' and policyname = 'permissions_admin_all'
  ) then
    create policy "permissions_admin_all"
      on public.permissions for all to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'access_roles' and policyname = 'access_roles_admin_all'
  ) then
    create policy "access_roles_admin_all"
      on public.access_roles for all to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'access_role_permissions' and policyname = 'access_role_permissions_admin_all'
  ) then
    create policy "access_role_permissions_admin_all"
      on public.access_role_permissions for all to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_access_assignments' and policyname = 'user_access_assignments_admin_all'
  ) then
    create policy "user_access_assignments_admin_all"
      on public.user_access_assignments for all to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'permission_overrides' and policyname = 'permission_overrides_admin_all'
  ) then
    create policy "permission_overrides_admin_all"
      on public.permission_overrides for all to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;
end $$;

insert into public.permissions (code, name, module, description, status)
values
  ('processes.view', 'Ver procesos', 'processes', 'Puede revisar procesos, etapas y matrices.', 'active'::public.record_status),
  ('processes.create', 'Crear procesos', 'processes', 'Puede crear procesos oficiales.', 'active'::public.record_status),
  ('processes.update', 'Editar procesos', 'processes', 'Puede editar procesos, etapas y relaciones.', 'active'::public.record_status),
  ('processes.delete', 'Eliminar procesos', 'processes', 'Puede eliminar procesos durante desarrollo o depuracion.', 'active'::public.record_status),
  ('roles.view', 'Ver roles funcionales', 'roles', 'Puede revisar cargos funcionales y organigrama.', 'active'::public.record_status),
  ('roles.manage', 'Gestionar roles funcionales', 'roles', 'Puede crear, editar, archivar o eliminar cargos funcionales.', 'active'::public.record_status),
  ('people.view', 'Ver personas', 'people', 'Puede revisar personas y asignaciones actuales.', 'active'::public.record_status),
  ('people.manage', 'Gestionar personas', 'people', 'Puede crear, editar y archivar personas.', 'active'::public.record_status),
  ('tickets.view', 'Ver tickets', 'tickets', 'Puede revisar solicitudes o casos operativos.', 'active'::public.record_status),
  ('tickets.create', 'Crear tickets', 'tickets', 'Puede crear solicitudes o casos operativos.', 'active'::public.record_status),
  ('tickets.update', 'Actualizar tickets', 'tickets', 'Puede actualizar solicitudes o casos operativos.', 'active'::public.record_status),
  ('tickets.close', 'Cerrar tickets', 'tickets', 'Puede cerrar solicitudes o casos operativos.', 'active'::public.record_status),
  ('finance.view', 'Ver finanzas', 'finance', 'Puede revisar informacion financiera.', 'active'::public.record_status),
  ('finance.manage', 'Gestionar finanzas', 'finance', 'Puede administrar informacion financiera.', 'active'::public.record_status),
  ('revenue.view', 'Ver revenue', 'revenue', 'Puede revisar informacion de revenue.', 'active'::public.record_status),
  ('revenue.manage', 'Gestionar revenue', 'revenue', 'Puede administrar informacion de revenue.', 'active'::public.record_status),
  ('systems.view', 'Ver sistemas', 'systems', 'Puede revisar sistemas asociados.', 'active'::public.record_status),
  ('systems.manage', 'Gestionar sistemas', 'systems', 'Puede crear y editar sistemas asociados.', 'active'::public.record_status),
  ('settings.manage', 'Gestionar configuracion', 'settings', 'Puede administrar accesos, permisos y configuracion general.', 'active'::public.record_status)
on conflict (code) do update
  set name = excluded.name,
      module = excluded.module,
      description = excluded.description,
      status = excluded.status;

insert into public.access_roles (role_code, name, description, status)
values
  ('ADMIN_GLOBAL', 'Administrador Global', 'Administra toda la plataforma y todos los alcances.', 'active'::public.record_status),
  ('ADMIN_COUNTRY', 'Administrador Pais', 'Administra un pais y sus empresas o sedes asociadas.', 'active'::public.record_status),
  ('ADMIN_COMPANY', 'Administrador Empresa', 'Administra una empresa o filial dentro de un pais.', 'active'::public.record_status),
  ('ADMIN_SITE', 'Administrador Sede', 'Administra una sede especifica.', 'active'::public.record_status),
  ('USER_OPERATIONS', 'Usuario Operaciones', 'Opera procesos y tickets operativos dentro de su alcance.', 'active'::public.record_status),
  ('USER_FINANCE', 'Usuario Finanzas', 'Gestiona informacion financiera dentro de su alcance.', 'active'::public.record_status),
  ('USER_REVENUE', 'Usuario Revenue', 'Gestiona informacion de revenue dentro de su alcance.', 'active'::public.record_status),
  ('USER_CUSTOMER_SERVICE', 'Usuario Atencion Cliente', 'Gestiona solicitudes de atencion dentro de su alcance.', 'active'::public.record_status),
  ('USER_TECHNOLOGY', 'Usuario Tecnologia', 'Gestiona sistemas y soporte tecnico dentro de su alcance.', 'active'::public.record_status),
  ('READ_ONLY', 'Solo Lectura', 'Puede revisar informacion sin modificar datos.', 'active'::public.record_status)
on conflict (role_code) do update
  set name = excluded.name,
      description = excluded.description,
      status = excluded.status;

with role_permission_seed(access_role_code, permission_code) as (
  select admin_role, permission_code
  from unnest(array['ADMIN_GLOBAL', 'ADMIN_COUNTRY', 'ADMIN_COMPANY', 'ADMIN_SITE']) as admin_role
  cross join (select code as permission_code from public.permissions) p
  union all
  values
    ('USER_OPERATIONS', 'processes.view'),
    ('USER_OPERATIONS', 'processes.update'),
    ('USER_OPERATIONS', 'roles.view'),
    ('USER_OPERATIONS', 'people.view'),
    ('USER_OPERATIONS', 'tickets.view'),
    ('USER_OPERATIONS', 'tickets.create'),
    ('USER_OPERATIONS', 'tickets.update'),
    ('USER_OPERATIONS', 'tickets.close'),
    ('USER_OPERATIONS', 'systems.view'),
    ('USER_FINANCE', 'processes.view'),
    ('USER_FINANCE', 'people.view'),
    ('USER_FINANCE', 'finance.view'),
    ('USER_FINANCE', 'finance.manage'),
    ('USER_FINANCE', 'tickets.view'),
    ('USER_FINANCE', 'tickets.create'),
    ('USER_FINANCE', 'tickets.update'),
    ('USER_FINANCE', 'tickets.close'),
    ('USER_REVENUE', 'processes.view'),
    ('USER_REVENUE', 'systems.view'),
    ('USER_REVENUE', 'revenue.view'),
    ('USER_REVENUE', 'revenue.manage'),
    ('USER_CUSTOMER_SERVICE', 'processes.view'),
    ('USER_CUSTOMER_SERVICE', 'people.view'),
    ('USER_CUSTOMER_SERVICE', 'tickets.view'),
    ('USER_CUSTOMER_SERVICE', 'tickets.create'),
    ('USER_CUSTOMER_SERVICE', 'tickets.update'),
    ('USER_CUSTOMER_SERVICE', 'tickets.close'),
    ('USER_TECHNOLOGY', 'processes.view'),
    ('USER_TECHNOLOGY', 'systems.view'),
    ('USER_TECHNOLOGY', 'systems.manage'),
    ('USER_TECHNOLOGY', 'tickets.view'),
    ('USER_TECHNOLOGY', 'tickets.update'),
    ('USER_TECHNOLOGY', 'tickets.close'),
    ('READ_ONLY', 'processes.view'),
    ('READ_ONLY', 'roles.view'),
    ('READ_ONLY', 'people.view'),
    ('READ_ONLY', 'tickets.view'),
    ('READ_ONLY', 'finance.view'),
    ('READ_ONLY', 'revenue.view'),
    ('READ_ONLY', 'systems.view')
)
insert into public.access_role_permissions (access_role_id, permission_id, status)
select ar.id, p.id, 'active'::public.record_status
from role_permission_seed seed
join public.access_roles ar on ar.role_code = seed.access_role_code
join public.permissions p on p.code = seed.permission_code
on conflict (access_role_id, permission_id) do update
  set status = 'active'::public.record_status;

do $$
declare
  german_person_id uuid;
  agustin_person_id uuid;
  operations_person_id uuid;
  chile_country_id uuid;
  mcparking_company_id uuid;
  santiago_site_id uuid;
  admin_global_role_id uuid;
  revenue_role_id uuid;
  operations_role_id uuid;
begin
  select p.id into german_person_id
  from public.people p
  where lower(p.name) in ('german bravo', 'german')
  order by case when lower(p.name) = 'german bravo' then 0 else 1 end
  limit 1;

  select p.id into agustin_person_id
  from public.people p
  where lower(p.name) = 'agustin'
  limit 1;

  select p.id into operations_person_id
  from public.people p
  where lower(p.name) in ('equipo operativo', 'diego vera')
  order by case when lower(p.name) = 'equipo operativo' then 0 else 1 end
  limit 1;

  select c.id into chile_country_id
  from public.countries c
  where lower(c.name) = 'chile'
  limit 1;

  select c.id into mcparking_company_id
  from public.companies c
  where lower(c.name) = 'mcparking'
  limit 1;

  select s.id into santiago_site_id
  from public.sites s
  where s.company_id = mcparking_company_id
    and (lower(coalesce(s.city, '')) = 'santiago' or lower(s.name) like '%santiago%' or lower(s.name) like '%mcparking%')
  order by
    case when lower(coalesce(s.city, '')) = 'santiago' then 0 else 1 end,
    s.name
  limit 1;

  select ar.id into admin_global_role_id
  from public.access_roles ar
  where ar.role_code = 'ADMIN_GLOBAL';

  select ar.id into revenue_role_id
  from public.access_roles ar
  where ar.role_code = 'USER_REVENUE';

  select ar.id into operations_role_id
  from public.access_roles ar
  where ar.role_code = 'USER_OPERATIONS';

  if german_person_id is not null and admin_global_role_id is not null then
    if not exists (
      select 1
      from public.user_access_assignments uaa
      where uaa.person_id = german_person_id
        and uaa.access_role_id = admin_global_role_id
        and uaa.scope_type = 'global'::public.access_scope_type
        and uaa.status = 'active'::public.record_status
    ) then
      insert into public.user_access_assignments (person_id, access_role_id, scope_type, status)
      values (german_person_id, admin_global_role_id, 'global'::public.access_scope_type, 'active'::public.record_status);
    end if;
  end if;

  if agustin_person_id is not null and revenue_role_id is not null and chile_country_id is not null then
    if not exists (
      select 1
      from public.user_access_assignments uaa
      where uaa.person_id = agustin_person_id
        and uaa.access_role_id = revenue_role_id
        and uaa.scope_type = 'country'::public.access_scope_type
        and uaa.country_id = chile_country_id
        and uaa.status = 'active'::public.record_status
    ) then
      insert into public.user_access_assignments (person_id, access_role_id, scope_type, country_id, status)
      values (agustin_person_id, revenue_role_id, 'country'::public.access_scope_type, chile_country_id, 'active'::public.record_status);
    end if;
  end if;

  if operations_person_id is not null
    and operations_role_id is not null
    and chile_country_id is not null
    and mcparking_company_id is not null
    and santiago_site_id is not null then
    if not exists (
      select 1
      from public.user_access_assignments uaa
      where uaa.person_id = operations_person_id
        and uaa.access_role_id = operations_role_id
        and uaa.scope_type = 'site'::public.access_scope_type
        and uaa.country_id = chile_country_id
        and uaa.company_id = mcparking_company_id
        and uaa.site_id = santiago_site_id
        and uaa.status = 'active'::public.record_status
    ) then
      insert into public.user_access_assignments (
        person_id,
        access_role_id,
        scope_type,
        country_id,
        company_id,
        site_id,
        status
      )
      values (
        operations_person_id,
        operations_role_id,
        'site'::public.access_scope_type,
        chile_country_id,
        mcparking_company_id,
        santiago_site_id,
        'active'::public.record_status
      );
    end if;
  end if;
end $$;

create or replace view public.v_person_access_assignments as
select
  uaa.id,
  uaa.person_id,
  p.name as person_name,
  p.email as person_email,
  uaa.access_role_id,
  ar.role_code as access_role_code,
  ar.name as access_role_name,
  uaa.scope_type,
  uaa.country_id,
  country.name as country_name,
  uaa.company_id,
  company.name as company_name,
  uaa.site_id,
  site.name as site_name,
  uaa.status,
  uaa.start_date,
  uaa.end_date,
  uaa.created_at,
  uaa.updated_at
from public.user_access_assignments uaa
join public.people p on p.id = uaa.person_id
join public.access_roles ar on ar.id = uaa.access_role_id
left join public.countries country on country.id = uaa.country_id
left join public.companies company on company.id = uaa.company_id
left join public.sites site on site.id = uaa.site_id;

create or replace view public.v_person_effective_permissions as
with role_permissions as (
  select
    uaa.person_id,
    p.name as person_name,
    p.email as person_email,
    ar.id as access_role_id,
    ar.role_code as access_role_code,
    ar.name as access_role_name,
    perm.id as permission_id,
    perm.code as permission_code,
    perm.name as permission_name,
    perm.module,
    uaa.scope_type,
    uaa.country_id,
    country.name as country_name,
    uaa.company_id,
    company.name as company_name,
    uaa.site_id,
    site.name as site_name
  from public.user_access_assignments uaa
  join public.people p on p.id = uaa.person_id
  join public.access_roles ar on ar.id = uaa.access_role_id
  join public.access_role_permissions arp on arp.access_role_id = ar.id
  join public.permissions perm on perm.id = arp.permission_id
  left join public.countries country on country.id = uaa.country_id
  left join public.companies company on company.id = uaa.company_id
  left join public.sites site on site.id = uaa.site_id
  where uaa.status = 'active'::public.record_status
    and ar.status = 'active'::public.record_status
    and arp.status = 'active'::public.record_status
    and perm.status = 'active'::public.record_status
    and (uaa.end_date is null or uaa.end_date >= current_date)
),
allowed_overrides as (
  select
    po.person_id,
    p.name as person_name,
    p.email as person_email,
    null::uuid as access_role_id,
    'OVERRIDE'::text as access_role_code,
    'Permiso especial'::text as access_role_name,
    perm.id as permission_id,
    perm.code as permission_code,
    perm.name as permission_name,
    perm.module,
    po.scope_type,
    po.country_id,
    country.name as country_name,
    po.company_id,
    company.name as company_name,
    po.site_id,
    site.name as site_name
  from public.permission_overrides po
  join public.people p on p.id = po.person_id
  join public.permissions perm on perm.id = po.permission_id
  left join public.countries country on country.id = po.country_id
  left join public.companies company on company.id = po.company_id
  left join public.sites site on site.id = po.site_id
  where po.status = 'active'::public.record_status
    and po.effect = 'allow'::public.permission_override_effect
    and perm.status = 'active'::public.record_status
    and (po.end_date is null or po.end_date >= current_date)
)
select distinct rp.*
from role_permissions rp
where not exists (
  select 1
  from public.permission_overrides po
  where po.person_id = rp.person_id
    and po.permission_id = rp.permission_id
    and po.effect = 'deny'::public.permission_override_effect
    and po.status = 'active'::public.record_status
    and (po.end_date is null or po.end_date >= current_date)
)
union
select distinct ao.*
from allowed_overrides ao;

create or replace function public.person_effective_permissions(target_person_id uuid)
returns table (
  person_id uuid,
  person_name text,
  person_email text,
  access_role_id uuid,
  access_role_code text,
  access_role_name text,
  permission_id uuid,
  permission_code text,
  permission_name text,
  module text,
  scope_type public.access_scope_type,
  country_id uuid,
  country_name text,
  company_id uuid,
  company_name text,
  site_id uuid,
  site_name text
)
language sql
stable
as $$
  select
    v.person_id,
    v.person_name,
    v.person_email,
    v.access_role_id,
    v.access_role_code,
    v.access_role_name,
    v.permission_id,
    v.permission_code,
    v.permission_name,
    v.module,
    v.scope_type,
    v.country_id,
    v.country_name,
    v.company_id,
    v.company_name,
    v.site_id,
    v.site_name
  from public.v_person_effective_permissions v
  where v.person_id = target_person_id;
$$;

create or replace view public.v_access_by_country as
select
  country_id,
  country_name,
  count(distinct person_id) as users_count,
  count(*) as assignments_count
from public.v_person_access_assignments
where status = 'active'::public.record_status
  and country_id is not null
group by country_id, country_name;

create or replace view public.v_access_by_company as
select
  company_id,
  company_name,
  country_id,
  country_name,
  count(distinct person_id) as users_count,
  count(*) as assignments_count
from public.v_person_access_assignments
where status = 'active'::public.record_status
  and company_id is not null
group by company_id, company_name, country_id, country_name;

create or replace view public.v_access_by_site as
select
  site_id,
  site_name,
  company_id,
  company_name,
  country_id,
  country_name,
  count(distinct person_id) as users_count,
  count(*) as assignments_count
from public.v_person_access_assignments
where status = 'active'::public.record_status
  and site_id is not null
group by site_id, site_name, company_id, company_name, country_id, country_name;

create or replace view public.v_global_access_users as
select distinct
  person_id,
  person_name,
  person_email,
  access_role_id,
  access_role_code,
  access_role_name,
  status,
  start_date,
  end_date
from public.v_person_access_assignments
where status = 'active'::public.record_status
  and scope_type = 'global'::public.access_scope_type;

create or replace view public.v_admin_access_users as
select distinct
  v.person_id,
  v.person_name,
  v.person_email,
  v.access_role_id,
  v.access_role_code,
  v.access_role_name,
  v.scope_type,
  v.country_id,
  v.country_name,
  v.company_id,
  v.company_name,
  v.site_id,
  v.site_name
from public.v_person_effective_permissions v
where v.permission_code in ('settings.manage', 'roles.manage', 'people.manage')
  or v.access_role_code like 'ADMIN_%';
