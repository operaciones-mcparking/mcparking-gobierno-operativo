alter table public.roles enable row level security;
alter table public.people enable row level security;
alter table public.person_roles enable row level security;
alter table public.systems enable row level security;
alter table public.risks enable row level security;
alter table public.controls enable row level security;

drop policy if exists "mvp_roles_read" on public.roles;
drop policy if exists "mvp_roles_write" on public.roles;
drop policy if exists "mvp_people_read" on public.people;
drop policy if exists "mvp_people_write" on public.people;
drop policy if exists "mvp_person_roles_read" on public.person_roles;
drop policy if exists "mvp_person_roles_write" on public.person_roles;
drop policy if exists "mvp_systems_read" on public.systems;
drop policy if exists "mvp_systems_write" on public.systems;
drop policy if exists "mvp_risks_read" on public.risks;
drop policy if exists "mvp_risks_write" on public.risks;
drop policy if exists "mvp_controls_read" on public.controls;
drop policy if exists "mvp_controls_write" on public.controls;

create policy "mvp_roles_read"
  on public.roles
  for select
  using (true);

create policy "mvp_roles_write"
  on public.roles
  for all
  using (true)
  with check (true);

create policy "mvp_people_read"
  on public.people
  for select
  using (true);

create policy "mvp_people_write"
  on public.people
  for all
  using (true)
  with check (true);

create policy "mvp_person_roles_read"
  on public.person_roles
  for select
  using (true);

create policy "mvp_person_roles_write"
  on public.person_roles
  for all
  using (true)
  with check (true);

create policy "mvp_systems_read"
  on public.systems
  for select
  using (true);

create policy "mvp_systems_write"
  on public.systems
  for all
  using (true)
  with check (true);

create policy "mvp_risks_read"
  on public.risks
  for select
  using (true);

create policy "mvp_risks_write"
  on public.risks
  for all
  using (true)
  with check (true);

create policy "mvp_controls_read"
  on public.controls
  for select
  using (true);

create policy "mvp_controls_write"
  on public.controls
  for all
  using (true)
  with check (true);
