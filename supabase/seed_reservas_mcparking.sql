do $$
declare
  v_company uuid;
  v_area_operaciones uuid;
  v_area_comercial uuid;
  v_area_tecnologia uuid;
  v_area_finanzas uuid;
  v_process uuid;

  v_jose_luis uuid;
  v_romario uuid;
  v_agustin uuid;
  v_hernan uuid;

  v_role_web_tec uuid;
  v_role_cliente_comercial uuid;
  v_role_revenue_comercial uuid;
  v_role_gerencia_comercial uuid;
  v_role_web_pagos uuid;
  v_role_cliente_finanzas uuid;
  v_role_sistema_reservas uuid;
  v_role_operaciones_atencion uuid;
  v_role_facturacion uuid;
  v_role_cliente_admin uuid;
  v_role_datos_control uuid;
  v_role_gerencia_rev_ops uuid;
  v_role_conciliacion uuid;
  v_role_finanzas_admin uuid;
  v_role_admin_gerencia uuid;

  v_sp_web uuid;
  v_sp_precio uuid;
  v_sp_pago uuid;
  v_sp_confirmacion uuid;
  v_sp_boleta uuid;
  v_sp_banco_reservas uuid;
  v_sp_conciliacion uuid;

  v_system uuid;
  v_risk uuid;
