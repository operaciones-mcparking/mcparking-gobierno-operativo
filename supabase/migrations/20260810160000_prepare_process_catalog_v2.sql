-- Prepare McParking process catalog v2.
-- DO NOT APPLY until ETAPA 3 is explicitly approved.
--
-- Design goals:
-- - Keep historical rows by archiving instead of deleting.
-- - Reuse existing process ids when reusable process names already exist.
-- - Add the minimal ficha fields missing from processes.
-- - Load exactly 19 active master processes.
-- - Load ficha fields from Fuente A (Manual Completo de Fichas de Proceso V2 - McParking.docx).
-- - Load stages from Fuente B (procesos.docx).
-- - Create process role links only for exact existing role matches.

begin;

alter table public.processes
  add column if not exists inputs_providers text,
  add column if not exists outputs_clients text,
  add column if not exists basic_kpi text;

create temporary table _process_catalog_v2 (
  canonical_key text primary key,
  process_number integer not null,
  name text not null unique,
  process_type text not null check (process_type in ('strategic', 'operational', 'support')),
  owner_company_name text not null,
  operating_company_name text not null,
  area_name text,
  owner_role_name text not null,
  description text,
  objective text not null,
  expected_result text,
  inputs_providers text not null,
  outputs_clients text not null,
  basic_kpi text not null
) on commit drop;

