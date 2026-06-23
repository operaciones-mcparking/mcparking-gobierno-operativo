do $$
declare
  v_mcparking uuid;
  v_el_alba uuid;
  v_los_cumas uuid;
  v_rixtath uuid;
  v_reservas uuid;
begin
  select id into v_mcparking from public.companies where name = 'McParking' limit 1;

  if v_mcparking is null then
    insert into public.companies (name, description)
    values ('McParking', 'Empresa principal y proveedora operacional')
    returning id into v_mcparking;
  end if;

  insert into public.companies (name, description, status)
  select company_name, company_description, 'active'::public.record_status
  from (
    values
      ('El Alba', 'Empresa cliente o relacionada atendida por McParking'),
      ('Los Cumas', 'Empresa cliente o relacionada atendida por McParking'),
      ('Rixtath EIRL', 'Empresa cliente o relacionada atendida por McParking')
  ) as source(company_name, company_description)
  where not exists (
    select 1
    from public.companies c
    where c.name = source.company_name
  );

  select id into v_el_alba from public.companies where name = 'El Alba' limit 1;
  select id into v_los_cumas from public.companies where name = 'Los Cumas' limit 1;
  select id into v_rixtath from public.companies where name = 'Rixtath EIRL' limit 1;

  insert into public.company_relationships (
    provider_company_id,
    client_company_id,
    relationship_type,
    description,
    status
  )
  values
    (v_mcparking, v_el_alba, 'service_client', 'McParking presta servicios operativos o administrativos a El Alba.', 'active'::public.record_status),
    (v_mcparking, v_los_cumas, 'service_client', 'McParking presta servicios operativos o administrativos a Los Cumas.', 'active'::public.record_status),
    (v_mcparking, v_rixtath, 'service_client', 'McParking presta servicios operativos o administrativos a Rixtath EIRL.', 'active'::public.record_status)
  on conflict (provider_company_id, client_company_id, relationship_type) do update
    set description = excluded.description,
        status = excluded.status;

  select id into v_reservas
  from public.processes
  where name = 'Reservas McParking'
  limit 1;

  if v_reservas is not null then
    insert into public.process_clients (process_id, client_company_id, notes, status)
    values
      (v_reservas, v_el_alba, 'Proceso potencialmente aplicable a reservas o servicios prestados a El Alba.', 'active'::public.record_status),
      (v_reservas, v_los_cumas, 'Proceso potencialmente aplicable a reservas o servicios prestados a Los Cumas.', 'active'::public.record_status),
      (v_reservas, v_rixtath, 'Proceso potencialmente aplicable a reservas o servicios prestados a Rixtath EIRL.', 'active'::public.record_status)
    on conflict (process_id, client_company_id) do update
      set notes = excluded.notes,
          status = excluded.status;
  end if;
end $$;
