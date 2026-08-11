begin;

create temporary table _process_catalog_v2_uuid_to_restore (
  id uuid primary key,
  process_name text not null,
  stage_name text not null,
  expected_sort_order integer
) on commit drop;

insert into _process_catalog_v2_uuid_to_restore (id, process_name, stage_name, expected_sort_order)
values
  ('aa1c3aae-8812-4268-af91-849951eeabcb'::uuid, 'Atención al Cliente Operacional', 'Resolver dudas', 1),
  ('dfde6147-5bde-42b5-84ae-15496ed333f8'::uuid, 'Atención al Cliente Operacional', 'Cambios', 2),
  ('7e4ce287-28dd-4e1c-afac-212e54a42659'::uuid, 'Atención al Cliente Operacional', 'Atrasos', 3),
  ('55d46bd4-13e4-4b2c-aedc-5e0dfcddaedd'::uuid, 'Atención al Cliente Operacional', 'Reclamos', 4),
  ('dc94cebe-f74f-42f7-89c2-49c694c9ca65'::uuid, 'Atención al Cliente Operacional', 'Coordinacion con operacion', 5),
  ('b87be1f9-8102-4e90-80c4-b29b59b69683'::uuid, 'Check-in y Recepción del Vehículo', 'Validar reserva', 1),
  ('3989accf-c74b-4385-afab-05ccfe3f99f2'::uuid, 'Check-in y Recepción del Vehículo', 'Recibir cliente', 2),
  ('49ce7452-8121-48f6-9d20-4f5ddb243572'::uuid, 'Check-in y Recepción del Vehículo', 'Registrar ingreso', 3),
  ('81d1a42e-b9ad-419b-8cd4-902cdc2c38c8'::uuid, 'Check-in y Recepción del Vehículo', 'Revisar patente/datos', 4),
  ('74f251fa-59ac-4af4-bb66-0ad6201cca3e'::uuid, 'Check-in y Recepción del Vehículo', 'Entregar instrucciones', 5),
  ('18e42780-74b8-4861-b410-1daa739a4c19'::uuid, 'Check-out y Entrega del Vehículo', 'Solicitud retorno', 1),
  ('ccf90d3e-d84a-49e7-857f-970e4f8d0ff4'::uuid, 'Check-out y Entrega del Vehículo', 'Traslado desde aeropuerto', 2),
  ('085bb610-5ae0-46e7-9d08-cfe09d14b880'::uuid, 'Check-out y Entrega del Vehículo', 'Validacion salida', 3),
  ('c4a44890-2d48-4dd2-915a-2e72b50851cc'::uuid, 'Check-out y Entrega del Vehículo', 'Entrega vehiculo', 4),
  ('35905e67-47d7-45d9-be80-032d11a45919'::uuid, 'Check-out y Entrega del Vehículo', 'Cierre atencion', 5),
  ('a68b9d49-b9bd-4bb5-abd1-5614cb935963'::uuid, 'Cierre Operacional, Liquidación y Cobranza a Inversionistas', 'Consolidar operacion', 1),
  ('32ab2eec-987a-4075-a7fc-12ec54ac24a3'::uuid, 'Cierre Operacional, Liquidación y Cobranza a Inversionistas', 'Revisar ingresos', 2),
  ('c4bbdc5a-a5f4-42f2-b15b-050e4983b0ce'::uuid, 'Cierre Operacional, Liquidación y Cobranza a Inversionistas', 'Calcular liquidaciones', 3),
  ('03359cde-2a70-4f8c-867b-615e192ff9b5'::uuid, 'Cierre Operacional, Liquidación y Cobranza a Inversionistas', 'Preparar pagos', 4),
  ('0e39de59-0a9d-47f5-b8cb-8d5aa7c02c46'::uuid, 'Cierre Operacional, Liquidación y Cobranza a Inversionistas', 'Respaldar informacion', 5),
  ('78d9fbf6-ec14-4871-830d-f0acf847550c'::uuid, 'Control Documental y Administración', 'Contratos', 1),
  ('84fdce53-5d02-4f05-a279-494685613975'::uuid, 'Control Documental y Administración', 'Respaldos', 2),
  ('638af8b1-8f49-4e8a-adeb-a1ac0e9b45d9'::uuid, 'Control Documental y Administración', 'Documentos tributarios', 3),
  ('a1f896ac-9c01-4531-86da-62eda36e99f1'::uuid, 'Control Documental y Administración', 'Carpetas', 4),
  ('166a1e4c-5ef2-4d7f-a3a9-7e1fba2d4444'::uuid, 'Control Documental y Administración', 'Evidencias', 5),
  ('8332e5e6-46ef-480c-a23a-e5385e0e870e'::uuid, 'Control Documental y Administración', 'Auditoria interna', 6),
  ('cd491614-2c74-4a25-bc30-a9daf1c50f9c'::uuid, 'Cotización y Reserva Online', 'Cliente consulta precio', 1),
  ('d2fd9c44-599f-4c52-8f35-79824be5a777'::uuid, 'Cotización y Reserva Online', 'Elige fechas', 2),
  ('127c3c89-fe1e-4aea-814e-9636a187740d'::uuid, 'Cotización y Reserva Online', 'Revisa disponibilidad', 3),
  ('f43b977a-ef92-42ac-95ab-525acc303c91'::uuid, 'Cotización y Reserva Online', 'Inicia reserva', 4),
  ('fec01fca-ac9e-4918-bd5d-794f142232a8'::uuid, 'Custodia del Vehículo', 'Ubicacion vehiculo', 1),
  ('5d593a7a-481b-4396-9782-3691d30f533d'::uuid, 'Custodia del Vehículo', 'Control interno', 2),
  ('817abf8d-74ee-4e3d-8c25-9202fccade12'::uuid, 'Custodia del Vehículo', 'Resguardo', 3),
  ('a75bd14a-8040-4fd9-aa70-e232146950d7'::uuid, 'Custodia del Vehículo', 'Monitoreo', 4),
  ('0f4cf9f8-3e56-41e4-a54c-d54e612a6872'::uuid, 'Custodia del Vehículo', 'Manejo de incidentes', 5),
  ('872b3d5d-211d-4515-b0b7-83ac6d591103'::uuid, 'Dirección y Planificación Operacional', 'Definir prioridades', 1),
  ('66a81b1b-544f-405e-a01d-f78a8a11f119'::uuid, 'Dirección y Planificación Operacional', 'Revisar capacidad', 2),
  ('46c7f921-aef3-4d1e-a428-91d35946aee4'::uuid, 'Dirección y Planificación Operacional', 'Revisar brechas', 3),
  ('32383d4c-3ade-41fb-80de-d26ec43478ec'::uuid, 'Dirección y Planificación Operacional', 'Tomar decisiones operativas', 4),
  ('c5828061-ef79-432c-8076-a6fcdebef0a6'::uuid, 'Estrategia Comercial y Alianzas', 'Bancos', 1),
  ('85f60c12-5132-446d-8367-ea6fe10d573c'::uuid, 'Estrategia Comercial y Alianzas', 'Convenios', 2),
  ('a4b553a5-b3de-4f0d-98c2-67eac51684e2'::uuid, 'Estrategia Comercial y Alianzas', 'Campanas', 3),
  ('c4fb3ef7-c5bb-45cc-b92b-e5d884ea6992'::uuid, 'Estrategia Comercial y Alianzas', 'Descuentos', 4),
  ('d1ed2331-9268-4be7-82fd-c4f7b1f957cc'::uuid, 'Estrategia Comercial y Alianzas', 'Canales comerciales', 5),
  ('2753b60d-e689-4ee7-a06c-73e462bab2de'::uuid, 'Finanzas y Contabilidad', 'Conciliacion bancaria', 1),
  ('38c8a17d-cf9c-46ba-95c4-0b6d9483c1f3'::uuid, 'Finanzas y Contabilidad', 'Facturacion', 2),
  ('e20c9d9d-7753-4110-bac6-3167b5d8f21a'::uuid, 'Finanzas y Contabilidad', 'Pagos proveedores', 3),
  ('e6ab54fc-a581-4233-a43c-42e4c51d6ce8'::uuid, 'Finanzas y Contabilidad', 'Control gastos', 4),
  ('c5b03e76-ae25-46ba-8a95-097dbc6674a0'::uuid, 'Finanzas y Contabilidad', 'Estados financieros', 5),
  ('281c899d-5bea-4bfa-b002-22b5db463a6d'::uuid, 'Gestión de Incidencias Operativas', 'Detectar problema', 1),
  ('2526219e-f389-443d-b661-cf786c022998'::uuid, 'Gestión de Incidencias Operativas', 'Registrar caso', 2),
  ('2cc04b4c-c633-4e81-9b8c-a34f33d1704f'::uuid, 'Gestión de Incidencias Operativas', 'Coordinar solucion', 3),
  ('74935567-a457-4ee9-b2ed-c13dc3534189'::uuid, 'Gestión de Incidencias Operativas', 'Informar cliente', 4),
  ('e8f783c6-36e0-47cc-9730-91717100a359'::uuid, 'Gestión de Incidencias Operativas', 'Cerrar incidente', 5),
  ('fbef8007-79ac-4e50-82c9-9768c462f8b9'::uuid, 'Gestión de Proveedores', 'Cotizaciones', 1),
  ('f504bb20-00c7-4027-a40a-51092aa2a349'::uuid, 'Gestión de Proveedores', 'Compras', 2),
  ('9ecc4547-d1af-4a93-83d9-9c83c737e24c'::uuid, 'Gestión de Proveedores', 'Seguimiento servicios', 3),
  ('7c1f5735-17d4-4de6-9dc6-89e1bcd895e1'::uuid, 'Gestión de Proveedores', 'Pagos', 4),
  ('8fae6570-ba18-4d14-8f7f-fac8d813a786'::uuid, 'Gestión de Proveedores', 'Evaluacion proveedores', 5),
  ('fc77b81d-830a-4436-8e9e-f1aa47094f65'::uuid, 'Infraestructura y Mantenciones', 'Mantencion terreno', 1),
  ('f30ef02e-8524-4e0a-822b-fe0f910ac554'::uuid, 'Infraestructura y Mantenciones', 'Senaletica', 2),
  ('b68f1dbc-3e6c-4e97-8535-13fb168bc7f3'::uuid, 'Infraestructura y Mantenciones', 'Camaras', 3),
  ('1ad7bb67-4eda-496b-b35b-97933c98e768'::uuid, 'Infraestructura y Mantenciones', 'Portones', 4),
  ('94c50943-6a46-40af-af6b-162dab02e8e3'::uuid, 'Infraestructura y Mantenciones', 'Iluminacion', 5),
  ('2130904e-fd07-473e-82d6-1f0418a8812f'::uuid, 'Infraestructura y Mantenciones', 'Mejoras fisicas', 6),
  ('ace83220-54c2-402f-9411-7055014d9c88'::uuid, 'Personas y Turnos', 'Planificar turnos', 1),
  ('079bd886-ed5b-4d7e-b2fe-6cfa0a3c7dfc'::uuid, 'Personas y Turnos', 'Asistencia', 2),
  ('33231d64-b02c-488d-9e1f-e060326d54e1'::uuid, 'Personas y Turnos', 'Reemplazos', 3),
  ('c89e6ba2-97d6-4082-b6f4-a977baeabb4b'::uuid, 'Personas y Turnos', 'Necesidades operativas', 4),
  ('61a6ce97-f650-491e-b5bb-5bffb2db99f2'::uuid, 'Personas y Turnos', 'Coordinacion equipo', 5),
  ('054f104d-bc33-43ba-ac37-9c14d7367ac4'::uuid, 'Planificación de Capacidad y Ocupación', 'Revisar ocupacion futura', 1),
  ('e7d6a332-b8ed-4a11-999c-b3f48a96a550'::uuid, 'Planificación de Capacidad y Ocupación', 'Capacidad disponible', 2),
  ('3cc98fa4-cbf6-4d91-94f3-f95b45435bd8'::uuid, 'Planificación de Capacidad y Ocupación', 'Peak dates', 3),
  ('5d477455-3c95-4739-a809-8ec35f22f721'::uuid, 'Planificación de Capacidad y Ocupación', 'Restricciones operativas', 4),
  ('05b78a7d-8d00-4f7a-9e57-106b2c6ca84e'::uuid, 'Reservas McParking', 'Cotizacion', 1),
  ('5ff1dfd5-7719-4dbb-81a6-37848edba9e6'::uuid, 'Reservas McParking', 'Seleccion fechas', 2),
  ('525fdf7a-0553-407d-bce9-0b9a8d17c2e9'::uuid, 'Reservas McParking', 'Aplicacion descuentos', 3),
  ('d56dcef0-005b-45d0-b6fd-5e933142a87a'::uuid, 'Reservas McParking', 'Confirmacion', 4),
  ('98ab10c0-786d-4f4c-bc39-bb1794308e68'::uuid, 'Reservas McParking', 'Pago', 5),
  ('7ee9db4f-c818-480d-a316-aa111411db7b'::uuid, 'Reservas McParking', 'Envio de comprobante', 6),
  ('1588d9e1-8bc6-42c0-a5b0-73ce6389cb6a'::uuid, 'Revenue Management', 'Revision ocupacion', 1),
  ('8857fdd5-b553-4cd1-be94-9a87b4ab714a'::uuid, 'Revenue Management', 'Analisis demanda', 2),
  ('aaccd936-1e9a-4418-a4a1-8b8934e22dd4'::uuid, 'Revenue Management', 'Definicion precios', 3),
  ('b153a559-14eb-40df-a7e8-1199d9040c30'::uuid, 'Revenue Management', 'Revision descuentos', 4),
  ('ccbb92d7-54fc-4833-a3c4-f14ce4c9fe46'::uuid, 'Revenue Management', 'Seguimiento ADR/ingresos', 5),
  ('5366ef2c-7616-4e18-880c-76c1d488591b'::uuid, 'Sistemas y Datos', 'Mantencion plataforma', 1),
  ('0fb8a34e-36f4-4749-8fdc-f52508868060'::uuid, 'Sistemas y Datos', 'Reportes', 2),
  ('e5ca62c3-2642-4938-aef2-581db6ab756c'::uuid, 'Sistemas y Datos', 'Integraciones', 3),
  ('57947a0e-cc49-4610-a9cb-7a6edbc11930'::uuid, 'Sistemas y Datos', 'Calidad de datos', 4),
  ('8e34cbf5-971f-48a1-8216-0f8ca971cbd9'::uuid, 'Sistemas y Datos', 'Soporte tecnico', 5),
  ('3d8f1dc6-7bfe-4d13-8185-e5057bad6526'::uuid, 'Traslado al Aeropuerto', 'Coordinar shuttle', 1),
  ('961cdf3d-2acf-4b4b-98d6-378efc71706f'::uuid, 'Traslado al Aeropuerto', 'Cargar pasajeros/equipaje', 2),
  ('b078e94c-5a21-44c9-8039-79c9062ed63c'::uuid, 'Traslado al Aeropuerto', 'Traslado al terminal', 3),
  ('7e2deb27-75af-4565-8668-ac98ef114d89'::uuid, 'Traslado al Aeropuerto', 'Registrar salida', 4);