insert into _process_catalog_v2 (
  canonical_key,
  process_number,
  name,
  process_type,
  owner_company_name,
  operating_company_name,
  area_name,
  owner_role_name,
  description,
  objective,
  expected_result,
  inputs_providers,
  outputs_clients,
  basic_kpi
)
values
  ('revenue_management', 1, 'Revenue Management', 'strategic', 'McParking', 'McParking', 'Revenue', 'Responsable Revenue / Analista Revenue', null, 'Optimizar la estructura tarifaria de las concesiones mediante el análisis dinámico de la oferta, demanda y ocupación para maximizar los ingresos y el ADR.', null, 'Métricas de ocupación, reportes de base de datos (Analista Datos TI), presupuestos y lineamientos del negocio (Gerente General).', 'Estructura de precios actualizada, reglas de negocio de descuentos. (Clientes: Canal de Reserva Online, TI / Comercial).', 'ADR (Tarifa Promedio Diaria) e Ingreso Total Mensual por Concesión.'),
  ('direccion_planificacion_operacional', 2, 'Dirección y Planificación Operacional', 'strategic', 'McParking', 'McParking', 'Direccion', 'Gerente General', null, 'Definir el rumbo de la operación del holding, evaluar brechas de rendimiento y tomar decisiones operacionales estratégicas para la expansión.', null, 'Reportes de capacidad (Jefe Operaciones), estados de resultados (Gerente Finanzas).', 'Planes de acción operacionales, metas de crecimiento anual. (Clientes: Todo el equipo directivo y operacional).', '% de cumplimiento de objetivos estratégicos anuales y tasa de crecimiento regional.'),
  ('estrategia_comercial_alianzas', 3, 'Estrategia Comercial y Alianzas', 'strategic', 'McParking', 'McParking', 'Tecnologia / Comercial', 'TI / Comercial', null, 'Negociar y habilitar alianzas con bancos, convenios corporativos y canales externos para incrementar el flujo de clientes.', null, 'Requerimientos comerciales de expansión (Gerente General), propuestas tarifarias (Revenue Management).', 'Contratos de convenio vigentes, integraciones comerciales funcionales. (Clientes: Clientes finales, Canales de reserva).', '% de reservas provenientes de convenios y alianzas comerciales.'),
  ('planificacion_capacidad_ocupacion', 4, 'Planificación de Capacidad y Ocupación', 'strategic', 'McParking', 'McParking', 'Datos', 'Jefe Operaciones', null, 'Prever y gestionar el inventario físico de estacionamientos libres, mitigando cuellos de botella operativos en fechas de alta demanda (peak dates).', null, 'Datos de tendencias y reservas futuras (Revenue Management, Analista Datos TI).', 'Plan de distribución física de espacios, alertas de sobreocupación. (Clientes: Operación en patio, Canales de venta).', 'Factor de utilización del recinto físico durante fechas críticas o festivos.'),
  ('reservas_mcparking', 5, 'Reservas McParking', 'operational', 'McParking', 'McParking', 'Operaciones', 'Jefe Operaciones', null, 'Gestionar de forma interna la cotización, aplicación de promociones y registro formal de reservas solicitadas por canales directos.', null, 'Solicitudes directas de clientes (Atención al Cliente), lineamientos técnicos (TI / Comercial).', 'Comprobante de reserva emitido y validado, registro en la base de datos de patio. (Clientes: Cliente final, Operación check-in).', 'Tiempo promedio de procesamiento y emisión del comprobante de reserva.'),
  ('cotizacion_reserva_online', 6, 'Cotización y Reserva Online', 'operational', 'McParking', 'McParking', 'Servicio', 'TI / Comercial', null, 'Garantizar la disponibilidad del canal web para que los clientes finales realicen cotizaciones autónomas y cierren reservas de forma digital.', null, 'Tarifas cargadas en backend (Revenue Management), plataforma en línea operativa (Sistemas y datos).', 'Reserva autogestionada confirmada, pasarela de pago procesada de forma correcta. (Clientes: Clientes finales, Atención al cliente).', 'Tasa de conversión de visitas de la web a reservas concretadas (% Conversión).'),
  ('check_in_recepcion_vehiculo', 7, 'Check-in y Recepción del Vehículo', 'operational', 'McParking', 'McParking', 'Operaciones', 'Jefe Operaciones', null, 'Validar el ingreso de los clientes al estacionamiento, verificando sus datos, patente y entregando las instrucciones correspondientes de seguridad.', null, 'Cliente en portería de acceso, reserva válida en sistema (Atención al Cliente / Canales Online).', 'Vehículo ingresado a patio, cliente registrado y listo para el traslado. (Clientes: Proceso de Custodia, Pasajeros del Shuttle).', 'Tiempo medio de ciclo del check-in por cliente (en minutos).'),
  ('custodia_vehiculo', 8, 'Custodia del Vehículo', 'operational', 'McParking', 'McParking', 'Operaciones', 'Jefe Operaciones', null, 'Garantizar la protección perimetral e integridad de los automóviles resguardados en patio mediante controles internos y monitoreo tecnológico activo.', null, 'Vehículo recepcionado y parqueado (Equipo Operativo), mantención de cámaras e iluminación al día (Obras Civiles).', 'Vehículo mantenido sin siniestros durante el periodo de permanencia. (Clientes: Proceso de Check-out / Cliente final).', 'Índice de siniestros o incidentes de seguridad reportados en patio (Meta: 0%).'),
  ('traslado_aeropuerto', 9, 'Traslado al Aeropuerto', 'operational', 'McParking', 'McParking', 'Operaciones', 'Jefe Operaciones', null, 'Asegurar el transporte seguro, cómodo y a tiempo de los pasajeros y sus equipajes desde el parking hacia los terminales de salida del aeropuerto.', null, 'Clientes con check-in finalizado, disponibilidad de vehículos del tipo shuttle (Equipo Operativo).', 'Pasajeros desembarcados conformes en el aeropuerto, registro de salida de la van. (Clientes: Clientes finales).', 'Tiempo de espera promedio del cliente para el abordaje del shuttle.'),
  ('atencion_cliente_operacional', 10, 'Atención al Cliente Operacional', 'operational', 'McParking', 'McParking', 'Servicio', 'Atención al Cliente', null, 'Resolver de forma ágil todas las solicitudes diarias de información, cambios de vuelos, reclamos o atrasos notificados por los usuarios.', null, 'Consultas y requerimientos por canales presenciales o digitales (Clientes finales), soporte de contingencias (Jefe Operaciones).', 'Respuestas entregadas, cambios ingresados al sistema operativo. (Clientes: Cliente final, Personal de patio).', 'Nivel de satisfacción del cliente (CSAT) posterior a la atención.'),
  ('check_out_entrega_vehiculo', 11, 'Check-out y Entrega del Vehículo', 'operational', 'McParking', 'McParking', 'Servicio', 'Jefe Operaciones', null, 'Gestionar el retorno de los clientes desde el aeropuerto, la verificación de su cuenta y la restitución conforme de su vehículo para el cierre del ciclo del servicio.', null, 'Solicitud de recogida por aterrizaje (Cliente), estatus de cuenta al día (Atención al Cliente).', 'Vehículo entregado al propietario en portería, liberación de plaza en sistema. (Clientes: Cliente final, Finanzas).', 'Tiempo transcurrido desde la solicitud de recogida en aeropuerto hasta la entrega efectiva de la llave.'),
  ('gestion_incidencias_operativas', 12, 'Gestión de Incidencias Operativas', 'operational', 'McParking', 'McParking', 'Operaciones', 'Jefe Operaciones', null, 'Detectar, controlar y documentar desviaciones operacionales urgentes o eventos no deseados en patio para mitigar perjuicios económicos y de reputación.', null, 'Fallas detectadas o reportes de siniestros en recintos (Equipo Operativo, Atención al Cliente), asesoría corporativa (Gerente General).', 'Incidente resuelto, informe técnico de cierre, planes de remediación aplicados. (Clientes: Afectados, Aseguradoras).', 'Tiempo medio de resolución de incidencias operacionales (en horas).'),
  ('cierre_operacional_liquidacion_cobranza_inversionistas', 13, 'Cierre Operacional, Liquidación y Cobranza a Inversionistas', 'support', 'El Alba', 'McParking', 'Administracion', 'Gerente Finanzas', null, 'Consolidar las transacciones y cierres de caja de las concesiones para calcular, respaldar y emitir las liquidaciones financieras de los inversionistas asociados.', null, 'Cierres operacionales validados (Analista Contable), directrices de distribución societaria (Gerente General).', 'Informes de liquidación despachados, transferencias de fondos ejecutadas. (Clientes: Inversionistas del Holding).', 'Días de desfase en el pago de liquidaciones mensuales post-cierre de mes.'),
  ('finanzas_contabilidad', 14, 'Finanzas y Contabilidad', 'support', 'McParking', 'McParking', 'Finanzas', 'Analista Contable', null, 'Registrar la totalidad de hechos económicos de McParking, controlando la facturación, conciliación bancaria y la preparación de estados financieros legales.', null, 'Cartolas bancarias, facturas de compras (Proveedores), registros de ingresos devengados (Gerente Finanzas).', 'Balances mensuales de la empresa, pagos de impuestos al día, registros contables auditados. (Clientes: Gerencia General, Entidades Fiscalizadoras).', '% de transacciones bancarias conciliadas antes del cierre mensual de cuentas.'),
  ('sistemas_datos', 15, 'Sistemas y Datos', 'support', 'McParking', 'McParking', 'Datos', 'Analista Datos TI', null, 'Asegurar la estabilidad tecnológica de los sistemas operativos del negocio, la calidad de la base de datos centralizada y dar soporte técnico general al hardware/software.', null, 'Reportes de fallas o incidencias de software/hardware (Todo el equipo), requerimientos funcionales (TI / Comercial).', 'Plataforma de reservas con alto porcentaje de uptime, reportes analíticos de BI e integraciones operativas. (Clientes: Revenue, Operaciones).', 'Disponibilidad de la plataforma de reservas (% Uptime mensual del sistema).'),
  ('infraestructura_mantenciones', 16, 'Infraestructura y Mantenciones', 'support', 'McParking', 'McParking', 'Infraestructura', 'Obras Civiles', null, 'Mantener en estado óptimo las instalaciones físicas de los estacionamientos (cámaras, barreras de acceso, iluminación y señalética) resguardando la continuidad operacional.', null, 'Plan de mantención preventiva, solicitudes de reparación reactivas por fallas (Jefe Operaciones).', 'Infraestructura e instalaciones operando bajo estándares de seguridad corporativos. (Clientes: Operación en patio, Clientes finales).', '% de cumplimiento del plan de mantenimiento preventivo de los recintos.'),
  ('personas_turnos', 17, 'Personas y Turnos', 'support', 'McParking', 'McParking', 'Operaciones', 'Encargado de Turnos / Personas', null, 'Planificar y controlar la asignación de turnos del personal en patio y conductores, cubriendo ausencias para garantizar la dotación en periodos peak.', null, 'Proyecciones de volumen de clientes y vuelos (Jefe Operaciones), reportes de licencias o vacaciones.', 'Malla de turnos semanales/mensuales publicada, registros consolidados de asistencia. (Clientes: Personal operativo).', 'Tasa de ausentismo no programado y cobertura de dotación en turnos críticos.'),
  ('gestion_proveedores', 18, 'Gestión de Proveedores', 'support', 'McParking', 'McParking', 'Contabilidad', 'Encargado de Proveedores', null, 'Evaluar, cotizar y comprar insumos críticos o contratar servicios de terceros en las condiciones más eficientes de costo, calidad y plazos.', null, 'Requerimientos de compras o repuestos (Operaciones, Finanzas), propuestas técnicas de proveedores del mercado.', 'Órdenes de compra validadas, contratos comerciales suscritos con terceros. (Clientes: Finanzas, Operaciones).', '% de proveedores críticos evaluados con nivel de cumplimiento conforme.'),
  ('control_documental_administracion', 19, 'Control Documental y Administración', 'support', 'McParking', 'McParking', 'Contabilidad', 'Analista Contable', null, 'Garantizar la integridad jurídica e institucional del holding mediante el archivo ordenado de contratos de concesión, pólizas de seguros y evidencias de auditorías.', null, 'Contratos firmados, actas corporativas, documentos tributarios (Gerente Finanzas).', 'Repositorio digital y físico indexado, reportes internos de cumplimiento de vigencias. (Clientes: Gerencia General, Auditores).', 'Tiempo de búsqueda y disponibilidad de documentos legales críticos (Meta: inmediato).');

