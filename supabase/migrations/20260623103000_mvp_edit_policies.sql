alter table public.processes enable row level security;
alter table public.subprocesses enable row level security;
alter table public.process_roles enable row level security;
alter table public.process_systems enable row level security;

drop policy if exists "mvp_processes_read" on public.processes;
drop policy if exists "mvp_processes_write" on public.processes;
drop policy if exists "mvp_subprocesses_read" on public.subprocesses;
drop policy if exists "mvp_subprocesses_write" on public.subprocesses;
drop policy if exists "mvp_process_roles_read" on public.process_roles;
drop policy if exists "mvp_process_roles_write" on public.process_roles;
drop policy if exists "mvp_process_systems_read" on public.process_systems;
drop policy if exists "mvp_process_systems_write" on public.process_systems;

create policy "mvp_processes_read"
  on public.processes
  for select
  using (true);

create policy "mvp_processes_write"
  on public.processes
  for all
  using (true)
  with check (true);

create policy "mvp_subprocesses_read"
  on public.subprocesses
  for select
  using (true);

create policy "mvp_subprocesses_write"
  on public.subprocesses
  for all
  using (true)
  with check (true);

create policy "mvp_process_roles_read"
  on public.process_roles
  for select
  using (true);

create policy "mvp_process_roles_write"
  on public.process_roles
  for all
  using (true)
  with check (true);

create policy "mvp_process_systems_read"
  on public.process_systems
  for select
  using (true);

create policy "mvp_process_systems_write"
  on public.process_systems
  for all
  using (true)
  with check (true);