create temporary table _process_catalog_v2_uuid_keep_archived (
  id uuid primary key
) on commit drop;

insert into _process_catalog_v2_uuid_keep_archived (id)
values
  ('88188b89-13c7-46ce-a0a7-a227ba8d6024'::uuid),
  ('41a75020-30d6-4f0f-a5ee-809ee4d0d537'::uuid),
  ('c5ad56f5-e456-48d0-bd24-2599e9bbffa7'::uuid),
  ('6de322e7-4b67-4db3-9609-75d198b2f935'::uuid),
  ('83dd3297-f9b8-4af4-8233-732cd35db067'::uuid),
  ('0f7199d9-6042-4503-b6fa-ccde6ba75131'::uuid),
  ('a7425934-c8ff-4607-9c10-28948187c8bf'::uuid),
  ('23389806-087b-474e-8336-7aab1b75200c'::uuid),
  ('19035b37-5ad2-47e2-9b1d-ef172ca38189'::uuid),
  ('f995a93e-bdc7-4d6a-9a9c-a89da4da6b26'::uuid),
  ('b99f0c71-78aa-4f75-89b0-cc56204bf23b'::uuid),
  ('0fff1b5e-3cd1-46f1-b656-1b8751648d2c'::uuid),
  ('f9605417-7d93-44bf-a14e-733325ba47d1'::uuid),
  ('d1e4e4c0-0428-43c4-9c3f-fbedd427ffb7'::uuid),
  ('acf3d518-6fc3-4ef6-a2fa-2108dbc332a0'::uuid),
  ('2259cb96-c673-4eee-b1ca-cd5b3ad44d00'::uuid),
  ('3ef009cc-cf96-475a-a33c-188d0f46203f'::uuid);