create temporary table _process_catalog_v2_stage (
  canonical_key text not null references _process_catalog_v2(canonical_key),
  sort_order integer not null,
  name text not null,
  description text,
  criticality public.criticality_level,
  primary key (canonical_key, name)
) on commit drop;

insert into _process_catalog_v2_stage (canonical_key, sort_order, name, description, criticality)
values
  ('revenue_management', 1, 'Revision ocupacion', null, null),
  ('revenue_management', 2, 'Analisis demanda', null, null),
  ('revenue_management', 3, 'Definicion precios', null, null),
  ('revenue_management', 4, 'Revision descuentos', null, null),
  ('revenue_management', 5, 'Seguimiento ADR/ingresos', null, null),
  ('direccion_planificacion_operacional', 1, 'Definir prioridades', null, null),
  ('direccion_planificacion_operacional', 2, 'Revisar capacidad', null, null),
  ('direccion_planificacion_operacional', 3, 'Revisar brechas', null, null),
  ('direccion_planificacion_operacional', 4, 'Tomar decisiones operativas', null, null),
  ('estrategia_comercial_alianzas', 1, 'Bancos', null, null),
  ('estrategia_comercial_alianzas', 2, 'Convenios', null, null),
  ('estrategia_comercial_alianzas', 3, 'Campanas', null, null),
  ('estrategia_comercial_alianzas', 4, 'Descuentos', null, null),
  ('estrategia_comercial_alianzas', 5, 'Canales comerciales', null, null),
  ('planificacion_capacidad_ocupacion', 1, 'Revisar ocupacion futura', null, null),
  ('planificacion_capacidad_ocupacion', 2, 'Capacidad disponible', null, null),
  ('planificacion_capacidad_ocupacion', 3, 'Peak dates', null, null),
  ('planificacion_capacidad_ocupacion', 4, 'Restricciones operativas', null, null),
  ('reservas_mcparking', 1, 'Cotizacion', null, null),
  ('reservas_mcparking', 2, 'Seleccion fechas', null, null),
  ('reservas_mcparking', 3, 'Aplicacion descuentos', null, null),
  ('reservas_mcparking', 4, 'Confirmacion', null, null),
  ('reservas_mcparking', 5, 'Pago', null, null),
  ('reservas_mcparking', 6, 'Envio de comprobante', null, null),
  ('cotizacion_reserva_online', 1, 'Cliente consulta precio', null, null),
  ('cotizacion_reserva_online', 2, 'Elige fechas', null, null),
  ('cotizacion_reserva_online', 3, 'Revisa disponibilidad', null, null),
  ('cotizacion_reserva_online', 4, 'Inicia reserva', null, null),
  ('check_in_recepcion_vehiculo', 1, 'Validar reserva', null, null),
  ('check_in_recepcion_vehiculo', 2, 'Recibir cliente', null, null),
  ('check_in_recepcion_vehiculo', 3, 'Registrar ingreso', null, null),
  ('check_in_recepcion_vehiculo', 4, 'Revisar patente/datos', null, null),
  ('check_in_recepcion_vehiculo', 5, 'Entregar instrucciones', null, null),
  ('custodia_vehiculo', 1, 'Ubicacion vehiculo', null, null),
  ('custodia_vehiculo', 2, 'Control interno', null, null),
  ('custodia_vehiculo', 3, 'Resguardo', null, null),
  ('custodia_vehiculo', 4, 'Monitoreo', null, null),
  ('custodia_vehiculo', 5, 'Manejo de incidentes', null, null),
  ('traslado_aeropuerto', 1, 'Coordinar shuttle', null, null),
  ('traslado_aeropuerto', 2, 'Cargar pasajeros/equipaje', null, null),
  ('traslado_aeropuerto', 3, 'Traslado al terminal', null, null),
  ('traslado_aeropuerto', 4, 'Registrar salida', null, null),
  ('atencion_cliente_operacional', 1, 'Resolver dudas', null, null),
  ('atencion_cliente_operacional', 2, 'Cambios', null, null),
  ('atencion_cliente_operacional', 3, 'Atrasos', null, null),
  ('atencion_cliente_operacional', 4, 'Reclamos', null, null),
  ('atencion_cliente_operacional', 5, 'Coordinacion con operacion', null, null),
  ('check_out_entrega_vehiculo', 1, 'Solicitud retorno', null, null),
  ('check_out_entrega_vehiculo', 2, 'Traslado desde aeropuerto', null, null),
  ('check_out_entrega_vehiculo', 3, 'Validacion salida', null, null),
  ('check_out_entrega_vehiculo', 4, 'Entrega vehiculo', null, null),
  ('check_out_entrega_vehiculo', 5, 'Cierre atencion', null, null),
  ('gestion_incidencias_operativas', 1, 'Detectar problema', null, null),
  ('gestion_incidencias_operativas', 2, 'Registrar caso', null, null),
  ('gestion_incidencias_operativas', 3, 'Coordinar solucion', null, null),
  ('gestion_incidencias_operativas', 4, 'Informar cliente', null, null),
  ('gestion_incidencias_operativas', 5, 'Cerrar incidente', null, null),
  ('cierre_operacional_liquidacion_cobranza_inversionistas', 1, 'Consolidar operacion', null, null),
  ('cierre_operacional_liquidacion_cobranza_inversionistas', 2, 'Revisar ingresos', null, null),
  ('cierre_operacional_liquidacion_cobranza_inversionistas', 3, 'Calcular liquidaciones', null, null),
  ('cierre_operacional_liquidacion_cobranza_inversionistas', 4, 'Preparar pagos', null, null),
  ('cierre_operacional_liquidacion_cobranza_inversionistas', 5, 'Respaldar informacion', null, null),
  ('finanzas_contabilidad', 1, 'Conciliacion bancaria', null, null),
  ('finanzas_contabilidad', 2, 'Facturacion', null, null),
  ('finanzas_contabilidad', 3, 'Pagos proveedores', null, null),
  ('finanzas_contabilidad', 4, 'Control gastos', null, null),
  ('finanzas_contabilidad', 5, 'Estados financieros', null, null),
  ('sistemas_datos', 1, 'Mantencion plataforma', null, null),
  ('sistemas_datos', 2, 'Reportes', null, null),
  ('sistemas_datos', 3, 'Integraciones', null, null),
  ('sistemas_datos', 4, 'Calidad de datos', null, null),
  ('sistemas_datos', 5, 'Soporte tecnico', null, null),
  ('infraestructura_mantenciones', 1, 'Mantencion terreno', null, null),
  ('infraestructura_mantenciones', 2, 'Senaletica', null, null),
  ('infraestructura_mantenciones', 3, 'Camaras', null, null),
  ('infraestructura_mantenciones', 4, 'Portones', null, null),
  ('infraestructura_mantenciones', 5, 'Iluminacion', null, null),
  ('infraestructura_mantenciones', 6, 'Mejoras fisicas', null, null),
  ('personas_turnos', 1, 'Planificar turnos', null, null),
  ('personas_turnos', 2, 'Asistencia', null, null),
  ('personas_turnos', 3, 'Reemplazos', null, null),
  ('personas_turnos', 4, 'Necesidades operativas', null, null),
  ('personas_turnos', 5, 'Coordinacion equipo', null, null),
  ('gestion_proveedores', 1, 'Cotizaciones', null, null),
  ('gestion_proveedores', 2, 'Compras', null, null),
  ('gestion_proveedores', 3, 'Seguimiento servicios', null, null),
  ('gestion_proveedores', 4, 'Pagos', null, null),
  ('gestion_proveedores', 5, 'Evaluacion proveedores', null, null),
  ('control_documental_administracion', 1, 'Contratos', null, null),
  ('control_documental_administracion', 2, 'Respaldos', null, null),
  ('control_documental_administracion', 3, 'Documentos tributarios', null, null),
  ('control_documental_administracion', 4, 'Carpetas', null, null),
  ('control_documental_administracion', 5, 'Evidencias', null, null),
  ('control_documental_administracion', 6, 'Auditoria interna', null, null);

