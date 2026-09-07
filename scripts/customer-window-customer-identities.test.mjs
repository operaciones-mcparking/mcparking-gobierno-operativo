import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260907170000_add_customer_window_customer_identities.sql",
  "utf8",
);
const view = readFileSync("src/app/orquestador/customer-window-view.tsx", "utf8");
const route = readFileSync("src/app/api/orquestador/customer-window/customers/route.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");

test("adds a dedicated active-customer identities RPC", () => {
  assert.match(migration, /create or replace function public\.customer_window_get_customer_identities\(p_customer_id uuid\)/);
  assert.match(migration, /profile\.id = p_customer_id[\s\S]*profile\.status = 'active'/);
  assert.match(migration, /customer_not_found/);
});

test("confirmed identities contain only active email phone and plate values", () => {
  assert.match(migration, /link\.status = 'active'/);
  assert.match(migration, /link\.identity_type in \('email', 'phone', 'plate'\)/);
  for (const key of ["emails", "phones", "plates"]) assert.match(migration, new RegExp(`'${key}', confirmed\\.${key}`));
});

test("candidate plates are exposed separately with confidence", () => {
  assert.match(migration, /link\.status = 'candidate'[\s\S]*link\.identity_type = 'plate'/);
  assert.match(migration, /jsonb_build_object\('value', pending\.value, 'confidence', pending\.confidence\)/);
  assert.match(migration, /'pending', jsonb_build_object\('plates', pending_plates\.values\)/);
});

test("candidate email and phone values are counted but not exposed", () => {
  assert.match(migration, /pending_counts as \([\s\S]*identity_type = 'email'[\s\S]*identity_type = 'phone'[\s\S]*link\.status = 'candidate'/);
  assert.match(migration, /'pendingCounts'/);
  const pendingPayload = migration.slice(migration.indexOf("'pending',"), migration.indexOf("'pendingCounts',"));
  assert.doesNotMatch(pendingPayload, /'emails'/);
  assert.doesNotMatch(pendingPayload, /'phones'/);
});

test("conflicts return counts without identity values and rejected links are omitted", () => {
  assert.match(migration, /conflict_counts as \([\s\S]*link\.status = 'conflict'/);
  assert.match(migration, /'conflictCounts'/);
  assert.doesNotMatch(migration, /status = 'rejected'/);
  assert.doesNotMatch(migration, /'conflicts'[\s\S]*identity_value_normalized/i);
});

test("identities RPC is service-role only", () => {
  assert.match(migration, /security definer\s+set search_path = ''/);
  assert.match(migration, /revoke all on function public\.customer_window_get_customer_identities\(uuid\)[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.customer_window_get_customer_identities\(uuid\)[\s\S]*to service_role/);
});

test("admin helper and route keep privileged access server-side", () => {
  assert.match(admin, /getCustomerWindowIdentities\(customerId: string\)[\s\S]*\.rpc\("customer_window_get_customer_identities"[\s\S]*p_customer_id: customerId/);
  assert.match(route, /getActiveAdminUser\(\)/);
  assert.match(route, /uuidPattern\.test\(customerId\)[\s\S]*action === "identities"[\s\S]*getCustomerWindowIdentities\(customerId\)/);
  assert.doesNotMatch(view + route, /SUPABASE_SERVICE_ROLE_KEY|createClient\(/);
});

test("more information loads identities lazily and caches them for the selected customer", () => {
  assert.match(view, /async function openInformation\(\)[\s\S]*setDetailView\("information"\)/);
  assert.match(view, /if \(identities \|\| identitiesLoading \|\| !customerId\) return/);
  assert.match(view, /action=identities&customerId=\$\{customerId\}/);
  assert.match(view, /customerId[\s\S]*setIdentities\(null\)/);
});

test("information panel separates confirmed candidate and conflict presentation", () => {
  for (const label of ["Emails confirmados", "Teléfonos confirmados", "Patentes confirmadas", "Patentes por confirmar", "Por confirmar"]) {
    assert.match(view, new RegExp(label));
  }
  assert.match(view, /identities\.confirmed\.emails/);
  assert.match(view, /identities\.confirmed\.phones/);
  assert.match(view, /identities\.confirmed\.plates/);
  assert.match(view, /identities\.pending\.plates/);
  assert.match(view, /identities\.conflictCounts\.emails[\s\S]*identities\.conflictCounts\.phones[\s\S]*identities\.conflictCounts\.plates/);
  assert.match(view, /identidades requieren[\s\S]*revisión/);
});

test("secondary views return to the same customer detail and timeline stays in main", () => {
  const drawer = view.slice(view.indexOf("function CustomerDetailDrawer"), view.indexOf("export function CustomerWindowView"));
  assert.match(view, /aria-label="Volver al detalle del cliente"/);
  assert.match(drawer, /onBack=\{\(\) => setDetailView\("main"\)\}/g);
  assert.match(drawer, /aria-hidden=\{detailView !== "main"\}[\s\S]*Historial de compras/);
  assert.match(drawer, /aria-hidden=\{detailView !== "economics"\}[\s\S]*aria-hidden=\{detailView !== "information"\}/);
  assert.doesNotMatch(drawer, /setSelectedCustomerId\(null\)[\s\S]*Volver al detalle/);
});
