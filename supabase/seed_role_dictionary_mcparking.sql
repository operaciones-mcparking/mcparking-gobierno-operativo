do $$
declare
  v_mcparking_id uuid;
  v_area_id uuid;
  v_current_role_id uuid;
  v_current_person_id uuid;
  item record;
begin
  select id into v_mcparking_id
  from public.companies
  where lower(name) = 'mcparking'
  limit 1;

  if v_mcparking_id is null then
    insert into public.companies (name, description, status)
    values ('McParking', 'Empresa operadora y prestadora de roles funcionales.', 'active'::public.record_status)
    returning id into v_mcparking_id;
  end if;

  for item in
    select *
    from (
      values
        (1, 'GG', 'Gerente General', 'Direccion', 'executive', 'German Bravo', 'Dirigir estrategica y operacionalmente McParking, asegurando crecimiento, rentabilidad y coordinacion entre areas.', array['Estrategia comercial y operacional','Inversiones, proyectos y nuevas lineas de negocio','Objetivos financieros, ocupacion, revenue y rentabilidad','Relacion con clientes corporativos, bancos y aliados','Politicas comerciales, descuentos, convenios y cumplimiento contractual']),
        (2, 'FIN', 'Gerente Finanzas', 'Finanzas', 'strategic', 'Hernan Venegas', 'Administrar recursos financieros, controlando ingresos, gastos, flujo de caja y cumplimiento tributario.', array['Presupuestos y proyecciones financieras','Flujo de caja y liquidez','Conciliaciones bancarias, cierres contables y estados financieros','Pagos a proveedores, cobranza y facturacion','Rentabilidad de proyectos y relacion con bancos']),
        (3, 'TI/C', 'TI / Comercial', 'Tecnologia / Comercial', 'strategic', 'Jose Luis', 'Liderar tecnologia, desarrollo comercial y transformacion digital para que los sistemas apoyen el crecimiento del negocio.', array['Plataformas tecnologicas y sistemas internos','Integraciones con Odoo, pagos y sistemas externos','Proveedores tecnologicos e infraestructura','Alianzas, convenios y propuestas comerciales','Automatizacion, IA, dashboards y arquitectura tecnologica']),
        (4, 'CONT', 'Analista Contable', 'Contabilidad', 'operational', 'Romario Larenas', 'Ejecutar y controlar procesos contables y tributarios, asegurando calidad y consistencia financiera.', array['Registro y control contable','Conciliaciones bancarias','Analisis de cuentas y cierres mensuales','Informacion tributaria y control documental','Apoyo en auditorias y coordinacion con gerencia financiera']),
        (5, 'DATOS', 'Analista Datos TI', 'Datos', 'operational', 'Agustin', 'Transformar datos operacionales y comerciales en informacion util para la toma de decisiones.', array['Dashboards de gestion, ocupacion, revenue y demanda','Reportes para gerencia y analisis de clientes','Bases de datos corporativas y modelos de informacion','Calidad e integridad de datos','Automatizaciones, alertas, IA, pricing y competencia']),
        (6, 'OPS', 'Jefe Operaciones', 'Operaciones', 'operational', 'Diego Vera', 'Planificar, coordinar y supervisar la operacion diaria de estacionamientos y experiencia de servicio.', array['Operacion diaria y personal operativo','Ocupacion, disponibilidad e incidencias','Servicios de transporte','Mejoras operativas y protocolos de servicio','Indicadores operacionales']),
        (7, 'ATC', 'Atencion al Cliente', 'Servicio', 'operational', 'Equipo Operativo', 'Entregar atencion cercana, eficiente y oportuna a clientes, resolviendo consultas y apoyando la prestacion del servicio.', array['Atencion presencial y digital','Reclamos y solicitudes','Apoyo en check-in y check-out','Apoyo en reservas y modificaciones','Registro de incidencias']),
        (8, 'OBRAS', 'Obras Civiles', 'Infraestructura', 'operational', 'Nicolas Valdes', 'Planificar y supervisar obras civiles, mantenciones e infraestructura fisica para continuidad operacional.', array['Obras y proyectos de infraestructura','Contratistas y proveedores','Mantenciones preventivas y correctivas','Presupuestos de obras','Seguridad, mejoras y expansion de espacios'])
    ) as t(sort_order, role_code, role_name, area_name, role_level, person_name, objective, responsibilities)
  loop
    insert into public.areas (company_id, name, status)
    values (v_mcparking_id, item.area_name, 'active'::public.record_status)
    on conflict (company_id, name) do update
      set status = excluded.status
    returning id into v_area_id;

    insert into public.roles (
      area_id,
      name,
      description,
      level,
      is_corporate,
      is_local,
      role_code,
      sort_order,
      responsibilities,
      status
    )
    values (
      v_area_id,
      item.role_name,
      item.objective,
      item.role_level::public.role_level,
      true,
      false,
      item.role_code,
      item.sort_order,
      item.responsibilities,
      'active'::public.record_status
    )
    on conflict (area_id, name) do update
      set description = excluded.description,
          level = excluded.level,
          is_corporate = excluded.is_corporate,
          is_local = excluded.is_local,
          role_code = excluded.role_code,
          sort_order = excluded.sort_order,
          responsibilities = excluded.responsibilities,
          status = excluded.status
    returning id into v_current_role_id;

    select id into v_current_person_id
    from public.people
    where name = item.person_name
    order by created_at
    limit 1;

    if v_current_person_id is null then
      insert into public.people (name, status)
      values (item.person_name, 'active'::public.record_status)
      returning id into v_current_person_id;
    end if;

    update public.person_roles
    set is_primary = false
    where role_id = v_current_role_id
      and status = 'active'::public.record_status
      and is_primary = true
      and person_id <> v_current_person_id;

    if not exists (
      select 1
      from public.person_roles pr
      where pr.person_id = v_current_person_id
        and pr.role_id = v_current_role_id
        and pr.company_id = v_mcparking_id
        and pr.status = 'active'::public.record_status
        and pr.is_primary = true
    ) then
      insert into public.person_roles (person_id, role_id, company_id, is_primary, is_backup, start_date, status)
      values (v_current_person_id, v_current_role_id, v_mcparking_id, true, false, current_date, 'active'::public.record_status);
    end if;
  end loop;
end $$;