create temporary table _process_catalog_v2_support_role (
  canonical_key text not null references _process_catalog_v2(canonical_key),
  requested_role_name text not null,
  responsibility_type public.responsibility_type not null default 'consulted',
  primary key (canonical_key, requested_role_name, responsibility_type)
) on commit drop;

insert into _process_catalog_v2_support_role (canonical_key, requested_role_name)
values
  ('revenue_management', 'Gerente General'),
  ('revenue_management', 'Analista Datos TI'),
  ('direccion_planificacion_operacional', 'Jefe Operaciones'),
  ('direccion_planificacion_operacional', 'Gerente Finanzas'),
  ('estrategia_comercial_alianzas', 'Gerente General'),
  ('estrategia_comercial_alianzas', 'Revenue'),
  ('planificacion_capacidad_ocupacion', 'Revenue'),
  ('planificacion_capacidad_ocupacion', 'Analista Datos TI'),
  ('reservas_mcparking', 'Atencion al Cliente'),
  ('reservas_mcparking', 'TI / Comercial'),
  ('cotizacion_reserva_online', 'Revenue'),
  ('cotizacion_reserva_online', 'Atencion al Cliente'),
  ('check_in_recepcion_vehiculo', 'Atencion al Cliente'),
  ('custodia_vehiculo', 'Obras Civiles'),
  ('custodia_vehiculo', 'Equipo Operativo'),
  ('traslado_aeropuerto', 'Equipo Operativo'),
  ('atencion_cliente_operacional', 'Jefe Operaciones'),
  ('check_out_entrega_vehiculo', 'Atencion al Cliente'),
  ('gestion_incidencias_operativas', 'Atencion al Cliente'),
  ('gestion_incidencias_operativas', 'Gerente General'),
  ('cierre_operacional_liquidacion_cobranza_inversionistas', 'Analista Contable'),
  ('cierre_operacional_liquidacion_cobranza_inversionistas', 'Gerente General'),
  ('finanzas_contabilidad', 'Gerente Finanzas'),
  ('sistemas_datos', 'TI / Comercial'),
  ('infraestructura_mantenciones', 'Jefe Operaciones'),
  ('personas_turnos', 'Jefe Operaciones'),
  ('gestion_proveedores', 'Finanzas'),
  ('gestion_proveedores', 'Operaciones'),
  ('control_documental_administracion', 'Gerente Finanzas');