create temporary table _process_catalog_v2_expected_stage_count (
  process_name text primary key,
  expected_active_stages integer not null
) on commit drop;

insert into _process_catalog_v2_expected_stage_count (process_name, expected_active_stages)
values
  ('Atención al Cliente Operacional', 5),
  ('Check-in y Recepción del Vehículo', 5),
  ('Check-out y Entrega del Vehículo', 5),
  ('Cierre Operacional, Liquidación y Cobranza a Inversionistas', 5),
  ('Control Documental y Administración', 6),
  ('Cotización y Reserva Online', 4),
  ('Custodia del Vehículo', 5),
  ('Dirección y Planificación Operacional', 4),
  ('Estrategia Comercial y Alianzas', 5),
  ('Finanzas y Contabilidad', 5),
  ('Gestión de Incidencias Operativas', 5),
  ('Gestión de Proveedores', 5),
  ('Infraestructura y Mantenciones', 6),
  ('Personas y Turnos', 5),
  ('Planificación de Capacidad y Ocupación', 4),
  ('Reservas McParking', 6),
  ('Revenue Management', 5),
  ('Sistemas y Datos', 5),
  ('Traslado al Aeropuerto', 4);

do $$
declare
  total_subprocess_count integer;
  active_subprocess_count integer;
  archived_subprocess_count integer;
  active_process_count integer;
  v2_uuid_count integer;
  v2_uuid_existing_count integer;
  v2_uuid_archived_count integer;
  excluded_uuid_count integer;
  excluded_uuid_existing_count integer;
  excluded_uuid_archived_count integer;
  intersection_count integer;
