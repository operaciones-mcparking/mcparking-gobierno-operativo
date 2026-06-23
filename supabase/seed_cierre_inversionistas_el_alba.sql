do $$
declare
  v_mcparking uuid;
  v_el_alba uuid;
  v_area_el_alba_admin uuid;
  v_area_mc_ops uuid;
  v_area_mc_finanzas uuid;
  v_area_mc_tesoreria uuid;
  v_area_mc_contabilidad uuid;
  v_area_mc_admin uuid;
  v_area_mc_tecnologia uuid;
  v_area_el_alba_inversionistas uuid;
  v_process uuid;

  v_role_admin_general uuid;
  v_role_operaciones_admin uuid;
  v_role_admin_finanzas uuid;
  v_role_finanzas_tesoreria uuid;
  v_role_tesoreria_contabilidad uuid;
  v_role_admin_inversionistas uuid;
  v_role_inversionista uuid;
  v_role_soporte_tecnico uuid;
  v_role_contabilidad uuid;

  v_sp_operacion uuid;
  v_sp_liquidaciones uuid;
  v_sp_cobranza uuid;
  v_sp_nominas uuid;
  v_sp_inversionistas uuid;
  v_sp_dashboard uuid;
  v_sp_auditoria uuid;
begin
  select id into v_mcparking from public.companies where name = 'McParking';
  select id into v_el_alba from public.companies where name = 'El Alba';

  if v_mcparking is null then
    insert into public.companies (name, description, status)
    values (
      'McParking',
      'Empresa operadora y prestadora de roles funcionales.',
      'active'::public.record_status
    )
    returning id into v_mcparking;
  else
    update public.companies
    set description = 'Empresa operadora y prestadora de roles funcionales.',
        status = 'active'::public.record_status
    where id = v_mcparking;
  end if;

  if v_el_alba is null then
    insert into public.companies (name, description, status)
    values (
      'El Alba',
      'Empresa duena del proceso y de la relacion con sus inversionistas.',
      'active'::public.record_status
    )
    returning id into v_el_alba;
  else
    update public.companies
    set description = 'Empresa duena del proceso y de la relacion con sus inversionistas.',
        status = 'active'::public.record_status
    where id = v_el_alba;
  end if;

  insert into public.company_relationships (
    provider_company_id,
    client_company_id,
    relationship_type,
    description,
    status
  )
  values (
    v_mcparking,
    v_el_alba,
    'service_client',
    'McParking opera y provee roles funcionales para procesos administrativos y financieros de El Alba.',
    'active'::public.record_status
  )
  on conflict (provider_company_id, client_company_id, relationship_type) do update
    set description = excluded.description,
        status = excluded.status;

  insert into public.areas (company_id, name, description, status)
  values
    (v_el_alba, 'Administracion', 'Area duena del proceso de cierre y liquidacion para inversionistas.', 'active'::public.record_status),
    (v_el_alba, 'Inversionistas', 'Usuarios finales que revisan liquidaciones, pagos, cobros y documentos.', 'active'::public.record_status),
    (v_mcparking, 'Operaciones', 'Equipo que cierra el resultado operacional mensual.', 'active'::public.record_status),
    (v_mcparking, 'Finanzas', 'Equipo que calcula liquidaciones, cobranza y saldos.', 'active'::public.record_status),
    (v_mcparking, 'Tesoreria', 'Equipo que ejecuta cobros, pagos y nominas.', 'active'::public.record_status),
    (v_mcparking, 'Contabilidad', 'Equipo que valida cuentas, asientos, Odoo y resultado operacional.', 'active'::public.record_status),
    (v_mcparking, 'Administracion', 'Equipo que administra inversionistas, contratos y usuarios.', 'active'::public.record_status),
    (v_mcparking, 'Tecnologia', 'Equipo que soporta integraciones, diagnosticos y configuracion.', 'active'::public.record_status)
  on conflict (company_id, name) do update
    set description = excluded.description,
        status = excluded.status;

  select id into v_area_el_alba_admin from public.areas where company_id = v_el_alba and name = 'Administracion';
  select id into v_area_el_alba_inversionistas from public.areas where company_id = v_el_alba and name = 'Inversionistas';
  select id into v_area_mc_ops from public.areas where company_id = v_mcparking and name = 'Operaciones';
  select id into v_area_mc_finanzas from public.areas where company_id = v_mcparking and name = 'Finanzas';
  select id into v_area_mc_tesoreria from public.areas where company_id = v_mcparking and name = 'Tesoreria';
  select id into v_area_mc_contabilidad from public.areas where company_id = v_mcparking and name = 'Contabilidad';
  select id into v_area_mc_admin from public.areas where company_id = v_mcparking and name = 'Administracion';
  select id into v_area_mc_tecnologia from public.areas where company_id = v_mcparking and name = 'Tecnologia';

  insert into public.roles (area_id, name, description, level, is_corporate, is_local, status)
  values
    (v_area_mc_admin, 'Administrador general', 'Rol con permiso funcional para administrar todo el flujo.', 'executive'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_mc_ops, 'Operaciones / Administracion', 'Rol dueno del cierre operacional mensual.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_mc_finanzas, 'Administracion / Finanzas', 'Rol dueno del calculo de liquidaciones y preparacion contable.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_mc_tesoreria, 'Finanzas / Tesoreria', 'Rol dueno de cobranza, PAC e intentos de cobro.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_mc_tesoreria, 'Tesoreria / Contabilidad', 'Rol dueno de pagos, nominas y control de duplicados.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_mc_admin, 'Administrador de inversionistas', 'Rol dueno de inversionistas, contratos, cuentas bancarias y usuarios de acceso.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_el_alba_inversionistas, 'Inversionista', 'Rol usuario final con acceso solo a informacion propia.', 'operational'::public.role_level, false, true, 'active'::public.record_status),
    (v_area_mc_tecnologia, 'Soporte tecnico', 'Rol dueno de debug, logs, integraciones y configuracion tecnica.', 'tactical'::public.role_level, true, false, 'active'::public.record_status),
    (v_area_mc_contabilidad, 'Contabilidad', 'Rol validador de cuentas contables, asientos, nominas y Odoo.', 'tactical'::public.role_level, true, false, 'active'::public.record_status)
  on conflict (area_id, name) do update
    set description = excluded.description,
        level = excluded.level,
        is_corporate = excluded.is_corporate,
        is_local = excluded.is_local,
        status = excluded.status;

  select id into v_role_admin_general from public.roles where area_id = v_area_mc_admin and name = 'Administrador general';
  select id into v_role_operaciones_admin from public.roles where area_id = v_area_mc_ops and name = 'Operaciones / Administracion';
  select id into v_role_admin_finanzas from public.roles where area_id = v_area_mc_finanzas and name = 'Administracion / Finanzas';
  select id into v_role_finanzas_tesoreria from public.roles where area_id = v_area_mc_tesoreria and name = 'Finanzas / Tesoreria';
  select id into v_role_tesoreria_contabilidad from public.roles where area_id = v_area_mc_tesoreria and name = 'Tesoreria / Contabilidad';
  select id into v_role_admin_inversionistas from public.roles where area_id = v_area_mc_admin and name = 'Administrador de inversionistas';
  select id into v_role_inversionista from public.roles where area_id = v_area_el_alba_inversionistas and name = 'Inversionista';
  select id into v_role_soporte_tecnico from public.roles where area_id = v_area_mc_tecnologia and name = 'Soporte tecnico';
  select id into v_role_contabilidad from public.roles where area_id = v_area_mc_contabilidad and name = 'Contabilidad';

  insert into public.processes (
    company_id,
    owner_company_id,
    operating_company_id,
    area_id,
    name,
    description,
    objective,
    expected_result,
    criticality,
    status,
    is_replicable,
    is_global,
    documentation_status
  )
  values (
    v_el_alba,
    v_el_alba,
    v_mcparking,
    v_area_el_alba_admin,
    'Cierre Operacional, Liquidacion y Cobranza a Inversionistas',
    'Plataforma de cierre operacional, liquidacion y cobranza a inversionistas. Ordena el flujo mensual desde el resultado operacional hasta liquidaciones, cobranza, nominas, dashboard y auditoria.',
    'Cerrar el resultado operacional mensual, calcular pagos o cobros por inversionista, ejecutar cobranza o nominas y dejar trazabilidad contable y operativa.',
    'Resultado operacional cerrado; liquidaciones calculadas; drafts contables preparados en Odoo; saldos negativos cobrados; saldos positivos pagados; inversionistas con informacion disponible; auditoria trazable.',
    'critical'::public.criticality_level,
    'active'::public.record_status,
    true,
    false,
    'draft'::public.documentation_status
  )
  on conflict (company_id, name) do update
    set owner_company_id = excluded.owner_company_id,
        operating_company_id = excluded.operating_company_id,
        area_id = excluded.area_id,
        description = excluded.description,
        objective = excluded.objective,
        expected_result = excluded.expected_result,
        criticality = excluded.criticality,
        status = excluded.status,
        is_replicable = excluded.is_replicable,
        is_global = excluded.is_global,
        documentation_status = excluded.documentation_status
  returning id into v_process;

  insert into public.process_clients (process_id, client_company_id, notes, status)
  values (
    v_process,
    v_el_alba,
    'Proceso propiedad de El Alba, operado con roles funcionales provistos por McParking.',
    'active'::public.record_status
  )
  on conflict (process_id, client_company_id) do update
    set notes = excluded.notes,
        status = excluded.status;

  insert into public.subprocesses (process_id, name, description, frequency, criticality, status, sort_order, impact_percent)
  values
    (v_process, 'Operacion', 'Actualizar resultado desde Odoo, clasificar movimientos, validar ingresos, gastos, margen y valor por estacionamiento, guardar resultado y cerrar periodo operacional.', 'Mensual', 'critical'::public.criticality_level, 'active'::public.record_status, 1, 18),
    (v_process, 'Liquidaciones', 'Generar liquidaciones, revisar contratos, revisar KPIs y cobranza, preparar asientos, crear drafts en Odoo, generar PAC y crear nomina de pagos.', 'Mensual', 'critical'::public.criticality_level, 'active'::public.record_status, 2, 22),
    (v_process, 'Cobranza', 'Ejecutar y auditar cobros a inversionistas con saldo negativo usando BancoEstado PAC, respuestas PAC, historial de intentos y futuros medios como Fintoc, Khipu o Transbank.', 'Mensual', 'high'::public.criticality_level, 'active'::public.record_status, 3, 16),
    (v_process, 'Pagos / Nominas', 'Pagar inversionistas con saldo positivo, seleccionar modo de pago, crear nomina en Odoo, revisar transacciones, abrir nomina y controlar duplicados.', 'Mensual', 'high'::public.criticality_level, 'active'::public.record_status, 4, 16),
    (v_process, 'Inversionistas', 'Mantener base maestra de inversionistas, contratos, unidades, cuentas bancarias, usuarios de acceso y cuenta contable por pagar 2102004.', 'Permanente', 'high'::public.criticality_level, 'active'::public.record_status, 5, 12),
    (v_process, 'Dashboard inversionista', 'Permitir al inversionista revisar liquidaciones, pagos, cobros, movimientos asociados, desempeno del parking y medios de pago propios.', 'Permanente', 'medium'::public.criticality_level, 'active'::public.record_status, 6, 8),
    (v_process, 'Debug / Auditoria', 'Revisar tutorial operativo mensual, diagnosticos, logs, pruebas de conexion y configuracion avanzada.', 'Segun necesidad', 'medium'::public.criticality_level, 'active'::public.record_status, 7, 8)
  on conflict (process_id, name) do update
    set description = excluded.description,
        frequency = excluded.frequency,
        criticality = excluded.criticality,
        status = excluded.status,
        sort_order = excluded.sort_order,
        impact_percent = excluded.impact_percent;

  select id into v_sp_operacion from public.subprocesses where process_id = v_process and name = 'Operacion';
  select id into v_sp_liquidaciones from public.subprocesses where process_id = v_process and name = 'Liquidaciones';
  select id into v_sp_cobranza from public.subprocesses where process_id = v_process and name = 'Cobranza';
  select id into v_sp_nominas from public.subprocesses where process_id = v_process and name = 'Pagos / Nominas';
  select id into v_sp_inversionistas from public.subprocesses where process_id = v_process and name = 'Inversionistas';
  select id into v_sp_dashboard from public.subprocesses where process_id = v_process and name = 'Dashboard inversionista';
  select id into v_sp_auditoria from public.subprocesses where process_id = v_process and name = 'Debug / Auditoria';

  insert into public.process_roles (process_id, subprocess_id, role_id, role_company_id, responsibility_type, impact_percent, criticality, is_required, notes)
  values
    (v_process, v_sp_operacion, v_role_operaciones_admin, v_mcparking, 'owner'::public.responsibility_type, 18, 'critical'::public.criticality_level, true, 'McParking provee el rol operativo para cerrar el resultado mensual de El Alba.'),
    (v_process, v_sp_operacion, v_role_contabilidad, v_mcparking, 'user'::public.responsibility_type, 18, 'critical'::public.criticality_level, true, 'Contabilidad valida resultado operacional y Odoo.'),
    (v_process, v_sp_liquidaciones, v_role_admin_finanzas, v_mcparking, 'owner'::public.responsibility_type, 22, 'critical'::public.criticality_level, true, 'McParking provee administracion y finanzas para calcular liquidaciones.'),
    (v_process, v_sp_liquidaciones, v_role_contabilidad, v_mcparking, 'user'::public.responsibility_type, 22, 'critical'::public.criticality_level, true, 'Contabilidad revisa asientos y drafts.'),
    (v_process, v_sp_cobranza, v_role_finanzas_tesoreria, v_mcparking, 'owner'::public.responsibility_type, 16, 'high'::public.criticality_level, true, 'Tesoreria ejecuta y audita cobros PAC.'),
    (v_process, v_sp_cobranza, v_role_contabilidad, v_mcparking, 'user'::public.responsibility_type, 16, 'high'::public.criticality_level, true, 'Contabilidad valida asientos de cobranza.'),
    (v_process, v_sp_nominas, v_role_tesoreria_contabilidad, v_mcparking, 'owner'::public.responsibility_type, 16, 'high'::public.criticality_level, true, 'Tesoreria y contabilidad preparan pagos a saldos positivos.'),
    (v_process, v_sp_nominas, v_role_admin_finanzas, v_mcparking, 'user'::public.responsibility_type, 16, 'high'::public.criticality_level, true, 'Finanzas revisa saldos y liquidaciones antes de pagar.'),
    (v_process, v_sp_inversionistas, v_role_admin_inversionistas, v_mcparking, 'owner'::public.responsibility_type, 12, 'high'::public.criticality_level, true, 'McParking administra la base maestra para El Alba.'),
    (v_process, v_sp_inversionistas, v_role_admin_general, v_mcparking, 'backup'::public.responsibility_type, null, 'high'::public.criticality_level, true, 'Administrador general puede respaldar mantencion sensible.'),
    (v_process, v_sp_dashboard, v_role_inversionista, v_el_alba, 'owner'::public.responsibility_type, 8, 'medium'::public.criticality_level, true, 'El usuario final pertenece al universo de inversionistas de El Alba.'),
    (v_process, v_sp_dashboard, v_role_admin_inversionistas, v_mcparking, 'consulted'::public.responsibility_type, null, 'medium'::public.criticality_level, true, 'Administracion gestiona accesos y soporte funcional.'),
    (v_process, v_sp_auditoria, v_role_soporte_tecnico, v_mcparking, 'owner'::public.responsibility_type, 8, 'medium'::public.criticality_level, true, 'Soporte tecnico revisa integraciones, logs y diagnosticos.'),
    (v_process, v_sp_auditoria, v_role_admin_general, v_mcparking, 'user'::public.responsibility_type, 8, 'medium'::public.criticality_level, true, 'Administrador general revisa auditoria y configuracion avanzada.')
  on conflict (process_id, subprocess_id, role_id, responsibility_type) do update
    set role_company_id = excluded.role_company_id,
        impact_percent = excluded.impact_percent,
        criticality = excluded.criticality,
        is_required = excluded.is_required,
        notes = excluded.notes;

  insert into public.systems (name, description, status)
  values
    ('Plataforma de Inversionistas', 'Sistema principal para cierre, liquidacion, cobranza, nominas y dashboard inversionista.', 'active'::public.record_status),
    ('Odoo', 'Sistema contable y operacional usado para resultados, asientos y nominas.', 'active'::public.record_status),
    ('BancoEstado PAC', 'Medio de cobranza PAC para inversionistas con saldo negativo.', 'active'::public.record_status),
    ('Fintoc', 'Medio futuro para pagos o cobranza bancaria.', 'active'::public.record_status),
    ('Khipu', 'Medio futuro para cobranza o pagos asistidos.', 'active'::public.record_status),
    ('Transbank', 'Medio de pago o cobranza potencial.', 'active'::public.record_status)
  on conflict (name) do update
    set description = excluded.description,
        status = excluded.status;

  delete from public.process_systems where process_id = v_process;

  insert into public.process_systems (process_id, subprocess_id, system_id, notes)
  select v_process, v_sp_operacion, id, 'Sistema usado para resultado operacional y cierre mensual.'
  from public.systems where name in ('Plataforma de Inversionistas', 'Odoo')
  union all
  select v_process, v_sp_liquidaciones, id, 'Sistema usado para liquidaciones, asientos y PAC.'
  from public.systems where name in ('Plataforma de Inversionistas', 'Odoo', 'BancoEstado PAC')
  union all
  select v_process, v_sp_cobranza, id, 'Sistema usado para cobranza y medios actuales o futuros.'
  from public.systems where name in ('Plataforma de Inversionistas', 'BancoEstado PAC', 'Fintoc', 'Khipu', 'Transbank')
  union all
  select v_process, v_sp_nominas, id, 'Sistema usado para nominas y pagos.'
  from public.systems where name in ('Plataforma de Inversionistas', 'Odoo')
  union all
  select v_process, v_sp_inversionistas, id, 'Sistema usado como base maestra de inversionistas.'
  from public.systems where name in ('Plataforma de Inversionistas', 'Odoo')
  union all
  select v_process, v_sp_dashboard, id, 'Sistema visible para inversionistas de El Alba.'
  from public.systems where name in ('Plataforma de Inversionistas')
  union all
  select v_process, v_sp_auditoria, id, 'Sistema auditado en diagnosticos, logs e integraciones.'
  from public.systems where name in ('Plataforma de Inversionistas', 'Odoo', 'BancoEstado PAC');

  delete from public.controls
  where process_id = v_process
    and risk_id in (select id from public.risks where process_id = v_process);

  delete from public.risks where process_id = v_process;

  insert into public.risks (process_id, subprocess_id, role_id, name, description, severity, status)
  values
    (v_process, v_sp_operacion, v_role_operaciones_admin, 'Resultado operacional incorrecto', 'Ingresos, gastos, margen o valor por estacionamiento pueden quedar mal clasificados.', 'critical'::public.criticality_level, 'active'::public.record_status),
    (v_process, v_sp_liquidaciones, v_role_admin_finanzas, 'Liquidacion mal calculada', 'Contratos, KPIs, cobranza o asientos pueden generar pago o cobro incorrecto.', 'critical'::public.criticality_level, 'active'::public.record_status),
    (v_process, v_sp_cobranza, v_role_finanzas_tesoreria, 'Cobranza PAC no conciliada', 'Intentos o respuestas PAC pueden no quedar auditados contra saldos negativos.', 'high'::public.criticality_level, 'active'::public.record_status),
    (v_process, v_sp_nominas, v_role_tesoreria_contabilidad, 'Nomina duplicada o incorrecta', 'Pagos a inversionistas con saldo positivo pueden duplicarse o emitirse con saldos incorrectos.', 'high'::public.criticality_level, 'active'::public.record_status),
    (v_process, v_sp_inversionistas, v_role_admin_inversionistas, 'Dato maestro sensible incorrecto', 'Contratos, cuentas bancarias, unidades o usuarios pueden quedar desactualizados.', 'high'::public.criticality_level, 'active'::public.record_status),
    (v_process, v_sp_dashboard, v_role_inversionista, 'Informacion incorrecta al inversionista', 'El inversionista puede ver liquidaciones, pagos, cobros o movimientos no actualizados.', 'medium'::public.criticality_level, 'active'::public.record_status),
    (v_process, v_sp_auditoria, v_role_soporte_tecnico, 'Error tecnico no detectado', 'Integraciones, logs o configuraciones pueden fallar sin trazabilidad suficiente.', 'medium'::public.criticality_level, 'active'::public.record_status);

  insert into public.controls (process_id, risk_id, owner_role_id, name, description, frequency, status)
  select v_process, r.id, v_role_contabilidad, 'Revision mensual de resultado y asientos', 'Validar resultado operacional, cuentas contables y Odoo antes del cierre.', 'Mensual', 'active'::public.record_status
  from public.risks r where r.process_id = v_process and r.name = 'Resultado operacional incorrecto'
  union all
  select v_process, r.id, v_role_admin_finanzas, 'Revision de liquidaciones contra contratos y KPIs', 'Validar contratos, KPIs, saldos y drafts antes de publicar liquidaciones.', 'Mensual', 'active'::public.record_status
  from public.risks r where r.process_id = v_process and r.name = 'Liquidacion mal calculada'
  union all
  select v_process, r.id, v_role_finanzas_tesoreria, 'Conciliacion de respuestas PAC', 'Comparar universo PAC, intentos, respuestas y asientos de cobranza.', 'Mensual', 'active'::public.record_status
  from public.risks r where r.process_id = v_process and r.name = 'Cobranza PAC no conciliada'
  union all
  select v_process, r.id, v_role_tesoreria_contabilidad, 'Control de duplicados en nomina', 'Revisar transacciones y nomina en Odoo antes de ejecutar pagos.', 'Por nomina', 'active'::public.record_status
  from public.risks r where r.process_id = v_process and r.name = 'Nomina duplicada o incorrecta'
  union all
  select v_process, r.id, v_role_admin_inversionistas, 'Validacion de datos maestros sensibles', 'Controlar cambios en contratos, cuentas bancarias, usuarios y cuenta 2102004.', 'Permanente', 'active'::public.record_status
  from public.risks r where r.process_id = v_process and r.name = 'Dato maestro sensible incorrecto'
  union all
  select v_process, r.id, v_role_admin_inversionistas, 'Revision antes de publicar dashboard', 'Validar que liquidaciones, pagos, cobros y documentos correspondan al inversionista.', 'Mensual', 'active'::public.record_status
  from public.risks r where r.process_id = v_process and r.name = 'Informacion incorrecta al inversionista'
  union all
  select v_process, r.id, v_role_soporte_tecnico, 'Revision de logs e integraciones', 'Ejecutar diagnosticos, pruebas de conexion y revision de errores.', 'Segun necesidad', 'active'::public.record_status
  from public.risks r where r.process_id = v_process and r.name = 'Error tecnico no detectado';
end $$;