-- Exact-safe role aliases. Ambiguous/missing requested roles are intentionally not mapped here.
create temporary table _process_catalog_v2_role_alias (
  requested_role_name text primary key,
  matched_role_name text,
  match_type text not null check (match_type in ('exact', 'probable', 'missing', 'ambiguous')),
  notes text
) on commit drop;

insert into _process_catalog_v2_role_alias (requested_role_name, matched_role_name, match_type, notes)
values
  ('Gerente General', 'Gerente General', 'exact', null),
  ('TI / Comercial', 'TI / Comercial', 'exact', null),
  ('Jefe Operaciones', 'Jefe Operaciones', 'exact', null),
  ('Atención al Cliente', 'Atencion al Cliente', 'exact', 'Same role; DB currently stores the ASCII spelling.'),
  ('Atencion al Cliente', 'Atencion al Cliente', 'exact', null),
  ('Gerente Finanzas', 'Gerente Finanzas', 'exact', null),
  ('Analista Contable', 'Analista Contable', 'exact', null),
  ('Analista Datos TI', 'Analista Datos TI', 'exact', null),
  ('Obras Civiles', 'Obras Civiles', 'exact', null),
  ('Responsable Revenue / Analista Revenue', 'Responsable Revenue / Analista Revenue', 'exact', 'Created idempotently by catalog v2 migration.'),
  ('Revenue Management', null, 'ambiguous', 'Manual/source uses a process or discipline label; requires concrete role.'),
  ('Revenue', null, 'ambiguous', 'Could mean a role or area; requires user decision.'),
  ('Equipo Operativo', null, 'ambiguous', 'Document uses this as person/team reference, not a role row.'),
  ('Finanzas', null, 'ambiguous', 'Area-level label; requires concrete role.'),
  ('Operaciones', null, 'ambiguous', 'Area-level label; requires concrete role.'),
  ('Encargado de Turnos / Personas', 'Encargado de Turnos / Personas', 'exact', 'Created idempotently by catalog v2 migration.'),
  ('Encargado de Proveedores', 'Encargado de Proveedores', 'exact', 'Created idempotently by catalog v2 migration.');

