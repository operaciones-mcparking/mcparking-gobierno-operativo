import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardSource = readFileSync("src/lib/dashboard/data.ts", "utf8");

function getAuditRowsBlock() {
  const start = dashboardSource.indexOf("export async function getRecoveryCartAuditRows");
  const end = dashboardSource.indexOf("export async function getRecoveryCartStatusSummary");

  assert.ok(start > -1, "getRecoveryCartAuditRows must exist");
  assert.ok(end > start, "getRecoveryCartAuditRows block must end before getRecoveryCartStatusSummary");

  return dashboardSource.slice(start, end);
}

test("recovery cart audit default load is not silently capped at 2000 rows", () => {
  const block = getAuditRowsBlock();

  assert.match(block, /getRecoveryCartAuditRows\(limit\?: number \| null, selectedCartDate\?: string \| null\)/);
  assert.doesNotMatch(block, /getRecoveryCartAuditRows\(limit\s*=\s*2000/);
  assert.match(block, /fetchPagedRecoveryRows<CartAuditFeatureRow>\(fetchCartRows\)/);
  assert.match(block, /fetchLimitedRecoveryRows<CartAuditFeatureRow>\(fetchCartRows, limit\)/);
  assert.match(block, /typeof limit === "number" && Number\.isFinite\(limit\)/);
});

test("recovery cart audit keeps deterministic pagination order across all pages", () => {
  const block = getAuditRowsBlock();

  assert.match(block, /\.from\("recovery_cart_features_v2"\)/);
  assert.match(block, /\.gte\("form_datetime", featureWindowStart\)/);
  assert.match(block, /\.lt\("form_datetime", featureWindowEnd\)/);
  assert.match(block, /\.order\("form_datetime", \{ ascending: false \}\)[\s\S]*\.order\("cart_id", \{ ascending: true \}\)/);
});
