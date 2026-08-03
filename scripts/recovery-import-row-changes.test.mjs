import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260803110000_create_recovery_import_row_changes.sql";
const snapshotsHelperPath = "src/lib/recuperacion/recovery-snapshots.ts";
const cartsEndpointPath = "src/app/api/recuperacion/carritos/importar/route.ts";
const purchasesEndpointPath = "src/app/api/recuperacion/compras/importar/route.ts";
const docPath = "docs/recovery_import_row_changes.md";

const migration = readFileSync(migrationPath, "utf8");
const snapshotsHelper = readFileSync(snapshotsHelperPath, "utf8");
const cartsEndpoint = readFileSync(cartsEndpointPath, "utf8");
const purchasesEndpoint = readFileSync(purchasesEndpointPath, "utf8");
const doc = readFileSync(docPath, "utf8");

function assertHas(source, pattern, message) {
  assert.match(source, pattern, message);
}

function assertNotHas(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

test("1. table is created", () => {
  assertHas(migration, /create table if not exists public\.recovery_import_row_changes/i);
});

test("2. batch foreign key cascades with import batch", () => {
  assertHas(migration, /batch_id uuid not null references public\.recovery_import_batches\(id\) on delete cascade/i);
});

test("3. source is constrained to carts and purchases", () => {
  assertHas(migration, /check \(source in \('carts', 'purchases'\)\)/i);
});

test("4. operation is constrained to inserted and updated", () => {
  assertHas(migration, /check \(operation in \('inserted', 'updated'\)\)/i);
});

test("5. indexes support batch, source operation, pending snapshots and entity lookup", () => {
  for (const indexName of [
    "recovery_import_row_changes_batch_id_idx",
    "recovery_import_row_changes_source_operation_idx",
    "recovery_import_row_changes_snapshot_pending_idx",
    "recovery_import_row_changes_entity_idx",
  ]) {
    assertHas(migration, new RegExp(`create index if not exists ${indexName}`, "i"));
  }
});

test("6. RLS is enabled", () => {
  assertHas(migration, /alter table public\.recovery_import_row_changes enable row level security/i);
});

test("7. anon and authenticated do not receive direct access", () => {
  assertHas(migration, /revoke all on table public\.recovery_import_row_changes from anon/i);
  assertHas(migration, /revoke all on table public\.recovery_import_row_changes from authenticated/i);
  assertNotHas(migration, /grant .* on table public\.recovery_import_row_changes to anon/i);
  assertNotHas(migration, /grant .* on table public\.recovery_import_row_changes to authenticated/i);
});

test("8. event table does not define raw PII or payload columns", () => {
  const tableDefinition = migration.slice(
    migration.indexOf("create table if not exists public.recovery_import_row_changes"),
    migration.indexOf("create index if not exists recovery_import_row_changes_batch_id_idx"),
  );
  for (const forbidden of [
    /\bemail\b/i,
    /\bphone\b/i,
    /telefono/i,
    /nombre/i,
    /wamid/i,
    /message_id/i,
    /payload/i,
    /csv/i,
    /row_json/i,
  ]) {
    assertNotHas(tableDefinition, forbidden);
  }
});

test("9. previous and current columns are explicit", () => {
  for (const column of [
    "previous_form_datetime",
    "current_form_datetime",
    "previous_intended_arrival_at",
    "current_intended_arrival_at",
    "previous_booking_created_at",
    "current_booking_created_at",
    "previous_price",
    "current_price",
  ]) {
    assertHas(migration, new RegExp(`${column} `, "i"));
  }
});

test("10. identity columns are hashes and not raw values", () => {
  for (const column of [
    "previous_identity_email_hash",
    "current_identity_email_hash",
    "previous_identity_phone_hash",
    "current_identity_phone_hash",
  ]) {
    assertHas(migration, new RegExp(`${column} text`, "i"));
  }
});

test("11. carts inserts create inserted events", () => {
  assertHas(migration, /inserted_change_events as \([\s\S]*'carts'[\s\S]*'inserted'/i);
});

test("12. carts updates create updated events", () => {
  assertHas(migration, /updated_change_events as \([\s\S]*'carts'[\s\S]*'updated'/i);
});

test("13. carts duplicates do not create events", () => {
  assertHas(migration, /where existing_source_id is null\s+and existing_booking_id is null\s+and existing_message_id is null/i);
  assertHas(migration, /where existing_source_id is not null\s+and existing_source_row_hash is distinct from row_hash/i);
});

test("14. carts invalid rows do not create events", () => {
  assertHas(migration, /from insertable_rows\s+returning/i);
  assertNotHas(migration, /invalid_rows[\s\S]{0,120}recovery_import_row_changes/i);
});

test("15. carts watermark skipped rows do not create events", () => {
  assertHas(cartsEndpoint, /rowsSkippedByWatermark/i);
  assertNotHas(migration, /rowsSkippedByWatermark/i);
});

test("16. carts track previous and current form_datetime", () => {
  assertHas(migration, /previous_form_datetime[\s\S]*current_form_datetime/i);
});

test("17. carts track previous and current intended_arrival_at", () => {
  assertHas(migration, /previous_intended_arrival_at[\s\S]*current_intended_arrival_at/i);
});

test("18. carts changed_fields are calculated field-by-field", () => {
  for (const field of ["form_datetime", "intended_arrival_at", "intended_arrival_date", "intended_departure_at", "intended_departure_date", "intended_days", "message_sent", "message_id", "cms_url", "updated_at_source", "parking_code", "type", "identity_email_hash", "identity_phone_hash", "row_hash"]) {
    assertHas(migration, new RegExp(`then '${field}'`, "i"));
  }
});

test("19. carts response JSON contract remains aggregate-only", () => {
  assertHas(migration, /'insertedRows', v_inserted_rows/i);
  assertHas(migration, /'updatedRows', v_updated_rows/i);
  assertNotHas(migration, /'affectedRows'/i);
  assertNotHas(migration, /'rowChanges'/i);
});

test("20. purchases inserts create inserted events", () => {
  assertHas(migration, /inserted_change_events as \([\s\S]*'purchases'[\s\S]*'inserted'/i);
});

test("21. purchases updates create updated events", () => {
  assertHas(migration, /updated_change_events as \([\s\S]*'purchases'[\s\S]*'updated'/i);
});

test("22. purchases duplicates do not create events", () => {
  assertHas(migration, /where existing_source_id is null\s+and existing_booking_id is null/i);
  assertHas(migration, /where existing_source_id is not null\s+and existing_source_row_hash is distinct from row_hash/i);
});

test("23. purchases track previous and current booking_created_at", () => {
  assertHas(migration, /previous_booking_created_at[\s\S]*current_booking_created_at/i);
});

test("24. purchases track booking and paying statuses", () => {
  assertHas(migration, /previous_booking_status integer/i);
  assertHas(migration, /current_paying_status text/i);
});

test("25. purchases track purchase validity", () => {
  assertHas(migration, /previous_is_valid_purchase boolean/i);
  assertHas(migration, /current_is_valid_purchase boolean/i);
});

test("26. purchases track price", () => {
  assertHas(migration, /previous_price numeric\(12,2\)/i);
  assertHas(migration, /current_price numeric\(12,2\)/i);
});

test("27. purchases use identity hashes", () => {
  assertHas(migration, /public\.recovery_import_safe_identity_hash\(updated_rows\.source_booking_id\)/i);
  assertHas(migration, /public\.recovery_import_safe_identity_hash\(inserted_rows\.email_normalized\)/i);
});

test("28. purchases changed_fields are calculated field-by-field", () => {
  for (const field of ["booking_created_at", "booking_number", "booking_status", "paying_status", "is_valid_purchase", "price", "parking_code", "identity_email_hash", "identity_phone_hash", "row_hash"]) {
    assertHas(migration, new RegExp(`then '${field}'`, "i"));
  }
});

test("29. purchases response JSON contract remains aggregate-only", () => {
  assertHas(migration, /'insertedAmount', v_inserted_amount/i);
  assertNotHas(migration, /'affectedRows'/i);
  assertNotHas(migration, /'rowChanges'/i);
});

test("30. unique key prevents duplicate events for the same batch source entity operation", () => {
  assertHas(migration, /unique \(batch_id, source, entity_id, operation\)/i);
  assertHas(migration, /on conflict \(batch_id, source, entity_id, operation\) do nothing/i);
});

test("31. insert and update operations are differentiated", () => {
  assertHas(migration, /operation text not null/i);
  assertHas(migration, /'inserted'/i);
  assertHas(migration, /'updated'/i);
});

test("32. event writes happen inside the import RPC CTE chain", () => {
  assertHas(migration, /create or replace function public\.import_recovery_incomplete_bookings[\s\S]*insert into public\.recovery_import_row_changes/i);
  assertHas(migration, /create or replace function public\.import_recovery_purchases[\s\S]*insert into public\.recovery_import_row_changes/i);
});

test("33. event failures are transactional with the import by design", () => {
  assertHas(doc, /misma transaccion/i);
  assertHas(doc, /si la escritura del evento falla/i);
});

test("34. migration avoids raw PII in event inserts", () => {
  assertNotHas(migration, /previous_email_normalized|current_email_normalized|previous_phone_normalized|current_phone_normalized/i);
  assertNotHas(migration, /previous_message_id|current_message_id/i);
});

test("35. endpoints are not changed to expose row events", () => {
  assertNotHas(cartsEndpoint, /recovery_import_row_changes|affectedRows|rowChanges/i);
  assertNotHas(purchasesEndpoint, /recovery_import_row_changes|affectedRows|rowChanges/i);
});

test("36. snapshots are not connected automatically", () => {
  assertNotHas(snapshotsHelper, /recovery_import_row_changes/i);
  assertHas(doc, /snapshots todavia no estan conectados/i);
});

test("37. no unrelated recovery or orchestrator surfaces are modified by this test contract", () => {
  assert.ok(existsSync(migrationPath));
  assert.ok(existsSync(docPath));
  assertNotHas(migration, /message_memory|tracking|orquestador/i);
});


test("38. carts changed_fields includes every mutable field tracked by the event", () => {
  for (const field of [
    "form_datetime",
    "intended_arrival_at",
    "intended_arrival_date",
    "intended_departure_at",
    "intended_departure_date",
    "intended_days",
    "message_sent",
    "message_id",
    "cms_url",
    "updated_at_source",
    "parking_code",
    "type",
    "identity_email_hash",
    "identity_phone_hash",
    "row_hash",
  ]) {
    assertHas(migration, new RegExp(`'${field}'`, "i"));
  }
});

test("39. unchanged fields are omitted through case expressions", () => {
  assertHas(migration, /case when updated_rows\.previous_message_sent is distinct from updated_rows\.current_message_sent then 'message_sent' end/i);
  assertHas(migration, /array_remove\(array\[/i);
});

test("40. null to value changes are covered by IS DISTINCT FROM", () => {
  assertHas(migration, /previous_intended_departure_at is distinct from updated_rows\.current_intended_departure_at/i);
});

test("41. value to null changes are covered by IS DISTINCT FROM", () => {
  assertHas(migration, /previous_updated_at_source is distinct from updated_rows\.current_updated_at_source/i);
});

test("42. identity field names use safe email hash naming", () => {
  assertHas(migration, /'identity_email_hash'/i);
  assertNotHas(migration, /then 'email'/i);
});

test("43. identity field names use safe phone hash naming", () => {
  assertHas(migration, /'identity_phone_hash'/i);
  assertNotHas(migration, /then 'phone'/i);
});

test("44. message_sent is emitted when it changes", () => {
  assertHas(migration, /previous_message_sent is distinct from updated_rows\.current_message_sent then 'message_sent'/i);
});

test("45. message_id is only a changed field name and not an event value column", () => {
  const tableDefinition = migration.slice(
    migration.indexOf("create table if not exists public.recovery_import_row_changes"),
    migration.indexOf("create index if not exists recovery_import_row_changes_batch_id_idx"),
  );
  assertNotHas(tableDefinition, /message_id/i);
  assertHas(migration, /message_id_changed then 'message_id'/i);
});

test("46. cms_url is only a changed field name and not persisted as a URL value", () => {
  const tableDefinition = migration.slice(
    migration.indexOf("create table if not exists public.recovery_import_row_changes"),
    migration.indexOf("create index if not exists recovery_import_row_changes_batch_id_idx"),
  );
  assertNotHas(tableDefinition, /cms_url/i);
  assertHas(migration, /cms_url_changed then 'cms_url'/i);
});

test("47. departure fields appear when they change", () => {
  assertHas(migration, /then 'intended_departure_at'/i);
  assertHas(migration, /then 'intended_departure_date'/i);
});

test("48. update events cannot have empty changed_fields", () => {
  assertHas(migration, /constraint recovery_import_row_changes_changed_fields_nonempty_check/i);
  assertHas(migration, /where updated_rows\.previous_row_hash is distinct from updated_rows\.current_row_hash/i);
});

test("49. purchases changed_fields covers every mutable purchase field", () => {
  for (const field of [
    "booking_created_at",
    "booking_number",
    "booking_status",
    "paying_status",
    "is_valid_purchase",
    "price",
    "parking_code",
    "identity_email_hash",
    "identity_phone_hash",
    "row_hash",
  ]) {
    assertHas(migration, new RegExp(`'${field}'`, "i"));
  }
});

test("50. documentation includes an explicit retention policy", () => {
  assertHas(doc, /Retencion inicial/i);
  assertHas(doc, /60 a 90 dias/i);
  assertHas(doc, /12 meses/i);
});

test("51. documentation clearly states pseudonymization limits", () => {
  assertHas(doc, /pseudonimizacion/i);
  assertHas(doc, /no anonimizacion perfecta/i);
  assertHas(doc, /ataques de diccionario|espacios de busqueda acotados/i);
});

test("52. migration does not add automatic DELETE cleanup", () => {
  assertNotHas(migration, /delete\s+from\s+public\.recovery_import_row_changes/i);
  assertNotHas(migration, /create\s+(?:or\s+replace\s+)?function[\s\S]{0,200}delete\s+from/i);
});

test("53. migration and docs do not add cleanup cron", () => {
  assertNotHas(migration, /cron|pg_cron|schedule/i);
  assertHas(doc, /no se crea cron de limpieza/i);
});

test("54. snapshots remain disconnected after retention and changed_fields refinements", () => {
  assertNotHas(snapshotsHelper, /recovery_import_row_changes/i);
  assertHas(doc, /snapshots todavia no estan conectados/i);
});