-- Ensure owner/operating companies and areas exist when the migration is applied.
insert into public.companies (name, status)
select distinct company_name, 'active'::public.record_status
from (
  select owner_company_name as company_name from _process_catalog_v2
  union
  select operating_company_name as company_name from _process_catalog_v2
) source
where not exists (
  select 1 from public.companies c where c.name = source.company_name
);

insert into public.areas (company_id, name, status)
select distinct owner_company.id, source.area_name, 'active'::public.record_status
from _process_catalog_v2 source
join public.companies owner_company on owner_company.name = source.owner_company_name
where source.area_name is not null
  and not exists (
    select 1
    from public.areas a
    where a.company_id = owner_company.id
      and a.name = source.area_name
  );

-- Create the three functional roles explicitly approved for ETAPA 3B.
-- They are idempotent by (area_id, name) and do not create people/person assignments.
do $$
declare
  v_mcparking_id uuid;
  v_area_id uuid;
  item record;
begin
  select id into v_mcparking_id
  from public.companies
  where lower(name) = 'mcparking'
  limit 1;

  if v_mcparking_id is null then
    raise exception 'McParking company is required before creating catalog v2 roles.';
  end if;

  for item in
    select *
    from (
      values
        ('REV', 'Responsable Revenue / Analista Revenue', 'Revenue', 'tactical', 'Optimizar ingresos, ocupación y ADR mediante análisis de demanda, tarifas y descuentos.', array['Revenue management','Analisis de demanda y ocupacion','Definicion de tarifas y descuentos','Seguimiento ADR e ingresos']),
        ('TURNOS', 'Encargado de Turnos / Personas', 'Operaciones', 'operational', 'Planificar turnos y cobertura operativa para asegurar dotación en periodos normales y peak.', array['Planificacion de turnos','Control de asistencia','Gestion de reemplazos','Cobertura de dotacion operativa']),
        ('PROV', 'Encargado de Proveedores', 'Contabilidad', 'operational', 'Coordinar compras, cotizaciones y seguimiento de proveedores criticos para la operacion.', array['Cotizaciones y compras','Seguimiento de proveedores','Coordinacion con Finanzas y Operaciones','Control de cumplimiento proveedor'])
    ) as t(role_code, role_name, area_name, role_level, objective, responsibilities)
  loop
    select id into v_area_id
    from public.areas
    where company_id = v_mcparking_id
      and name = item.area_name
    limit 1;

    if v_area_id is null then
      insert into public.areas (company_id, name, status)
      values (v_mcparking_id, item.area_name, 'active'::public.record_status)
      on conflict (company_id, name) do update
        set status = excluded.status
      returning id into v_area_id;
    end if;

    insert into public.roles (
      area_id,
      name,
      description,
      level,
      is_corporate,
      is_local,
      role_code,
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
      item.responsibilities,
      'active'::public.record_status
    )
    on conflict (area_id, name) do update
      set description = excluded.description,
          level = excluded.level,
          is_corporate = excluded.is_corporate,
          is_local = excluded.is_local,
          role_code = excluded.role_code,
          responsibilities = excluded.responsibilities,
          status = excluded.status;
  end loop;
end;
$$;

-- Normalize known reusable legacy names before archiving/upsert so existing ids are preserved.
update public.processes p
set name = 'Dirección y Planificación Operacional'
where p.name = 'Direccion y Planificacion Operacional'
  and not exists (select 1 from public.processes existing where existing.company_id = p.company_id and existing.name = 'Dirección y Planificación Operacional');

