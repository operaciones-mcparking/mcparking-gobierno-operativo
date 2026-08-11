begin;

do $$
declare
  v_active_processes integer;
  v_active_subprocesses integer;
  v_total_process_roles integer;
  v_updated integer;
begin
  select count(*) into v_active_processes from public.processes where status = 'active'::public.record_status;
  if v_active_processes <> 20 then raise exception 'Expected 20 active processes before owner alignment, found %', v_active_processes; end if;

  select count(*) into v_active_subprocesses
  from public.subprocesses sp
  join public.processes p on p.id = sp.process_id
  where p.status = 'active'::public.record_status and sp.status = 'active'::public.record_status;
  if v_active_subprocesses <> 94 then raise exception 'Expected 94 active subprocesses before owner alignment, found %', v_active_subprocesses; end if;

  select count(*) into v_total_process_roles from public.process_roles;

  if (select count(*) from public.processes p where (p.id, p.name, p.status::text) in (
    ('75ed7877-db45-41e5-bc12-f3a616eb0eae'::uuid, 'Revenue Management', 'active'),
    ('4d09da28-e81c-4b0e-9bb5-a237445b043f'::uuid, 'Personas y Turnos', 'active'),
    ('56347ff9-295e-40e9-9f67-9cac155605bf'::uuid, 'Gestión de Proveedores', 'active'),
    ('a062ec7d-1af6-42b7-adda-28ad71b4323f'::uuid, 'test1', 'active')
  )) <> 4 then raise exception 'Expected target processes to exist with active status before owner alignment'; end if;

  if (select count(*) from public.roles r where (r.id, r.name, r.status::text) in (
    ('41eb1c42-7707-4f17-89c5-827725d81f9d'::uuid, 'Responsable Revenue / Analista Revenue', 'archived'),
    ('bad04303-dea5-4db7-9b1b-6ec875e6e9c3'::uuid, 'Encargado de Turnos / Personas', 'archived'),
    ('b6e8fc21-4fd0-4993-abd6-cecd89424844'::uuid, 'Encargado de Proveedores', 'archived'),
    ('ce2bfa79-102d-42a3-b8d0-3977831d04f8'::uuid, 'Gerente General', 'active'),
    ('d5aeb1c1-d306-415b-be7f-1cc5397ae7c1'::uuid, 'Jefe Operaciones', 'active'),
    ('bc9176e9-e97c-4739-9b7e-c183d17e3123'::uuid, 'Gerente Finanzas', 'active')
  )) <> 6 then raise exception 'Expected source archived roles and target active roles before owner alignment'; end if;

  if exists (
    select 1 from public.process_roles pr
    where pr.responsibility_type = 'owner'::public.responsibility_type
      and (
        (pr.process_id = '75ed7877-db45-41e5-bc12-f3a616eb0eae'::uuid and pr.role_id = 'ce2bfa79-102d-42a3-b8d0-3977831d04f8'::uuid)
        or (pr.process_id = '4d09da28-e81c-4b0e-9bb5-a237445b043f'::uuid and pr.role_id = 'd5aeb1c1-d306-415b-be7f-1cc5397ae7c1'::uuid)
        or (pr.process_id = '56347ff9-295e-40e9-9f67-9cac155605bf'::uuid and pr.role_id = 'bc9176e9-e97c-4739-9b7e-c183d17e3123'::uuid)
      )
  ) then raise exception 'Target owner rows already exist; aborting to avoid duplicate role ownership'; end if;

  if (select count(*) from public.process_roles pr where pr.process_id = '75ed7877-db45-41e5-bc12-f3a616eb0eae'::uuid and pr.role_id = '41eb1c42-7707-4f17-89c5-827725d81f9d'::uuid and pr.responsibility_type = 'owner'::public.responsibility_type) <> 6 then raise exception 'Expected 6 Revenue Management owner rows assigned to archived Revenue role'; end if;
  if (select count(*) from public.process_roles pr where pr.process_id = '4d09da28-e81c-4b0e-9bb5-a237445b043f'::uuid and pr.role_id = 'bad04303-dea5-4db7-9b1b-6ec875e6e9c3'::uuid and pr.responsibility_type = 'owner'::public.responsibility_type) <> 5 then raise exception 'Expected 5 Personas y Turnos owner rows assigned to archived Turnos/Personas role'; end if;
  if (select count(*) from public.process_roles pr where pr.process_id = '56347ff9-295e-40e9-9f67-9cac155605bf'::uuid and pr.role_id = 'b6e8fc21-4fd0-4993-abd6-cecd89424844'::uuid and pr.responsibility_type = 'owner'::public.responsibility_type) <> 5 then raise exception 'Expected 5 Gestión de Proveedores owner rows assigned to archived Proveedores role'; end if;

  if exists (select 1 from (
    select count(*) as dependency_count from public.subprocesses where process_id = 'a062ec7d-1af6-42b7-adda-28ad71b4323f'::uuid
    union all select count(*) from public.process_roles where process_id = 'a062ec7d-1af6-42b7-adda-28ad71b4323f'::uuid
    union all select count(*) from public.process_systems where process_id = 'a062ec7d-1af6-42b7-adda-28ad71b4323f'::uuid
    union all select count(*) from public.risks where process_id = 'a062ec7d-1af6-42b7-adda-28ad71b4323f'::uuid
    union all select count(*) from public.controls where process_id = 'a062ec7d-1af6-42b7-adda-28ad71b4323f'::uuid
    union all select count(*) from public.metrics where process_id = 'a062ec7d-1af6-42b7-adda-28ad71b4323f'::uuid
    union all select count(*) from public.process_clients where process_id = 'a062ec7d-1af6-42b7-adda-28ad71b4323f'::uuid
  ) deps where deps.dependency_count <> 0) then raise exception 'test1 has dependencies; aborting archive'; end if;

  update public.process_roles set role_id = 'ce2bfa79-102d-42a3-b8d0-3977831d04f8'::uuid, updated_at = now() where process_id = '75ed7877-db45-41e5-bc12-f3a616eb0eae'::uuid and role_id = '41eb1c42-7707-4f17-89c5-827725d81f9d'::uuid and responsibility_type = 'owner'::public.responsibility_type;
  get diagnostics v_updated = row_count;
  if v_updated <> 6 then raise exception 'Expected to update 6 Revenue Management owner rows, updated %', v_updated; end if;

  update public.process_roles set role_id = 'd5aeb1c1-d306-415b-be7f-1cc5397ae7c1'::uuid, updated_at = now() where process_id = '4d09da28-e81c-4b0e-9bb5-a237445b043f'::uuid and role_id = 'bad04303-dea5-4db7-9b1b-6ec875e6e9c3'::uuid and responsibility_type = 'owner'::public.responsibility_type;
  get diagnostics v_updated = row_count;
  if v_updated <> 5 then raise exception 'Expected to update 5 Personas y Turnos owner rows, updated %', v_updated; end if;

  update public.process_roles set role_id = 'bc9176e9-e97c-4739-9b7e-c183d17e3123'::uuid, updated_at = now() where process_id = '56347ff9-295e-40e9-9f67-9cac155605bf'::uuid and role_id = 'b6e8fc21-4fd0-4993-abd6-cecd89424844'::uuid and responsibility_type = 'owner'::public.responsibility_type;
  get diagnostics v_updated = row_count;
  if v_updated <> 5 then raise exception 'Expected to update 5 Gestión de Proveedores owner rows, updated %', v_updated; end if;

  update public.processes set status = 'archived'::public.record_status, updated_at = now() where id = 'a062ec7d-1af6-42b7-adda-28ad71b4323f'::uuid and name = 'test1' and status = 'active'::public.record_status;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'Expected to archive exactly one test1 process, updated %', v_updated; end if;

  if (select count(*) from public.process_roles) <> v_total_process_roles then raise exception 'process_roles row count changed unexpectedly'; end if;
  if (select count(*) from public.processes where status = 'active'::public.record_status) <> 19 then raise exception 'Expected 19 active processes after owner alignment'; end if;
  if (select count(*) from public.processes where status = 'active'::public.record_status and process_type::text = 'strategic') <> 4 then raise exception 'Expected 4 active strategic processes after owner alignment'; end if;
  if (select count(*) from public.processes where status = 'active'::public.record_status and process_type::text = 'operational') <> 8 then raise exception 'Expected 8 active operational processes after owner alignment'; end if;
  if (select count(*) from public.processes where status = 'active'::public.record_status and process_type::text = 'support') <> 7 then raise exception 'Expected 7 active support processes after owner alignment'; end if;
  if (select count(*) from public.subprocesses sp join public.processes p on p.id = sp.process_id where p.status = 'active'::public.record_status and sp.status = 'active'::public.record_status) <> 94 then raise exception 'Expected 94 active subprocesses after owner alignment'; end if;

  if exists (
    select 1 from public.process_roles pr join public.processes p on p.id = pr.process_id
    where p.status = 'active'::public.record_status and pr.responsibility_type = 'owner'::public.responsibility_type
      and pr.role_id in ('41eb1c42-7707-4f17-89c5-827725d81f9d'::uuid, 'bad04303-dea5-4db7-9b1b-6ec875e6e9c3'::uuid, 'b6e8fc21-4fd0-4993-abd6-cecd89424844'::uuid)
  ) then raise exception 'Archived owner roles remain assigned to active processes'; end if;

  if exists (
    select 1 from public.process_roles pr join public.processes p on p.id = pr.process_id
    where p.status = 'active'::public.record_status and pr.responsibility_type = 'owner'::public.responsibility_type
      and pr.role_id not in (
        'ce2bfa79-102d-42a3-b8d0-3977831d04f8'::uuid,
        'bc9176e9-e97c-4739-9b7e-c183d17e3123'::uuid,
        '10771b45-0485-4b11-b9ce-18caf66dcc95'::uuid,
        'bdb81177-dab5-4776-96dd-f5953fc39e40'::uuid,
        'e2f8a7b5-2a12-40cb-a0b0-e88f446bf2d6'::uuid,
        'd5aeb1c1-d306-415b-be7f-1cc5397ae7c1'::uuid,
        '1c13855a-b8fa-4090-9879-176c80798afd'::uuid,
        '6f0a82e5-86ed-4bf9-bf86-3f4fe865ed1d'::uuid
      )
  ) then raise exception 'Non-official owner role remains assigned to active processes'; end if;

  if (select count(*) from public.roles r where r.id in ('41eb1c42-7707-4f17-89c5-827725d81f9d'::uuid, 'bad04303-dea5-4db7-9b1b-6ec875e6e9c3'::uuid, 'b6e8fc21-4fd0-4993-abd6-cecd89424844'::uuid) and r.status = 'archived'::public.record_status) <> 3 then raise exception 'Archived source roles changed status unexpectedly'; end if;
end $$;

commit;
