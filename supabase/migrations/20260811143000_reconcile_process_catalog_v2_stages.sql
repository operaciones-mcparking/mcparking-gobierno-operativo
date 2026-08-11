-- Reconcile McParking process catalog v2 inherited stages.
-- DO NOT APPLY until ETAPA 3B.3 is explicitly approved.
--
-- Context:
-- - The main catalog v2 migration was applied manually.
-- - It produced the intended 19 active processes and 94 Fuente B stages.
-- - It also preserved 15 pre-existing active legacy stages under reused processes.
-- - This migration archives only those exact inherited stage ids.

begin;

create temporary table _process_catalog_v2_legacy_stage_to_archive (
  id uuid primary key,
  process_name text not null,
  stage_name text not null,
  classification text not null check (classification in ('DUPLICADA_V2', 'LEGACY_NO_V2'))
) on commit drop;

insert into _process_catalog_v2_legacy_stage_to_archive (id, process_name, stage_name, classification)
values
  ('88188b89-13c7-46ce-a0a7-a227ba8d6024', 'Reservas McParking', 'Sitioweb McParking.cl', 'LEGACY_NO_V2'),
  ('41a75020-30d6-4f0f-a5ee-809ee4d0d537', 'Reservas McParking', 'Metodo de pago', 'DUPLICADA_V2'),
  ('c5ad56f5-e456-48d0-bd24-2599e9bbffa7', 'Reservas McParking', 'Precio y descuentos', 'LEGACY_NO_V2'),
  ('6de322e7-4b67-4db3-9609-75d198b2f935', 'Reservas McParking', 'Confirmacion de reserva', 'DUPLICADA_V2'),
  ('83dd3297-f9b8-4af4-8233-732cd35db067', 'Reservas McParking', 'Conciliacion banco vs Transbank', 'LEGACY_NO_V2'),
  ('0f7199d9-6042-4503-b6fa-ccde6ba75131', 'Revenue Management', 'Dashboard de Revenue', 'LEGACY_NO_V2'),
  ('a7425934-c8ff-4607-9c10-28948187c8bf', 'Reservas McParking', 'Emision de boleta', 'LEGACY_NO_V2'),
  ('23389806-087b-474e-8336-7aab1b75200c', 'Reservas McParking', 'Registro en Banco de Reservas', 'LEGACY_NO_V2'),
  ('19035b37-5ad2-47e2-9b1d-ef172ca38189', 'Cierre Operacional, Liquidacion y Cobranza a Inversionistas', 'Liquidaciones', 'LEGACY_NO_V2'),
  ('f995a93e-bdc7-4d6a-9a9c-a89da4da6b26', 'Cierre Operacional, Liquidacion y Cobranza a Inversionistas', 'Cobranza', 'LEGACY_NO_V2'),
  ('b99f0c71-78aa-4f75-89b0-cc56204bf23b', 'Cierre Operacional, Liquidacion y Cobranza a Inversionistas', 'Pagos / Nominas', 'LEGACY_NO_V2'),
  ('0fff1b5e-3cd1-46f1-b656-1b8751648d2c', 'Cierre Operacional, Liquidacion y Cobranza a Inversionistas', 'Inversionistas', 'LEGACY_NO_V2'),
  ('f9605417-7d93-44bf-a14e-733325ba47d1', 'Cierre Operacional, Liquidacion y Cobranza a Inversionistas', 'Dashboard inversionista', 'LEGACY_NO_V2'),
  ('d1e4e4c0-0428-43c4-9c3f-fbedd427ffb7', 'Cierre Operacional, Liquidacion y Cobranza a Inversionistas', 'Debug / Auditoria', 'LEGACY_NO_V2'),
  ('acf3d518-6fc3-4ef6-a2fa-2108dbc332a0', 'Cierre Operacional, Liquidacion y Cobranza a Inversionistas', 'Operacion', 'LEGACY_NO_V2');

do $$
declare
  active_process_count integer;
  active_stage_count integer;
  target_active_count integer;
  archived_test_count integer;
begin
  select count(*)
  into active_process_count
  from public.processes
  where status = 'active'::public.record_status;

  if active_process_count <> 19 then
    raise exception 'Expected 19 active processes before stage reconciliation, found %', active_process_count;
  end if;

  select count(*)
  into active_stage_count
  from public.subprocesses sp
  join public.processes p on p.id = sp.process_id
  where p.status = 'active'::public.record_status
    and sp.status = 'active'::public.record_status;

  if active_stage_count <> 109 then
    raise exception 'Expected 109 active stages before stage reconciliation, found %', active_stage_count;
  end if;

  select count(*)
  into target_active_count
  from public.subprocesses sp
  join _process_catalog_v2_legacy_stage_to_archive target on target.id = sp.id
  where sp.status = 'active'::public.record_status;

  if target_active_count <> 15 then
    raise exception 'Expected 15 target legacy stages to be active before reconciliation, found %', target_active_count;
  end if;

  select count(*)
  into archived_test_count
  from public.subprocesses sp
  where sp.id in (
      '2259cb96-c673-4eee-b1ca-cd5b3ad44d00'::uuid,
      '3ef009cc-cf96-475a-a33c-188d0f46203f'::uuid
    )
    and sp.status <> 'active'::public.record_status;

  if archived_test_count <> 2 then
    raise exception 'Expected test stages test8 and aaaaaaa to already be archived before reconciliation';
  end if;
end $$;

create temporary table _process_catalog_v2_stage_archive_result (
  id uuid primary key
) on commit drop;

with updated as (
  update public.subprocesses sp
  set status = 'archived'::public.record_status
  from _process_catalog_v2_legacy_stage_to_archive target
  where target.id = sp.id
    and sp.status = 'active'::public.record_status
  returning sp.id
)
insert into _process_catalog_v2_stage_archive_result (id)
select id
from updated;

do $$
declare
  archived_count integer;
  active_stage_count integer;
begin
  select count(*)
  into archived_count
  from _process_catalog_v2_stage_archive_result;

  if archived_count <> 15 then
    raise exception 'Expected to archive 15 legacy stages, archived %', archived_count;
  end if;

  select count(*)
  into active_stage_count
  from public.subprocesses sp
  join public.processes p on p.id = sp.process_id
  where p.status = 'active'::public.record_status
    and sp.status = 'active'::public.record_status;

  if active_stage_count <> 94 then
    raise exception 'Expected 94 active stages after reconciliation, found %', active_stage_count;
  end if;
end $$;

commit;