update public.processes p
set name = 'Planificación de Capacidad y Ocupación'
where p.name in ('Planificacion de Capacidad y Ocupacion', 'Planificación de capacidad y ocupación')
  and not exists (select 1 from public.processes existing where existing.company_id = p.company_id and existing.name = 'Planificación de Capacidad y Ocupación');

update public.processes p
set name = 'Cotización y Reserva Online'
where p.name = 'Cotizacion y Reserva Online'
  and not exists (select 1 from public.processes existing where existing.company_id = p.company_id and existing.name = 'Cotización y Reserva Online');

update public.processes p
set name = 'Check-in y Recepción del Vehículo'
where p.name = 'Check-in y Recepcion del Vehiculo'
  and not exists (select 1 from public.processes existing where existing.company_id = p.company_id and existing.name = 'Check-in y Recepción del Vehículo');

update public.processes p
set name = 'Custodia del Vehículo'
where p.name = 'Custodia del Vehiculo'
  and not exists (select 1 from public.processes existing where existing.company_id = p.company_id and existing.name = 'Custodia del Vehículo');

update public.processes p
set name = 'Atención al Cliente Operacional'
where p.name = 'Atencion al Cliente Operacional'
  and not exists (select 1 from public.processes existing where existing.company_id = p.company_id and existing.name = 'Atención al Cliente Operacional');

update public.processes p
set name = 'Gestión de Incidencias Operativas'
where p.name = 'Gestion de Incidencias Operativas'
  and not exists (select 1 from public.processes existing where existing.company_id = p.company_id and existing.name = 'Gestión de Incidencias Operativas');

update public.processes p
set name = 'Cierre Operacional, Liquidación y Cobranza a Inversionistas'
where p.name = 'Cierre Operacional, Liquidacion y Cobranza a Inversionistas'
  and not exists (select 1 from public.processes existing where existing.company_id = p.company_id and existing.name = 'Cierre Operacional, Liquidación y Cobranza a Inversionistas');

update public.processes p
set name = 'Gestión de Proveedores'
where p.name = 'Gestion de Proveedores'
  and not exists (select 1 from public.processes existing where existing.company_id = p.company_id and existing.name = 'Gestión de Proveedores');

update public.processes p
set name = 'Control Documental y Administración'
where p.name = 'Control Documental y Administracion'
  and not exists (select 1 from public.processes existing where existing.company_id = p.company_id and existing.name = 'Control Documental y Administración');

-- Archive old active records not belonging to the 19-process target catalog.
-- This includes demo/test rows detected during ETAPA 1.
-- Matching includes owner company + process name to avoid leaving homonyms active.
update public.processes p
set status = 'archived'::public.record_status
from public.companies process_company
where process_company.id = p.company_id
  and p.status = 'active'::public.record_status
  and (
    not exists (
      select 1
      from _process_catalog_v2 target
      where target.owner_company_name = process_company.name
        and target.name = p.name
    )
    or p.name ilike 'DEMO MAPA -%'
    or lower(p.name) in ('contabilidad test', 'teeeest', 'proceso demo mapa.', 'test1l')
  );

-- Upsert the 19 master processes. Criticality intentionally uses the current schema default
-- where Fuente A/B did not provide a source-owned criticality.
insert into public.processes (
  company_id,
  owner_company_id,
  operating_company_id,
  area_id,
  name,
  description,
  objective,
  expected_result,
  process_type,
  status,
  documentation_status,
  inputs_providers,
  outputs_clients,
  basic_kpi
)
select
  owner_company.id,
  owner_company.id,
  operating_company.id,
  area.id,
  source.name,
  source.description,
  source.objective,
  source.expected_result,
  source.process_type,
  'active'::public.record_status,
  'draft'::public.documentation_status,
  source.inputs_providers,
  source.outputs_clients,
  source.basic_kpi
from _process_catalog_v2 source
join public.companies owner_company on owner_company.name = source.owner_company_name
join public.companies operating_company on operating_company.name = source.operating_company_name
left join public.areas area
  on area.company_id = owner_company.id
  and area.name = source.area_name
on conflict (company_id, name) do update
set owner_company_id = excluded.owner_company_id,
    operating_company_id = excluded.operating_company_id,
    area_id = excluded.area_id,
    description = excluded.description,
    objective = excluded.objective,
    expected_result = excluded.expected_result,
    process_type = excluded.process_type,
    status = excluded.status,
    documentation_status = excluded.documentation_status,
    inputs_providers = excluded.inputs_providers,
    outputs_clients = excluded.outputs_clients,
    basic_kpi = excluded.basic_kpi;

-- Archive only explicitly identified test stages for reused real processes.
update public.subprocesses sp
set status = 'archived'::public.record_status
from public.processes p
where p.id = sp.process_id
  and (
    (p.name = 'Reservas McParking' and lower(sp.name) = 'test8')
    or (p.name in ('Cierre Operacional, Liquidación y Cobranza a Inversionistas', 'Cierre Operacional, Liquidacion y Cobranza a Inversionistas') and lower(sp.name) = 'aaaaaaa')
  );