begin
  select id into v_company from public.companies where name = 'McParking' limit 1;

  if v_company is null then
    insert into public.companies (name, description)
    values ('McParking', 'Empresa base para procesos operativos McParking')
    returning id into v_company;
  end if;

  insert into public.areas (company_id, name, description)
  values
    (v_company, 'Operaciones', 'Area principal para la ejecucion operacional del servicio'),
    (v_company, 'Comercial', 'Area comercial, precios, descuentos y relacion con clientes'),
    (v_company, 'Tecnologia', 'Area responsable de sistemas, web e integraciones'),
    (v_company, 'Finanzas', 'Area responsable de pagos, facturacion y conciliacion')
  on conflict (company_id, name) do update
    set description = excluded.description;

  select id into v_area_operaciones from public.areas where company_id = v_company and name = 'Operaciones';
  select id into v_area_comercial from public.areas where company_id = v_company and name = 'Comercial';
  select id into v_area_tecnologia from public.areas where company_id = v_company and name = 'Tecnologia';
  select id into v_area_finanzas from public.areas where company_id = v_company and name = 'Finanzas';

  insert into public.processes (
    company_id,
    area_id,
    name,
    description,
    objective,
    expected_result,
    criticality,
    status,
    is_replicable,
    documentation_status
  )
  values (
    v_company,
    v_area_operaciones,
    'Reservas McParking',
    'Proceso encargado de capturar, validar, confirmar, documentar y controlar las reservas realizadas por clientes en McParking, desde la cotizacion en la web hasta la validacion del pago, emision de boleta, registro operativo y conciliacion financiera.',
    'Asegurar que toda reserva realizada por un cliente en McParking sea correctamente cotizada, pagada, confirmada, registrada, documentada, disponible para operacion y conciliada financieramente.',
    'Reserva creada correctamente; pago validado; cliente informado; boleta emitida; reserva disponible para operacion; transaccion conciliable contra Transbank y banco; data disponible para control y reporteria.',
    'critical'::public.criticality_level,
    'active'::public.record_status,
    true,
    'draft'::public.documentation_status
  )
  on conflict (company_id, name) do update
    set area_id = excluded.area_id,
        description = excluded.description,
        objective = excluded.objective,
        expected_result = excluded.expected_result,
        criticality = excluded.criticality,
        status = excluded.status,
        is_replicable = excluded.is_replicable,
        documentation_status = excluded.documentation_status
  returning id into v_process;

  insert into public.people (name, email, status)
  values
    ('Jose Luis', 'jose.luis@example.com', 'active'::public.record_status),
    ('Romario', 'romario@example.com', 'active'::public.record_status),
    ('Agustin', 'agustin@example.com', 'active'::public.record_status),
    ('Hernan', 'hernan@example.com', 'active'::public.record_status)
  on conflict (email) do update
    set name = excluded.name,
        status = excluded.status;

  select id into v_jose_luis from public.people where email = 'jose.luis@example.com';
  select id into v_romario from public.people where email = 'romario@example.com';
  select id into v_agustin from public.people where email = 'agustin@example.com';
  select id into v_hernan from public.people where email = 'hernan@example.com';

  insert into public.roles (area_id, name, description, level, is_corporate, is_local, status)
  values
    (v_area_tecnologia, 'Responsable Web / Tecnologia', 'Rol dueno de web, motor de reserva e integraciones tecnicas.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_comercial, 'Cliente / Comercial', 'Rol usuario de cotizacion y flujo comercial del cliente.', 'operational'::public.role_level, false, true, 'active'::public.record_status),
    (v_area_comercial, 'Revenue / Comercial', 'Rol dueno de precios, descuentos y reglas comerciales.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_comercial, 'Gerencia / Comercial', 'Rol usuario de informacion comercial y definiciones de revenue.', 'executive'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_tecnologia, 'Responsable Web / Pagos', 'Rol dueno de integracion de pagos en web.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_finanzas, 'Cliente / Finanzas', 'Rol usuario financiero asociado al pago del cliente.', 'operational'::public.role_level, false, true, 'active'::public.record_status),
    (v_area_operaciones, 'Responsable Sistema de Reservas', 'Rol dueno de la confirmacion y disponibilidad operativa de reservas.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_operaciones, 'Operaciones / Atencion al Cliente', 'Rol usuario operativo y de atencion para reservas confirmadas.', 'operational'::public.role_level, false, true, 'active'::public.record_status),
    (v_area_finanzas, 'Encargado de Facturacion', 'Rol dueno de emision y control de boletas.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_finanzas, 'Cliente / Administracion', 'Rol usuario documental y administrativo.', 'operational'::public.role_level, false, true, 'active'::public.record_status),
    (v_area_operaciones, 'Analista de Datos / Control de Gestion', 'Rol dueno de registro, actualizacion y validacion del Banco de Reservas.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_operaciones, 'Gerencia / Revenue / Operaciones', 'Rol usuario de reporterias operativas, comerciales y de gestion.', 'executive'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_finanzas, 'Encargado de Conciliacion / Finanzas', 'Rol dueno de conciliacion banco contra Transbank.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_finanzas, 'Finanzas / Administracion', 'Rol de apoyo financiero y administrativo.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_finanzas, 'Administracion / Gerencia', 'Rol usuario de conciliacion financiera y cierre contable.', 'executive'::public.role_level, true, false, 'active'::public.record_status)
  on conflict (area_id, name) do update
    set description = excluded.description,
        level = excluded.level,
        is_corporate = excluded.is_corporate,
        is_local = excluded.is_local,
        status = excluded.status;

  select id into v_role_web_tec from public.roles where area_id = v_area_tecnologia and name = 'Responsable Web / Tecnologia';
  select id into v_role_cliente_comercial from public.roles where area_id = v_area_comercial and name = 'Cliente / Comercial';
  select id into v_role_revenue_comercial from public.roles where area_id = v_area_comercial and name = 'Revenue / Comercial';
  select id into v_role_gerencia_comercial from public.roles where area_id = v_area_comercial and name = 'Gerencia / Comercial';
  select id into v_role_web_pagos from public.roles where area_id = v_area_tecnologia and name = 'Responsable Web / Pagos';
  select id into v_role_cliente_finanzas from public.roles where area_id = v_area_finanzas and name = 'Cliente / Finanzas';
  select id into v_role_sistema_reservas from public.roles where area_id = v_area_operaciones and name = 'Responsable Sistema de Reservas';
  select id into v_role_operaciones_atencion from public.roles where area_id = v_area_operaciones and name = 'Operaciones / Atencion al Cliente';
  select id into v_role_facturacion from public.roles where area_id = v_area_finanzas and name = 'Encargado de Facturacion';
  select id into v_role_cliente_admin from public.roles where area_id = v_area_finanzas and name = 'Cliente / Administracion';
  select id into v_role_datos_control from public.roles where area_id = v_area_operaciones and name = 'Analista de Datos / Control de Gestion';
  select id into v_role_gerencia_rev_ops from public.roles where area_id = v_area_operaciones and name = 'Gerencia / Revenue / Operaciones';
  select id into v_role_conciliacion from public.roles where area_id = v_area_finanzas and name = 'Encargado de Conciliacion / Finanzas';
  select id into v_role_finanzas_admin from public.roles where area_id = v_area_finanzas and name = 'Finanzas / Administracion';
  select id into v_role_admin_gerencia from public.roles where area_id = v_area_finanzas and name = 'Administracion / Gerencia';

  insert into public.person_roles (person_id, role_id, company_id, is_primary, is_backup, start_date, status)
  select *
  from (
    values
      (v_jose_luis, v_role_web_tec, v_company, true, false, current_date, 'active'::public.record_status),
      (v_jose_luis, v_role_web_pagos, v_company, true, false, current_date, 'active'::public.record_status),
      (v_romario, v_role_facturacion, v_company, true, false, current_date, 'active'::public.record_status),
      (v_romario, v_role_conciliacion, v_company, true, false, current_date, 'active'::public.record_status),
      (v_agustin, v_role_datos_control, v_company, true, false, current_date, 'active'::public.record_status),
      (v_hernan, v_role_finanzas_admin, v_company, true, true, current_date, 'active'::public.record_status)
  ) as assignment(person_id, role_id, company_id, is_primary, is_backup, start_date, status)
  where not exists (
    select 1
    from public.person_roles existing
    where existing.person_id = assignment.person_id
      and existing.role_id = assignment.role_id
      and existing.company_id = assignment.company_id
      and existing.end_date is null
  );

  insert into public.subprocesses (process_id, name, description, frequency, criticality, status, sort_order)
  values
    (v_process, 'Web y motor de reserva', 'Captura inicial de cotizacion y reserva desde la web y motor de reservas.', 'Diaria', 'critical'::public.criticality_level, 'active'::public.record_status, 1),
    (v_process, 'Precio y descuentos', 'Definicion, validacion y control de reglas de precio, descuentos y promociones.', 'Diaria', 'high'::public.criticality_level, 'active'::public.record_status, 2),
    (v_process, 'Metodo de pago', 'Validacion del pago del cliente y su consistencia con la reserva.', 'Diaria', 'critical'::public.criticality_level, 'active'::public.record_status, 3),
    (v_process, 'Confirmacion de reserva', 'Confirmacion de reserva pagada y disponibilidad para operacion.', 'Diaria', 'critical'::public.criticality_level, 'active'::public.record_status, 4),
    (v_process, 'Emision de boleta', 'Emision y control del documento tributario asociado a la reserva.', 'Diaria', 'high'::public.criticality_level, 'active'::public.record_status, 5),
    (v_process, 'Registro en Banco de Reservas', 'Registro y validacion de informacion operativa y de gestion en Banco de Reservas.', 'Diaria', 'high'::public.criticality_level, 'active'::public.record_status, 6),
    (v_process, 'Conciliacion banco vs Transbank', 'Conciliacion financiera entre Transbank, banco, reservas y cierre contable.', 'Semanal o mensual', 'high'::public.criticality_level, 'active'::public.record_status, 7)
  on conflict (process_id, name) do update
    set description = excluded.description,
        frequency = excluded.frequency,
        criticality = excluded.criticality,
        status = excluded.status,
        sort_order = excluded.sort_order;

  select id into v_sp_web from public.subprocesses where process_id = v_process and name = 'Web y motor de reserva';
  select id into v_sp_precio from public.subprocesses where process_id = v_process and name = 'Precio y descuentos';
  select id into v_sp_pago from public.subprocesses where process_id = v_process and name = 'Metodo de pago';
  select id into v_sp_confirmacion from public.subprocesses where process_id = v_process and name = 'Confirmacion de reserva';
  select id into v_sp_boleta from public.subprocesses where process_id = v_process and name = 'Emision de boleta';
  select id into v_sp_banco_reservas from public.subprocesses where process_id = v_process and name = 'Registro en Banco de Reservas';
  select id into v_sp_conciliacion from public.subprocesses where process_id = v_process and name = 'Conciliacion banco vs Transbank';

  insert into public.systems (name, description, status)
  values
    ('Web McParking', 'Sitio web de cotizacion y reserva de McParking.', 'active'::public.record_status),
    ('Motor de Reservas', 'Motor que calcula disponibilidad, precio y creacion de reservas.', 'active'::public.record_status),
    ('Reglas Comerciales', 'Configuracion de reglas comerciales, tarifas y promociones.', 'active'::public.record_status),
    ('Codigos de Descuento', 'Repositorio o configuracion de codigos promocionales.', 'active'::public.record_status),
    ('Transbank', 'Pasarela de pago y fuente de transacciones aprobadas.', 'active'::public.record_status),
    ('Sistema de Reservas', 'Sistema operativo donde quedan disponibles las reservas.', 'active'::public.record_status),
    ('Correos Automaticos', 'Sistema de envio automatico de confirmaciones.', 'active'::public.record_status),
    ('Gmail', 'Canal de correo usado para comunicaciones y soporte.', 'active'::public.record_status),
    ('Sistema de Boletas', 'Sistema de emision de documentos tributarios.', 'active'::public.record_status),
    ('Odoo', 'ERP usado para administracion, facturacion y conciliacion.', 'active'::public.record_status),
    ('MySQL', 'Base de datos usada como fuente operacional o historica.', 'active'::public.record_status),
    ('SQLite', 'Base local o auxiliar usada en procesos de datos.', 'active'::public.record_status),
    ('Banco', 'Cuenta o cartola bancaria para conciliacion.', 'active'::public.record_status),
    ('Excel', 'Planillas de apoyo para conciliacion y control.', 'active'::public.record_status),
    ('Banco de Reservas', 'Base de reservas consolidada para operacion, control y reporterias.', 'active'::public.record_status),
    ('Supabase', 'Base de datos y backend de la plataforma.', 'active'::public.record_status)
  on conflict (name) do update
    set description = excluded.description,
        status = excluded.status;

  update public.systems set owner_role_id = v_role_web_tec where name in ('Web McParking', 'Motor de Reservas', 'Sistema de Reservas', 'Correos Automaticos', 'Gmail');
  update public.systems set owner_role_id = v_role_revenue_comercial where name in ('Reglas Comerciales', 'Codigos de Descuento');
  update public.systems set owner_role_id = v_role_web_pagos where name = 'Transbank';
  update public.systems set owner_role_id = v_role_facturacion where name in ('Sistema de Boletas', 'Odoo');
  update public.systems set owner_role_id = v_role_datos_control where name in ('MySQL', 'SQLite', 'Supabase', 'Banco de Reservas');
  update public.systems set owner_role_id = v_role_conciliacion where name in ('Banco', 'Excel');

  insert into public.process_roles (process_id, subprocess_id, role_id, responsibility_type, impact_percent, criticality, is_required, notes)
  values
    (v_process, v_sp_web, v_role_web_tec, 'owner'::public.responsibility_type, 20, 'critical'::public.criticality_level, true, 'Rol dueno de Web y motor de reserva'),
    (v_process, v_sp_web, v_role_cliente_comercial, 'user'::public.responsibility_type, 20, 'critical'::public.criticality_level, true, 'Rol usuario del flujo web'),
    (v_process, v_sp_precio, v_role_revenue_comercial, 'owner'::public.responsibility_type, 15, 'high'::public.criticality_level, true, 'Rol dueno de precio y descuentos'),
    (v_process, v_sp_precio, v_role_gerencia_comercial, 'user'::public.responsibility_type, 15, 'high'::public.criticality_level, true, 'Rol usuario de definiciones comerciales'),
    (v_process, v_sp_pago, v_role_web_pagos, 'owner'::public.responsibility_type, 25, 'critical'::public.criticality_level, true, 'Rol dueno de metodo de pago'),
    (v_process, v_sp_pago, v_role_cliente_finanzas, 'user'::public.responsibility_type, 25, 'critical'::public.criticality_level, true, 'Rol usuario del pago'),
    (v_process, v_sp_confirmacion, v_role_sistema_reservas, 'owner'::public.responsibility_type, 15, 'critical'::public.criticality_level, true, 'Rol dueno de confirmacion de reserva'),
    (v_process, v_sp_confirmacion, v_role_operaciones_atencion, 'user'::public.responsibility_type, 15, 'critical'::public.criticality_level, true, 'Rol usuario operativo y atencion al cliente'),
    (v_process, v_sp_boleta, v_role_facturacion, 'owner'::public.responsibility_type, 10, 'high'::public.criticality_level, true, 'Rol dueno de emision de boleta'),
    (v_process, v_sp_boleta, v_role_cliente_admin, 'user'::public.responsibility_type, 10, 'high'::public.criticality_level, true, 'Rol usuario documental'),
    (v_process, v_sp_banco_reservas, v_role_datos_control, 'owner'::public.responsibility_type, 10, 'high'::public.criticality_level, true, 'Rol dueno del registro en Banco de Reservas'),
    (v_process, v_sp_banco_reservas, v_role_gerencia_rev_ops, 'user'::public.responsibility_type, 10, 'high'::public.criticality_level, true, 'Rol usuario de reporterias'),
    (v_process, v_sp_conciliacion, v_role_conciliacion, 'owner'::public.responsibility_type, 5, 'high'::public.criticality_level, true, 'Rol dueno de conciliacion banco vs Transbank'),
    (v_process, v_sp_conciliacion, v_role_finanzas_admin, 'consulted'::public.responsibility_type, 5, 'high'::public.criticality_level, true, 'Rol apoyo de conciliacion'),
    (v_process, v_sp_conciliacion, v_role_admin_gerencia, 'user'::public.responsibility_type, 5, 'high'::public.criticality_level, true, 'Rol usuario de cierre financiero'),
    (v_process, v_sp_conciliacion, v_role_finanzas_admin, 'backup'::public.responsibility_type, 5, 'high'::public.criticality_level, true, 'Backup parcial: Hernan')
  on conflict (process_id, subprocess_id, role_id, responsibility_type) do update
    set impact_percent = excluded.impact_percent,
        criticality = excluded.criticality,
        is_required = excluded.is_required,
        notes = excluded.notes;

  for v_system in
    select id from public.systems where name in ('Web McParking', 'Motor de Reservas')
  loop
    insert into public.process_systems (process_id, subprocess_id, system_id, notes)
    values (v_process, v_sp_web, v_system, 'Sistema asociado a Web y motor de reserva')
    on conflict (process_id, subprocess_id, system_id) do update set notes = excluded.notes;
  end loop;

  for v_system in
    select id from public.systems where name in ('Motor de Reservas', 'Reglas Comerciales', 'Codigos de Descuento')
  loop
    insert into public.process_systems (process_id, subprocess_id, system_id, notes)
    values (v_process, v_sp_precio, v_system, 'Sistema asociado a Precio y descuentos')
    on conflict (process_id, subprocess_id, system_id) do update set notes = excluded.notes;
  end loop;

  for v_system in
    select id from public.systems where name in ('Web McParking', 'Transbank')
  loop
    insert into public.process_systems (process_id, subprocess_id, system_id, notes)
    values (v_process, v_sp_pago, v_system, 'Sistema asociado a Metodo de pago')
    on conflict (process_id, subprocess_id, system_id) do update set notes = excluded.notes;
  end loop;

  for v_system in
    select id from public.systems where name in ('Sistema de Reservas', 'Correos Automaticos', 'Gmail')
  loop
    insert into public.process_systems (process_id, subprocess_id, system_id, notes)
    values (v_process, v_sp_confirmacion, v_system, 'Sistema asociado a Confirmacion de reserva')
    on conflict (process_id, subprocess_id, system_id) do update set notes = excluded.notes;
  end loop;

  for v_system in
    select id from public.systems where name in ('Sistema de Boletas', 'Odoo')
  loop
    insert into public.process_systems (process_id, subprocess_id, system_id, notes)
    values (v_process, v_sp_boleta, v_system, 'Sistema asociado a Emision de boleta')
    on conflict (process_id, subprocess_id, system_id) do update set notes = excluded.notes;
  end loop;

  for v_system in
    select id from public.systems where name in ('MySQL', 'SQLite', 'Supabase', 'Banco de Reservas')
  loop
    insert into public.process_systems (process_id, subprocess_id, system_id, notes)
    values (v_process, v_sp_banco_reservas, v_system, 'Sistema asociado a Registro en Banco de Reservas')
    on conflict (process_id, subprocess_id, system_id) do update set notes = excluded.notes;
  end loop;

  for v_system in
    select id from public.systems where name in ('Transbank', 'Banco', 'Odoo', 'Excel')
  loop
    insert into public.process_systems (process_id, subprocess_id, system_id, notes)
    values (v_process, v_sp_conciliacion, v_system, 'Sistema asociado a Conciliacion banco vs Transbank')
    on conflict (process_id, subprocess_id, system_id) do update set notes = excluded.notes;
  end loop;

  insert into public.risks (process_id, subprocess_id, role_id, name, description, severity, status)
  select risk.process_id, risk.subprocess_id, risk.role_id, risk.name, risk.description, risk.severity, risk.status
  from (
    values
      (v_process, v_sp_web, v_role_web_tec, 'Falla web impide nuevas reservas', 'Si la web falla, no entran reservas.', 'critical'::public.criticality_level, 'active'::public.record_status),
      (v_process, v_sp_precio, v_role_revenue_comercial, 'Precio o descuento incorrecto', 'Precio incorrecto, descuento mal aplicado o perdida de revenue.', 'high'::public.criticality_level, 'active'::public.record_status),
      (v_process, v_sp_pago, v_role_web_pagos, 'Pago y reserva no coinciden', 'Cliente paga pero la reserva no queda confirmada, o reserva creada sin pago correcto.', 'critical'::public.criticality_level, 'active'::public.record_status),
      (v_process, v_sp_confirmacion, v_role_sistema_reservas, 'Reserva no visible para operacion', 'Cliente llega al estacionamiento y la operacion no ve la reserva.', 'critical'::public.criticality_level, 'active'::public.record_status),
      (v_process, v_sp_boleta, v_role_facturacion, 'Boleta no emitida', 'Cliente no recibe documento tributario o se generan reclamos.', 'high'::public.criticality_level, 'active'::public.record_status),
      (v_process, v_sp_banco_reservas, v_role_datos_control, 'Banco de Reservas incompleto', 'La operacion y gerencia toman decisiones con informacion incompleta o atrasada.', 'high'::public.criticality_level, 'active'::public.record_status),
      (v_process, v_sp_conciliacion, v_role_conciliacion, 'Diferencias de conciliacion financiera', 'Diferencias financieras, pagos no identificados o reservas pagadas sin cierre contable.', 'high'::public.criticality_level, 'active'::public.record_status)
  ) as risk(process_id, subprocess_id, role_id, name, description, severity, status)
  where not exists (
    select 1
    from public.risks existing
    where existing.process_id = risk.process_id
      and existing.subprocess_id = risk.subprocess_id
      and existing.name = risk.name
  );

  for v_risk in select id from public.risks where process_id = v_process and subprocess_id = v_sp_web and name = 'Falla web impide nuevas reservas'
  loop
    insert into public.controls (process_id, risk_id, owner_role_id, name, description, frequency, status)
    select v_process, v_risk, v_role_web_tec, 'Revision diaria de cotizacion y reserva web', 'Revisar diariamente que la web permita cotizar y reservar.', 'Diaria', 'active'::public.record_status
    where not exists (select 1 from public.controls where risk_id = v_risk and name = 'Revision diaria de cotizacion y reserva web');
  end loop;

  for v_risk in select id from public.risks where process_id = v_process and subprocess_id = v_sp_precio and name = 'Precio o descuento incorrecto'
  loop
    insert into public.controls (process_id, risk_id, owner_role_id, name, description, frequency, status)
    select v_process, v_risk, v_role_revenue_comercial, 'Revision de reglas comerciales y descuentos', 'Revisar reglas de precio, descuentos activos y promociones vigentes.', 'Diaria', 'active'::public.record_status
    where not exists (select 1 from public.controls where risk_id = v_risk and name = 'Revision de reglas comerciales y descuentos');
  end loop;

  for v_risk in select id from public.risks where process_id = v_process and subprocess_id = v_sp_pago and name = 'Pago y reserva no coinciden'
  loop
    insert into public.controls (process_id, risk_id, owner_role_id, name, description, frequency, status)
    select v_process, v_risk, v_role_web_pagos, 'Validacion de pagos aprobados contra reservas', 'Validar pagos aprobados contra reservas creadas.', 'Diaria', 'active'::public.record_status
    where not exists (select 1 from public.controls where risk_id = v_risk and name = 'Validacion de pagos aprobados contra reservas');
  end loop;

  for v_risk in select id from public.risks where process_id = v_process and subprocess_id = v_sp_confirmacion and name = 'Reserva no visible para operacion'
  loop
    insert into public.controls (process_id, risk_id, owner_role_id, name, description, frequency, status)
    select v_process, v_risk, v_role_sistema_reservas, 'Revision de reservas pagadas y confirmadas', 'Revisar reservas pagadas y confirmadas.', 'Diaria', 'active'::public.record_status
    where not exists (select 1 from public.controls where risk_id = v_risk and name = 'Revision de reservas pagadas y confirmadas');
  end loop;

  for v_risk in select id from public.risks where process_id = v_process and subprocess_id = v_sp_boleta and name = 'Boleta no emitida'
  loop
    insert into public.controls (process_id, risk_id, owner_role_id, name, description, frequency, status)
    select v_process, v_risk, v_role_facturacion, 'Revision de boletas emitidas y errores', 'Revisar boletas emitidas y errores de emision.', 'Diaria', 'active'::public.record_status
    where not exists (select 1 from public.controls where risk_id = v_risk and name = 'Revision de boletas emitidas y errores');
  end loop;

  for v_risk in select id from public.risks where process_id = v_process and subprocess_id = v_sp_banco_reservas and name = 'Banco de Reservas incompleto'
  loop
    insert into public.controls (process_id, risk_id, owner_role_id, name, description, frequency, status)
    select v_process, v_risk, v_role_datos_control, 'Actualizacion y validacion de Banco de Reservas', 'Actualizar y validar Banco de Reservas.', 'Diaria', 'active'::public.record_status
    where not exists (select 1 from public.controls where risk_id = v_risk and name = 'Actualizacion y validacion de Banco de Reservas');
  end loop;

  for v_risk in select id from public.risks where process_id = v_process and subprocess_id = v_sp_conciliacion and name = 'Diferencias de conciliacion financiera'
  loop
    insert into public.controls (process_id, risk_id, owner_role_id, name, description, frequency, status)
    select v_process, v_risk, v_role_conciliacion, 'Conciliacion Transbank contra banco', 'Conciliar Transbank contra banco de manera semanal o mensual.', 'Semanal o mensual', 'active'::public.record_status
    where not exists (select 1 from public.controls where risk_id = v_risk and name = 'Conciliacion Transbank contra banco');
  end loop;
end $$;
