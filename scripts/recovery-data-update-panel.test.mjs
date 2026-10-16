import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/recuperacion/page.tsx", "utf8");
const panel = readFileSync("src/app/recuperacion/recovery-data-update-accordion.tsx", "utf8");
const statusSource = readFileSync("src/lib/recuperacion/recovery-data-updates.ts", "utf8");

test("renders the compact update panel without the legacy data administration surface", () => {
  assert.match(page, /<RecoveryDataUpdateBlock \/>/);
  assert.doesNotMatch(
    page,
    /RecoveryAdminDataAccordion|RecoveryLatestImportsBlock|RecoveryImportHistoryBlock|PurchasesUploadMock|IncompleteBookingsUploadMock|TrackingUploadCard|MessageMemoryUploadCard/,
  );
  assert.match(panel, /Actualización de datos/);
  assert.match(panel, /Seguimiento de sincronizaciones automáticas/);
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
  assert.match(statusSource, /getRecoveryDataUpdateStatuses\(\)/);
  assert.doesNotMatch(statusSource, /request\.|params\.workflow/i);
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
  assert.match(panel, /Última ejecución/);
  assert.doesNotMatch(panel, /Última actualización conocida/);
  assert.match(panel, /whitespace-nowrap/);
  assert.match(panel, /DD|formatToParts/);
});

test("builds secure direct links to the verified n8n host", () => {
  assert.match(statusSource, /https:\/\/n8n\.mcparking\.cl\/workflow/);
  assert.match(panel, /href=\{process\.workflowUrl\}/);
  assert.match(panel, /target="_blank"/);
  assert.match(panel, /rel="noopener noreferrer"/);
  assert.doesNotMatch(statusSource, /NEXT_PUBLIC_N8N|N8N_RECOVERY.*SECRET/);
});

test("reads one successful execution per workflow through a cached server-side request", () => {
  assert.match(statusSource, /\/api\/v1\/executions/);
  assert.match(statusSource, /includeData: "false"/);
  assert.match(statusSource, /limit: "1"/);
  assert.match(statusSource, /status: "success"/);
  assert.match(statusSource, /workflowId/);
  assert.match(statusSource, /"X-N8N-API-KEY": apiKey/);
  assert.match(statusSource, /unstable_cache/);
  assert.match(statusSource, /revalidate: 60/);
  assert.match(statusSource, /N8N_EXECUTIONS_TIMEOUT_MS = 2500/);
  assert.match(statusSource, /Promise\.all/);
  assert.doesNotMatch(statusSource, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});

test("fails soft without exposing credentials or blocking the rest of recovery", () => {
  assert.match(statusSource, /process\.env\.N8N_API_KEY/);
  assert.match(statusSource, /if \(!apiKey\).*map\(\(\) => null\)/s);
  assert.match(statusSource, /if \(!response\.ok\) return null/);
  assert.match(statusSource, /catch \{\s*return null;/);
  assert.match(page, /<Suspense fallback=\{<RecoveryCompactLoading/);
  assert.doesNotMatch(panel, /N8N_API_KEY|X-N8N-API-KEY/);
});

test("keeps targeted attribution documented but outside the workflow list", () => {
  assert.match(statusSource, /RECOVERY_TARGETED_ATTRIBUTION_RPC/);
  assert.match(statusSource, /refresh_recovery_cart_recovery_status_v2_for_purchases/);
  assert.doesNotMatch(panel, /refresh_recovery_cart_recovery_status_v2_for_purchases/);
});