-- Insert missing Fuente B stages while preserving existing real stages and ids.
insert into public.subprocesses (
  process_id,
  name,
  description,
  sort_order,
  criticality,
  status
)
select
  p.id,
  stage.name,
  stage.description,
  stage.sort_order,
  coalesce(stage.criticality, 'medium'::public.criticality_level),
  'active'::public.record_status
from _process_catalog_v2_stage stage
join _process_catalog_v2 source on source.canonical_key = stage.canonical_key
join public.companies owner_company on owner_company.name = source.owner_company_name
join public.processes p
  on p.company_id = owner_company.id
  and p.name = source.name
where not exists (
  select 1
  from public.subprocesses existing
  where existing.process_id = p.id
    and existing.name = stage.name
)
on conflict (process_id, name) do update
set description = excluded.description,
    sort_order = excluded.sort_order,
    status = excluded.status;

-- Archive active legacy stages under target processes that are not part of Fuente B v2.
-- This keeps historical rows but ensures future fresh applications end with exactly
-- the Fuente B active stage set.
update public.subprocesses sp
set status = 'archived'::public.record_status
from public.processes p
join _process_catalog_v2 source on source.name = p.name
join public.companies owner_company
  on owner_company.id = p.company_id
  and owner_company.name = source.owner_company_name
where sp.process_id = p.id
  and sp.status = 'active'::public.record_status
  and not exists (
    select 1
    from _process_catalog_v2_stage stage
    where stage.canonical_key = source.canonical_key
      and stage.name = sp.name
  );

-- Create owner role relationships for exact matches only.
insert into public.process_roles (
  process_id,
  subprocess_id,
  role_id,
  role_company_id,
  responsibility_type,
  criticality,
  is_required,
  notes
)
select
  p.id,
  sp.id,
  r.id,
  p.operating_company_id,
  'owner'::public.responsibility_type,
  coalesce(sp.criticality, p.criticality),
  true,
  'Catalog v2 owner role from Fuente A/B exact match.'
from _process_catalog_v2 source
join _process_catalog_v2_role_alias alias
  on alias.requested_role_name = source.owner_role_name
  and alias.match_type = 'exact'
join public.roles r on r.name = alias.matched_role_name
join public.companies owner_company on owner_company.name = source.owner_company_name
join public.processes p on p.company_id = owner_company.id and p.name = source.name
join public.subprocesses sp on sp.process_id = p.id and sp.status = 'active'::public.record_status
where not exists (
  select 1
  from public.process_roles existing
  where existing.process_id = p.id
    and existing.subprocess_id = sp.id
    and existing.role_id = r.id
    and existing.responsibility_type = 'owner'::public.responsibility_type
);

-- Create support role relationships for exact matches only.
insert into public.process_roles (
  process_id,
  subprocess_id,
  role_id,
  role_company_id,
  responsibility_type,
  criticality,
  is_required,
  notes
)
select
  p.id,
  sp.id,
  r.id,
  p.operating_company_id,
  support.responsibility_type,
  coalesce(sp.criticality, p.criticality),
  true,
  'Catalog v2 support role from Fuente B exact match.'
from _process_catalog_v2_support_role support
join _process_catalog_v2_role_alias alias
  on alias.requested_role_name = support.requested_role_name
  and alias.match_type = 'exact'
join public.roles r on r.name = alias.matched_role_name
join _process_catalog_v2 source on source.canonical_key = support.canonical_key
join public.companies owner_company on owner_company.name = source.owner_company_name
join public.processes p on p.company_id = owner_company.id and p.name = source.name
join public.subprocesses sp on sp.process_id = p.id and sp.status = 'active'::public.record_status
where not exists (
  select 1
  from public.process_roles existing
  where existing.process_id = p.id
    and existing.subprocess_id = sp.id
    and existing.role_id = r.id
    and existing.responsibility_type = support.responsibility_type
);

-- Validation queries to run after applying manually:
--
-- select count(*) as active_processes
-- from public.processes
-- where status = 'active';
--
-- select process_type, count(*)
-- from public.processes
-- where status = 'active'
-- group by process_type
-- order by process_type;
--
-- select name
-- from public.processes
-- where status = 'active'
--   and (name ilike 'DEMO MAPA -%' or lower(name) in ('contabilidad test', 'teeeest', 'proceso demo mapa.', 'test1l'));
--
-- select name, objective, inputs_providers, outputs_clients, basic_kpi
-- from public.processes
-- where status = 'active'
--   and (
--     objective is null
--     or inputs_providers is null
--     or outputs_clients is null
--     or basic_kpi is null
--   );
--
-- select sp.*
-- from public.subprocesses sp
-- left join public.processes p on p.id = sp.process_id
-- where p.id is null;
--
-- select pr.*
-- from public.process_roles pr
-- left join public.processes p on p.id = pr.process_id
-- left join public.roles r on r.id = pr.role_id
-- where p.id is null or r.id is null;
--
-- Expected:
-- active_processes = 19
-- strategic = 4
-- operational = 8
-- support = 7
-- no active demo/test process rows
-- active subprocesses = 94
-- no null Fuente A ficha fields on active processes
-- no orphan subprocess rows
-- no orphan process_role rows

commit;