begin
  select count(*) into total_subprocess_count from public.subprocesses;
  if total_subprocess_count <> 111 then
    raise exception 'Expected 111 total subprocesses before restore, found %', total_subprocess_count;
  end if;

  select count(*) into active_subprocess_count from public.subprocesses where status = 'active'::public.record_status;
  if active_subprocess_count <> 0 then
    raise exception 'Expected 0 active subprocesses before restore, found %', active_subprocess_count;
  end if;

  select count(*) into archived_subprocess_count from public.subprocesses where status = 'archived'::public.record_status;
  if archived_subprocess_count <> 111 then
    raise exception 'Expected 111 archived subprocesses before restore, found %', archived_subprocess_count;
  end if;

  select count(*) into active_process_count from public.processes where status = 'active'::public.record_status;
  if active_process_count <> 19 then
    raise exception 'Expected 19 active processes before restore, found %', active_process_count;
  end if;

  select count(*) into v2_uuid_count from _process_catalog_v2_uuid_to_restore;
  if v2_uuid_count <> 94 then
    raise exception 'Expected 94 V2 UUIDs in restore set, found %', v2_uuid_count;
  end if;

  select count(*) into excluded_uuid_count from _process_catalog_v2_uuid_keep_archived;
  if excluded_uuid_count <> 17 then
    raise exception 'Expected 17 excluded UUIDs, found %', excluded_uuid_count;
  end if;

  select count(*) into intersection_count
  from _process_catalog_v2_uuid_to_restore v2
  join _process_catalog_v2_uuid_keep_archived excluded on excluded.id = v2.id;
  if intersection_count <> 0 then
    raise exception 'Expected no intersection between V2 and excluded UUID sets, found %', intersection_count;
  end if;

  select count(*) into v2_uuid_existing_count
  from _process_catalog_v2_uuid_to_restore v2
  join public.subprocesses sp on sp.id = v2.id;
  if v2_uuid_existing_count <> 94 then
    raise exception 'Expected all 94 V2 UUIDs to exist, found %', v2_uuid_existing_count;
  end if;

  select count(*) into v2_uuid_archived_count
  from _process_catalog_v2_uuid_to_restore v2
  join public.subprocesses sp on sp.id = v2.id
  where sp.status = 'archived'::public.record_status;
  if v2_uuid_archived_count <> 94 then
    raise exception 'Expected all 94 V2 UUIDs to be archived before restore, found %', v2_uuid_archived_count;
  end if;

  select count(*) into excluded_uuid_existing_count
  from _process_catalog_v2_uuid_keep_archived excluded
  join public.subprocesses sp on sp.id = excluded.id;
  if excluded_uuid_existing_count <> 17 then
    raise exception 'Expected all 17 excluded UUIDs to exist, found %', excluded_uuid_existing_count;
  end if;

  select count(*) into excluded_uuid_archived_count
  from _process_catalog_v2_uuid_keep_archived excluded
  join public.subprocesses sp on sp.id = excluded.id
  where sp.status = 'archived'::public.record_status;
  if excluded_uuid_archived_count <> 17 then
    raise exception 'Expected all 17 excluded UUIDs to be archived before restore, found %', excluded_uuid_archived_count;
  end if;
