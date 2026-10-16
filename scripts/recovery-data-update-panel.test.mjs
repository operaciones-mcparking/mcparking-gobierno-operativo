import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/recuperacion/page.tsx", "utf8");
const panel = readFileSync("src/app/recuperacion/recovery-data-update-accordion.tsx", "utf8");
const statusSource = readFileSync("src/lib/recuperacion/recovery-data-updates.ts", "utf8");

test("renders the data update panel before data administration", () => {
  assert.ok(page.indexOf("<RecoveryDataUpdateBlock />") < page.indexOf("<RecoveryAdminDataAccordion>"));
  assert.match(panel, /Actualización de datos/);
  assert.match(panel, /Control manual y seguimiento de sincronizaciones/);
});

test("uses a fixed server-side process allowlist", () => {
  for (const id of [
    "16OMJ9MvjhyWEeWB",
    "fi2Q8oXQL0Y7hwY0",
    "f9ExZ4etVzMixUru",
    "wJy3N0v5qUtZKecj",
  ]) {
    assert.match(statusSource, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(statusSource, /request|searchParams|params\.workflow/i);
});

test("renders four compact workflow rows without execution controls or technical ids", () => {
  assert.match(panel, /<li className="grid gap-3 border-t/);
  assert.match(panel, /process\.name/);
  assert.match(panel, /process\.description/);
  assert.match(panel, /process\.schedule/);
  assert.match(panel, /formatDate\(process\.lastObservedAt\)/);
  assert.doesNotMatch(panel, /process\.id|Ejecución no configurada|Resultado observado|Workflow n8n/);
  assert.doesNotMatch(panel, /fetch\(|axios|onSubmit/);
  assert.equal((statusSource.match(/workflowId: "/g) ?? []).length, 4);
});

test("builds secure direct links to the verified n8n host", () => {
  assert.match(statusSource, /https:\/\/n8n\.mcparking\.cl\/workflow/);
  assert.match(panel, /href=\{process\.workflowUrl\}/);
  assert.match(panel, /target="_blank"/);
  assert.match(panel, /rel="noopener noreferrer"/);
  assert.doesNotMatch(statusSource, /N8N_API_KEY|N8N_RECOVERY.*SECRET/);
});

test("reads only certified successful cart batch timestamps", () => {
  assert.match(statusSource, /\.from\("recovery_import_batches"\)/);
  assert.match(statusSource, /\.select\("import_type,created_at,confirmed_at"\)/);
  assert.match(statusSource, /\.eq\("status", "imported"\)/);
  assert.match(statusSource, /incomplete_bookings_v2_incremental/);
  assert.match(statusSource, /incomplete_bookings_v2_recent_reconcile/);
  assert.doesNotMatch(statusSource, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});

test("keeps targeted attribution documented but outside the workflow list", () => {
  assert.match(statusSource, /RECOVERY_TARGETED_ATTRIBUTION_RPC/);
  assert.match(statusSource, /refresh_recovery_cart_recovery_status_v2_for_purchases/);
  assert.doesNotMatch(panel, /refresh_recovery_cart_recovery_status_v2_for_purchases/);
});
