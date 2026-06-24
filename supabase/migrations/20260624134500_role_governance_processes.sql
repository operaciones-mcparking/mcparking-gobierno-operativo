create table if not exists public.role_governance_processes (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  process_key text not null,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_id, process_key)
);

create index if not exists idx_role_governance_processes_role_id
  on public.role_governance_processes(role_id);

create trigger set_role_governance_processes_updated_at
  before update on public.role_governance_processes
  for each row execute function public.set_updated_at();

alter table public.role_governance_processes enable row level security;

drop policy if exists "mvp_role_governance_processes_read"
  on public.role_governance_processes;
drop policy if exists "mvp_role_governance_processes_write"
  on public.role_governance_processes;

create policy "mvp_role_governance_processes_read"
  on public.role_governance_processes
  for select
  to anon, authenticated
  using (true);

create policy "mvp_role_governance_processes_write"
  on public.role_governance_processes
  for all
  to anon, authenticated
  using (true)
  with check (true);

insert into public.role_governance_processes (role_id, process_key, status)
select r.id, seed.process_key, 'active'::public.record_status
from (
  values
    ('GG', 'Core Operaciones'),
    ('TI/C', 'Core Operaciones'),
    ('OPS', 'Core Operaciones'),
    ('ATC', 'Core Operaciones'),
    ('GG', 'Finanzas'),
    ('FIN', 'Finanzas'),
    ('CONT', 'Finanzas'),
    ('GG', 'Marketing'),
    ('TI/C', 'Marketing'),
    ('DATOS', 'Marketing'),
    ('GG', 'RR.HH.'),
    ('FIN', 'RR.HH.'),
    ('CONT', 'RR.HH.'),
    ('GG', 'Implementacion / Mantencion'),
    ('OPS', 'Implementacion / Mantencion'),
    ('OBRAS', 'Implementacion / Mantencion'),
    ('GG', 'TI'),
    ('TI/C', 'TI'),
    ('CONT', 'TI'),
    ('DATOS', 'TI'),
    ('GG', 'Planificacion / Control'),
    ('FIN', 'Planificacion / Control'),
    ('TI/C', 'Planificacion / Control'),
    ('DATOS', 'Planificacion / Control')
) as seed(role_code, process_key)
join public.roles r on r.role_code = seed.role_code
on conflict (role_id, process_key) do update
  set status = excluded.status;