end $$;

create temporary table _process_catalog_v2_restore_result (
  id uuid primary key
) on commit drop;

with updated as (
  update public.subprocesses sp
  set status = 'active'::public.record_status
  from _process_catalog_v2_uuid_to_restore v2
  where sp.id = v2.id
    and sp.status = 'archived'::public.record_status
  returning sp.id
)
insert into _process_catalog_v2_restore_result (id)
select id
from updated;

do $$
declare
  restored_count integer;
  total_subprocess_count integer;
  active_subprocess_count integer;
  archived_subprocess_count integer;
  v2_uuid_active_count integer;
  excluded_uuid_archived_count integer;
  bad_process_count integer;
begin
  select count(*) into restored_count from _process_catalog_v2_restore_result;
  if restored_count <> 94 then
    raise exception 'Expected to restore exactly 94 V2 UUIDs, restored %', restored_count;
  end if;

  select count(*) into total_subprocess_count from public.subprocesses;
  if total_subprocess_count <> 111 then
    raise exception 'Expected 111 total subprocesses after restore, found %', total_subprocess_count;
  end if;

  select count(*) into active_subprocess_count from public.subprocesses where status = 'active'::public.record_status;
  if active_subprocess_count <> 94 then
    raise exception 'Expected 94 active subprocesses after restore, found %', active_subprocess_count;
  end if;

  select count(*) into archived_subprocess_count from public.subprocesses where status = 'archived'::public.record_status;
  if archived_subprocess_count <> 17 then
    raise exception 'Expected 17 archived subprocesses after restore, found %', archived_subprocess_count;
  end if;

  select count(*) into v2_uuid_active_count
  from _process_catalog_v2_uuid_to_restore v2
  join public.subprocesses sp on sp.id = v2.id
  where sp.status = 'active'::public.record_status;
  if v2_uuid_active_count <> 94 then
    raise exception 'Expected all 94 V2 UUIDs to be active after restore, found %', v2_uuid_active_count;
  end if;

  select count(*) into excluded_uuid_archived_count
  from _process_catalog_v2_uuid_keep_archived excluded
  join public.subprocesses sp on sp.id = excluded.id
  where sp.status = 'archived'::public.record_status;
  if excluded_uuid_archived_count <> 17 then
    raise exception 'Expected all 17 excluded UUIDs to remain archived after restore, found %', excluded_uuid_archived_count;
  end if;

  select count(*) into bad_process_count
  from (
    select expected.process_name, expected.expected_active_stages, count(sp.id)::integer as actual_active_stages
    from _process_catalog_v2_expected_stage_count expected
    join public.processes p
      on p.name = expected.process_name
      and p.status = 'active'::public.record_status
    left join public.subprocesses sp
      on sp.process_id = p.id
      and sp.status = 'active'::public.record_status
    group by expected.process_name, expected.expected_active_stages
    having count(sp.id)::integer <> expected.expected_active_stages
  ) mismatched_processes;

  if bad_process_count <> 0 then
    raise exception 'Found % processes with unexpected active V2 stage counts after restore', bad_process_count;
  end if;
end $$;

commit;
