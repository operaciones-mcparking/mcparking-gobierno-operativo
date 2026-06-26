create table if not exists public.functional_role_access_suggestions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  access_role_id uuid not null references public.access_roles(id) on delete cascade,
  scope_type public.access_scope_type not null default 'site'::public.access_scope_type,
  notes text,
  status public.record_status not null default 'active'::public.record_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint functional_role_access_suggestions_unique unique (role_id, access_role_id, scope_type)
);

comment on table public.functional_role_access_suggestions is
  'Puente entre rol funcional y rol de acceso sugerido. No concede permisos por si solo.';

create index if not exists functional_role_access_suggestions_role_idx
  on public.functional_role_access_suggestions(role_id, status);

create index if not exists functional_role_access_suggestions_access_role_idx
  on public.functional_role_access_suggestions(access_role_id);

drop trigger if exists set_functional_role_access_suggestions_updated_at on public.functional_role_access_suggestions;
create trigger set_functional_role_access_suggestions_updated_at
before update on public.functional_role_access_suggestions
for each row execute function public.set_updated_at();

alter table public.functional_role_access_suggestions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'functional_role_access_suggestions'
      and policyname = 'functional_role_access_suggestions_read_authenticated'
  ) then
    create policy "functional_role_access_suggestions_read_authenticated"
      on public.functional_role_access_suggestions for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'functional_role_access_suggestions'
      and policyname = 'functional_role_access_suggestions_admin_all'
  ) then
    create policy "functional_role_access_suggestions_admin_all"
      on public.functional_role_access_suggestions for all to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;
end $$;

create or replace view public.v_functional_role_access_suggestions as
select
  s.id,
  s.role_id,
  r.name as role_name,
  r.role_code,
  r.area_id,
  a.company_id,
  c.name as company_name,
  c.country_id as role_country_id,
  r.site_id as role_site_id,
  s.access_role_id,
  ar.name as access_role_name,
  ar.role_code as access_role_code,
  s.scope_type,
  s.notes,
  s.status
from public.functional_role_access_suggestions s
join public.roles r on r.id = s.role_id
join public.access_roles ar on ar.id = s.access_role_id
left join public.areas a on a.id = r.area_id
left join public.companies c on c.id = a.company_id;

do $$
begin
  insert into public.functional_role_access_suggestions (
    role_id,
    access_role_id,
    scope_type,
    notes,
    status
  )
  select
    deduped.role_id,
    deduped.access_role_id,
    deduped.scope_type,
    deduped.notes,
    'active'::public.record_status
  from (
    select distinct on (candidates.role_id, candidates.access_role_id, candidates.scope_type)
      candidates.role_id,
      candidates.access_role_id,
      candidates.scope_type,
      candidates.notes
    from (
      select
        r.id as role_id,
        ar.id as access_role_id,
        rules.scope_type::public.access_scope_type as scope_type,
        rules.notes,
        rules.priority
      from public.roles r
      join (
        values
          ('%gerente general%', 'ADMIN_COUNTRY', 'country', 'Puede administrar la operacion del pais.', 10),
          ('%revenue%', 'USER_REVENUE', 'country', 'Acceso operativo a vistas y tareas de revenue.', 20),
          ('%finanz%', 'USER_FINANCE', 'company', 'Acceso operativo financiero de la empresa.', 30),
          ('%tesorer%', 'USER_FINANCE', 'company', 'Acceso operativo financiero de la empresa.', 40),
          ('%contab%', 'USER_FINANCE', 'company', 'Acceso operativo contable y financiero.', 50),
          ('%operacion%', 'USER_OPERATIONS', 'site', 'Acceso operativo de sede.', 60),
          ('%cajer%', 'USER_OPERATIONS', 'site', 'Acceso operativo de sede.', 70),
          ('%transporte%', 'USER_OPERATIONS', 'site', 'Acceso operativo de sede.', 80),
          ('%atencion%', 'USER_CUSTOMER_SERVICE', 'site', 'Acceso a atencion y seguimiento de clientes.', 90),
          ('%cliente%', 'USER_CUSTOMER_SERVICE', 'site', 'Acceso a atencion y seguimiento de clientes.', 100),
          ('%tecnolog%', 'USER_TECHNOLOGY', 'company', 'Acceso tecnico de sistemas e integraciones.', 110),
          ('ti / comercial', 'USER_TECHNOLOGY', 'company', 'Acceso tecnico de sistemas e integraciones.', 120),
          ('%sistema%', 'USER_TECHNOLOGY', 'company', 'Acceso tecnico de sistemas e integraciones.', 130)
      ) as rules(pattern, access_role_code, scope_type, notes, priority)
        on lower(r.name) like rules.pattern
      join public.access_roles ar on ar.role_code = rules.access_role_code
      where r.status = 'active'::public.record_status
    ) candidates
    order by candidates.role_id, candidates.access_role_id, candidates.scope_type, candidates.priority
  ) deduped
  on conflict (role_id, access_role_id, scope_type) do update
    set notes = excluded.notes,
        status = 'active'::public.record_status;
end $$;
