import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const helperPath = "src/lib/recuperacion/recovery-snapshot-comparison.ts";
const routePath = "src/app/api/recuperacion/snapshots/compare/route.ts";
const uiPath = "src/app/recuperacion/recovery-cart-audit-table.tsx";
const orchestratorPath = "src/app/orquestador/page.tsx";

const helper = readFileSync(helperPath, "utf8");
const route = readFileSync(routePath, "utf8");
const ui = readFileSync(uiPath, "utf8");
const orchestrator = readFileSync(orchestratorPath, "utf8");

function assertHas(source, pattern, message) {
  assert.match(source, pattern, message);
}

function assertNotHas(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

function loadHelperExports() {
  const module = { exports: {} };
  const output = ts.transpileModule(helper, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: helperPath,
  }).outputText;

  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    process: { env: {} },
    require(name) {
      if (name === "server-only") return {};
      if (name === "@supabase/supabase-js") return { createClient: () => ({}) };
      if (name === "@/lib/recuperacion/recovery-attribution") {
        return { RECOVERY_ATTRIBUTION_CALCULATION_VERSION: "v1-intended-arrival" };
      }
      throw new Error(`Unexpected require in snapshot comparison test: ${name}`);
    },
    Intl,
    Date,
    Error,
    Number,
    Promise,
    Set,
  });

  return module.exports;
}

const {
  getRecoverySnapshotComparison,
  isValidRecoverySnapshotWeekStart,
  recoverySnapshotWeekEnd,
  shortId,
} = loadHelperExports();

function snapshot(overrides = {}) {
  return {
    calculation_version: "v1-intended-arrival",
    id: "536c3769-0000-4000-8000-000000000000",
    recovered_amount: 2723419,
    recovered_confirmed: 93,
    recovery_rate: 40.969162995594715,
    snapshot_at: "2026-08-03T16:00:00.000Z",
    week_end: "2026-07-27",
    week_start: "2026-07-20",
    ...overrides,
  };
}

const previousSnapshot = snapshot({
  id: "97b94048-0000-4000-8000-000000000000",
  recovered_amount: 2695041,
  recovered_confirmed: 90,
  recovery_rate: 39.64757709251101,
  snapshot_at: "2026-08-03T14:00:00.000Z",
});

const currentSnapshot = snapshot();

function compareRow(overrides = {}) {
  return {
    amount_changed: true,
    cart_changed: false,
    cart_id: "32a66aef-0000-4000-8000-000000000000",
    current_amount: 0,
    current_purchase_id: "b0a014c6-0000-4000-8000-000000000000",
    current_status: "recovered_pack",
    previous_amount: null,
    previous_purchase_id: null,
    previous_status: "unrecovered",
    probable_change_reason: "recovery_status_changed",
    purchase_changed: true,
    purchase_data_changed: true,
    status_changed: true,
    ...overrides,
  };
}

const realComparisonRows = [
  compareRow(),
  compareRow({
    amount_changed: true,
    cart_id: "4b838a49-0000-4000-8000-000000000000",
    current_amount: 13930,
    current_purchase_id: "ceaad2ce-0000-4000-8000-000000000000",
    current_status: "recovered_with_amount",
  }),
  compareRow({
    amount_changed: true,
    cart_id: "dd1241eb-0000-4000-8000-000000000000",
    current_amount: 14448,
    current_purchase_id: "679ca572-0000-4000-8000-000000000000",
    current_status: "recovered_with_amount",
  }),
  ...Array.from({ length: 39 }, (_unused, index) =>
    compareRow({
      amount_changed: false,
      cart_id: `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`,
      current_amount: null,
      current_purchase_id: null,
      current_status: "unrecovered",
      previous_amount: null,
      previous_purchase_id: null,
      previous_status: "unrecovered",
      probable_change_reason: index < 36 ? "purchase_data_changed" : "unchanged",
      purchase_changed: false,
      purchase_data_changed: index < 36,
      status_changed: false,
    }),
  ),
  ...Array.from({ length: 185 }, (_unused, index) =>
    compareRow({
      amount_changed: false,
      cart_id: `aaaa${String(index).padStart(4, "0")}-0000-4000-8000-000000000000`,
      current_amount: null,
      current_purchase_id: null,
      current_status: "unrecovered",
      previous_amount: null,
      previous_purchase_id: null,
      previous_status: "unrecovered",
      probable_change_reason: "unchanged",
      purchase_changed: false,
      purchase_data_changed: false,
      status_changed: false,
    }),
  ),
];

function event(overrides = {}) {
  return {
    batch_id: "6048e2f8-0000-4000-8000-000000000000",
    changed_fields: ["booking_created_at", "row_hash", "identity_email_hash", "message_id"],
    created_at: "2026-08-03T15:29:01.818Z",
    entity_id: "b0a014c6-0000-4000-8000-000000000000",
    id: "10000000-0000-4000-8000-000000000000",
    operation: "updated",
    source: "purchases",
    ...overrides,
  };
}

const realEvents = [
  event(),
  event({
    entity_id: "ceaad2ce-0000-4000-8000-000000000000",
    id: "10000001-0000-4000-8000-000000000000",
  }),
  event({
    entity_id: "679ca572-0000-4000-8000-000000000000",
    id: "10000002-0000-4000-8000-000000000000",
  }),
];

class QueryMock {
  constructor(table, rows, calls, errors) {
    this.table = table;
    this.rows = rows;
    this.calls = calls;
    this.errors = errors;
    this.filters = [];
    this.limitValue = null;
    this.orders = [];
  }

  select(columns) {
    this.calls.selects.push({ columns, table: this.table });
    return this;
  }

  eq(field, value) {
    this.filters.push({ field, op: "eq", value });
    return this;
  }

  gte(field, value) {
    this.filters.push({ field, op: "gte", value });
    return this;
  }

  lte(field, value) {
    this.filters.push({ field, op: "lte", value });
    return this;
  }

  in(field, value) {
    this.filters.push({ field, op: "in", value });
    return this;
  }

  order(field, options = {}) {
    this.orders.push({ ascending: options.ascending !== false, field });
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  apply() {
    const error = this.errors[this.table] ?? null;
    let data = [...(this.rows[this.table] ?? [])];

    for (const filter of this.filters) {
      if (filter.op === "eq") data = data.filter((row) => row[filter.field] === filter.value);
      if (filter.op === "gte") data = data.filter((row) => row[filter.field] >= filter.value);
      if (filter.op === "lte") data = data.filter((row) => row[filter.field] <= filter.value);
      if (filter.op === "in") data = data.filter((row) => filter.value.includes(row[filter.field]));
    }

    if (this.orders.length > 0) {
      data.sort((left, right) => {
        for (const order of this.orders) {
          const comparison = String(left[order.field]).localeCompare(String(right[order.field]));
          if (comparison !== 0) return order.ascending ? comparison : comparison * -1;
        }
        return 0;
      });
    }

    return { data, error };
  }

  range(from, to) {
    this.calls.queries.push({ filters: this.filters, orders: this.orders, range: [from, to], table: this.table });
    const { data, error } = this.apply();
    if (this.errors[`${this.table}:range:${from}`]) return Promise.resolve({ data: null, error: this.errors[`${this.table}:range:${from}`] });
    return Promise.resolve({ data: data.slice(from, to + 1), error });
  }

  then(resolve) {
    this.calls.queries.push({ filters: this.filters, limit: this.limitValue, orders: this.orders, table: this.table });
    const { data, error } = this.apply();
    const limited = this.limitValue !== null ? data.slice(0, this.limitValue) : data;
    return Promise.resolve({ data: limited, error }).then(resolve);
  }
}

function createSupabaseMock({ compareRows = [], errors = {}, events = [], snapshots = [] } = {}) {
  const calls = { queries: [], rpcs: [], selects: [] };

  return {
    calls,
    supabase: {
      from(table) {
        return new QueryMock(
          table,
          {
            recovery_import_row_changes: events,
            recovery_weekly_snapshots: snapshots,
          },
          calls,
          errors,
        );
      },
      rpc(name, params) {
        calls.rpcs.push({ name, params });
        return Promise.resolve({ data: compareRows, error: errors[name] ?? null });
      },
    },
  };
}

async function compareWith({ compareRows = realComparisonRows, events = realEvents, snapshots = [previousSnapshot, currentSnapshot] } = {}) {
  const { supabase } = createSupabaseMock({ compareRows, events, snapshots });
  return getRecoverySnapshotComparison("2026-07-20", { supabase });
}

test("1. helper is server-only", () => {
  assertHas(helper, /^import "server-only";/);
});

test("2. endpoint GET exists", () => {
  assertHas(route, /export async function GET\(request: NextRequest\)/);
});

test("3. route exports no invalid fields", () => {
  assertNotHas(route, /export (const|function) (?!GET\b)/);
});

test("4. auth is required", () => {
  assertHas(route, /supabase\.auth\.getUser\(\)/);
  assertHas(route, /No autenticado/);
});

test("5. active admin is required", () => {
  assertHas(route, /app_role/);
  assertHas(route, /profile\.app_role !== "admin"/);
  assertHas(route, /profile\.status !== "active"/);
});

test("6. weekStart is required", () => {
  assertHas(route, /searchParams\.get\("weekStart"\)/);
  assertHas(route, /Parametro weekStart invalido/);
});

test("7. invalid format is rejected", () => {
  assert.equal(isValidRecoverySnapshotWeekStart("30-07-2026"), false);
  assert.equal(isValidRecoverySnapshotWeekStart("2026-07-21"), false);
});

test("8. week without snapshots returns missing_current", async () => {
  const { supabase } = createSupabaseMock();
  const result = await getRecoverySnapshotComparison("2026-07-20", { supabase });
  assert.equal(result.available, false);
  assert.equal(result.reason, "missing_current");
});

test("9. one snapshot returns missing_previous", async () => {
  const { supabase } = createSupabaseMock({ snapshots: [currentSnapshot] });
  const result = await getRecoverySnapshotComparison("2026-07-20", { supabase });
  assert.equal(result.available, false);
  assert.equal(result.reason, "missing_previous");
  assert.equal(result.currentSnapshot.idShort, "536c3769");
});

test("10. two snapshots are compared", async () => {
  const result = await compareWith();
  assert.equal(result.available, true);
  assert.equal(result.reason, "ok");
});

test("11. more than two snapshots uses the two most recent", async () => {
  const olderSnapshot = snapshot({ id: "11111111-0000-4000-8000-000000000000", snapshot_at: "2026-08-01T00:00:00.000Z" });
  const { calls, supabase } = createSupabaseMock({ compareRows: [], snapshots: [olderSnapshot, previousSnapshot, currentSnapshot] });
  await getRecoverySnapshotComparison("2026-07-20", { supabase });
  assert.equal(calls.rpcs[0].params.p_previous_snapshot_id, previousSnapshot.id);
  assert.equal(calls.rpcs[0].params.p_current_snapshot_id, currentSnapshot.id);
});

test("12. different versions are not selected", async () => {
  const wrongVersion = snapshot({ calculation_version: "v0-legacy" });
  const { supabase } = createSupabaseMock({ snapshots: [wrongVersion] });
  const result = await getRecoverySnapshotComparison("2026-07-20", { supabase });
  assert.equal(result.reason, "missing_current");
});

test("13. no changes returns no_changes", async () => {
  const result = await compareWith({
    compareRows: [compareRow({ amount_changed: false, current_status: "unrecovered", previous_status: "unrecovered", probable_change_reason: "unchanged", purchase_changed: false, purchase_data_changed: false, status_changed: false })],
  });
  assert.equal(result.reason, "no_changes");
  assert.equal(result.changes.length, 0);
});

test("14. positive changes are represented", async () => {
  const result = await compareWith();
  assert.equal(result.delta.recoveredConfirmed, 3);
});

test("15. negative changes are represented", async () => {
  const downCurrent = snapshot({ recovered_amount: 2500, recovered_confirmed: 8, recovery_rate: 8, snapshot_at: "2026-08-03T16:00:00.000Z" });
  const downPrevious = snapshot({ id: previousSnapshot.id, recovered_amount: 3000, recovered_confirmed: 10, recovery_rate: 10, snapshot_at: "2026-08-03T14:00:00.000Z" });
  const result = await compareWith({ snapshots: [downPrevious, downCurrent] });
  assert.equal(result.delta.recoveredConfirmed, -2);
  assert.equal(result.delta.recoveredAmount, -500);
});

test("16. rate delta is calculated", async () => {
  const result = await compareWith();
  assert.ok(Math.abs(result.delta.recoveryRatePoints - 1.3215859030837047) < 0.000001);
});

test("17. recovered delta is calculated", async () => {
  const result = await compareWith();
  assert.equal(result.delta.recoveredConfirmed, 3);
});

test("18. amount delta is calculated", async () => {
  const result = await compareWith();
  assert.equal(result.delta.recoveredAmount, 28378);
});

test("19. counts are calculated", async () => {
  const result = await compareWith();
  assert.equal(result.counts.totalRows, 227);
  assert.equal(result.counts.statusChanged, 3);
  assert.equal(result.counts.purchaseChanged, 3);
  assert.equal(result.counts.amountChanged, 3);
  assert.equal(result.counts.purchaseDataChanged, 39);
});

test("20. compare RPC is called with correct IDs", async () => {
  const { calls, supabase } = createSupabaseMock({ compareRows: [], snapshots: [previousSnapshot, currentSnapshot] });
  await getRecoverySnapshotComparison("2026-07-20", { supabase });
  assert.equal(JSON.stringify(calls.rpcs[0]), JSON.stringify({
    name: "recovery_compare_snapshots",
    params: {
      p_current_snapshot_id: currentSnapshot.id,
      p_previous_snapshot_id: previousSnapshot.id,
    },
  }));
});

test("21. full UUIDs are not exposed", async () => {
  const result = await compareWith();
  assert.doesNotMatch(JSON.stringify(result), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

test("22. IDs are shortened to 8 characters", async () => {
  const result = await compareWith();
  assert.equal(result.previousSnapshot.idShort.length, 8);
  assert.equal(result.changes[0].cartIdShort.length, 8);
  assert.equal(result.changes[0].purchaseIdShort.length, 8);
});

test("23. no email is exposed", () => {
  assertNotHas(helper, /email_normalized|email\b/i);
});

test("24. no phone is exposed", () => {
  assertNotHas(helper, /phone_normalized|phone\b/i);
});

test("25. no WAMID is exposed", () => {
  assertNotHas(helper, /wamid|wa_id/i);
});

test("26. row hashes are not exposed in DTO", () => {
  assertNotHas(helper, /cart_row_hash:\s|purchase_row_hash:\s|payload_hash/i);
});

test("27. payload_hash is not selected", () => {
  assertNotHas(helper, /payload_hash/);
});

test("28. changed_fields uses an allowlist", async () => {
  const result = await compareWith();
  assert.deepEqual(result.changes[0].triggerChangedFields, ["booking_created_at"]);
});

test("29. message_id is excluded", async () => {
  const result = await compareWith();
  assert.doesNotMatch(JSON.stringify(result), /message_id/);
});

test("30. identity hashes are excluded", async () => {
  const result = await compareWith();
  assert.doesNotMatch(JSON.stringify(result), /identity_(email|phone)_hash/);
});

test("31. high causality is detected", async () => {
  const result = await compareWith();
  assert.equal(result.changes[0].triggerBatchConfidence, "high");
});

test("32. medium causality is detected", async () => {
  const result = await compareWith({ events: [event({ changed_fields: ["cms_url"] })], compareRows: [realComparisonRows[0]] });
  assert.equal(result.changes[0].triggerBatchConfidence, "medium");
});

test("33. low causality is detected", async () => {
  const result = await compareWith({ events: [event({ entity_id: realComparisonRows[0].cart_id, source: "purchases" })], compareRows: [realComparisonRows[0]] });
  assert.equal(result.changes[0].triggerBatchConfidence, "low");
});

test("34. no event leaves causal data null", async () => {
  const result = await compareWith({ compareRows: [realComparisonRows[0]], events: [] });
  assert.equal(result.changes[0].triggerBatchConfidence, null);
});

test("35. compare RPC errors are safe", async () => {
  const { supabase } = createSupabaseMock({ errors: { recovery_compare_snapshots: { message: "raw sql failure" } }, snapshots: [previousSnapshot, currentSnapshot] });
  await assert.rejects(() => getRecoverySnapshotComparison("2026-07-20", { supabase }), /Could not compare recovery snapshots/);
});

test("36. event errors degrade without failing comparison", async () => {
  const { supabase } = createSupabaseMock({ compareRows: [realComparisonRows[0]], errors: { recovery_import_row_changes: { message: "events unavailable" } }, snapshots: [previousSnapshot, currentSnapshot] });
  const result = await getRecoverySnapshotComparison("2026-07-20", { supabase });
  assert.equal(result.available, true);
  assert.equal(result.changes[0].triggerBatchConfidence, null);
});

test("37. changes are capped", async () => {
  const rows = Array.from({ length: 140 }, (_unused, index) => compareRow({ cart_id: `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000` }));
  const result = await compareWith({ compareRows: rows, events: [] });
  assert.equal(result.changes.length, 100);
});

test("38. relevant changes are ordered first", async () => {
  const rows = [
    compareRow({ amount_changed: false, current_status: "unrecovered", previous_status: "unrecovered", probable_change_reason: "purchase_data_changed", purchase_changed: false, purchase_data_changed: true, status_changed: false }),
    compareRow(),
  ];
  const result = await compareWith({ compareRows: rows, events: [] });
  assert.equal(result.changes[0].probableChangeReason, "recovery_status_changed");
});

test("39. real 2026-07-20 comparison shape is covered", async () => {
  const result = await compareWith();
  assert.equal(result.previousSnapshot.idShort, "97b94048");
  assert.equal(result.currentSnapshot.idShort, "536c3769");
  assert.equal(result.delta.recoveredConfirmed, 3);
  assert.equal(result.delta.recoveredAmount, 28378);
  assert.equal(result.counts.totalRows, 227);
  assert.equal(result.counts.statusChanged, 3);
  assert.equal(result.counts.purchaseChanged, 3);
  assert.equal(result.counts.added, 0);
  assert.equal(result.counts.removed, 0);
  assert.equal(result.explanation.triggerBatchShort, "6048e2f8");
  assert.equal(result.explanation.confidence, "high");
});

test("40. endpoint does not execute writes", () => {
  assertNotHas(route, /method:\s*"POST"|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("41. helper does not call create_recovery_weekly_snapshot", () => {
  assertNotHas(helper, /create_recovery_weekly_snapshot/);
});

test("42. imports are not touched", () => {
  assertNotHas(route, /importar/);
  assertNotHas(helper, /import_recovery_/);
});

test("43. backend endpoint and helper stay UI-free", () => {
  assertNotHas(route, /use client|RecoverySnapshotComparisonDrawer|Ver cambios/);
  assertNotHas(helper, /use client|RecoverySnapshotComparisonDrawer|Ver cambios/);
});

test("44. orchestrator is untouched by this task", () => {
  assert.ok(orchestrator.includes("McParking Dashboard"));
});

test("45. expected files exist", () => {
  assert.equal(existsSync(helperPath), true);
  assert.equal(existsSync(routePath), true);
});

test("46. current task diff is scoped", () => {
  const changedFiles = execFileSync("git", ["status", "--short", "--untracked-files=all"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"));
  const allowed = new Set([
    "scripts/recovery-snapshot-comparison-api.test.mjs",
    "scripts/recovery-whatsapp-freeform-window.test.mjs",
    "src/app/api/recuperacion/snapshots/compare/route.ts",
    "src/lib/recuperacion/recovery-snapshot-comparison.ts",
    "scripts/recovery-snapshot-comparison-ui.test.mjs",
    "src/app/recuperacion/recovery-cart-audit-table.tsx",
    "src/app/recuperacion/recovery-snapshot-comparison-drawer.tsx",
    "scripts/recovery-chat-extended-window.test.mjs",
    "src/app/api/recuperacion/carritos/[id]/chat/send/route.ts",
    "src/app/recuperacion/recovery-cart-chat-drawer.tsx",
    "src/lib/recuperacion/whatsapp-freeform-window.ts",
    "src/app/api/recuperacion/carritos/chat-indicators/route.ts",
    "scripts/recovery-whatsapp-window-indicator.test.mjs",
    "scripts/recovery-weekly-snapshots.test.mjs",
    "src/lib/recuperacion/recovery-snapshots.ts",
    "scripts/recovery-chat-extended-window.test.mjs",
    "scripts/recovery-meta-whatsapp-templates.test.mjs",
    "scripts/recovery-whatsapp-template-catalog.test.mjs",
    "scripts/recovery-whatsapp-template-endpoint.test.mjs",
    "scripts/recovery-whatsapp-template-library-ui.test.mjs",
    "scripts/recovery-whatsapp-template-preparation-ui.test.mjs",
    "scripts/recovery-whatsapp-template-send-dry-run.test.mjs",
    "scripts/recovery-whatsapp-template-meta-payload.test.mjs",
    "scripts/recovery-whatsapp-template-n8n-payload.test.mjs",
    "src/app/api/recuperacion/carritos/[id]/chat/templates/route.ts",
    "src/app/api/recuperacion/carritos/[id]/chat/send-template/route.ts",
    "src/app/recuperacion/recovery-cart-chat-drawer.tsx",
    "src/app/recuperacion/recovery-whatsapp-template-library-modal.tsx",
    "src/lib/recuperacion/meta-whatsapp-templates.ts",
    "src/lib/recuperacion/whatsapp-recovery-template-catalog.ts",
    "src/lib/recuperacion/whatsapp-template-send-payload.ts",
    "src/lib/recuperacion/whatsapp-template-n8n-payload.ts",
  ]);

  assert.equal(changedFiles.every((file) => allowed.has(file)), true, `Unexpected changed files: ${changedFiles.join(", ")}`);
});

test("47. snapshot selection uses id desc when snapshot_at ties", async () => {
  const lowerId = snapshot({ id: "aaaaaaaa-0000-4000-8000-000000000000", snapshot_at: "2026-08-03T16:00:00.000Z" });
  const higherId = snapshot({ id: "ffffffff-0000-4000-8000-000000000000", recovered_confirmed: 94, snapshot_at: "2026-08-03T16:00:00.000Z" });
  const { calls, supabase } = createSupabaseMock({ compareRows: [], snapshots: [lowerId, higherId, previousSnapshot] });
  await getRecoverySnapshotComparison("2026-07-20", { supabase });
  assert.equal(calls.rpcs[0].params.p_current_snapshot_id, higherId.id);
  assert.equal(calls.rpcs[0].params.p_previous_snapshot_id, lowerId.id);
});

test("48. snapshot query orders by snapshot_at desc and id desc before limit", async () => {
  const { calls, supabase } = createSupabaseMock({ compareRows: [], snapshots: [previousSnapshot, currentSnapshot] });
  await getRecoverySnapshotComparison("2026-07-20", { supabase });
  const snapshotQuery = calls.queries.find((query) => query.table === "recovery_weekly_snapshots");
  assert.deepEqual(snapshotQuery.orders, [
    { ascending: false, field: "snapshot_at" },
    { ascending: false, field: "id" },
  ]);
  assert.equal(snapshotQuery.limit, 2);
});

test("49. invalid real date 2026-02-30 is rejected", () => {
  assert.equal(isValidRecoverySnapshotWeekStart("2026-02-30"), false);
});

test("50. weekStart with outer spaces is rejected", () => {
  assert.equal(isValidRecoverySnapshotWeekStart(" 2026-07-20"), false);
  assert.equal(isValidRecoverySnapshotWeekStart("2026-07-20 "), false);
  assert.equal(isValidRecoverySnapshotWeekStart(" 2026-07-20 "), false);
  assertNotHas(route, /weekStart[^\n]+\.trim\(\)/);
});

test("51. Sunday and datetime weekStart values are rejected", () => {
  assert.equal(isValidRecoverySnapshotWeekStart("2026-07-19"), false);
  assert.equal(isValidRecoverySnapshotWeekStart("2026-07-20T00:00:00Z"), false);
  assert.equal(isValidRecoverySnapshotWeekStart(""), false);
});

test("52. weekEnd remains next Monday date", () => {
  assert.equal(recoverySnapshotWeekEnd("2026-07-20"), "2026-07-27");
});

test("53. shortId accepts only valid UUIDs", () => {
  assert.equal(shortId("498a3a70-dbb0-4999-bab6-d85bc9eb07c4"), "498a3a70");
  assert.equal(shortId("short"), null);
  assert.equal(shortId("not-a-uuid"), null);
  assert.equal(shortId(null), null);
  assert.equal(shortId(undefined), null);
});

test("54. invalid UUIDs become null instead of leaking raw identifiers", async () => {
  const result = await compareWith({
    compareRows: [compareRow({ cart_id: "bad", current_purchase_id: "also-bad" })],
    snapshots: [snapshot({ id: "bad-current" }), snapshot({ id: "bad-previous", snapshot_at: "2026-08-03T14:00:00.000Z" })],
  });
  assert.equal(result.currentSnapshot.idShort, null);
  assert.equal(result.changes[0].cartIdShort, null);
  assert.equal(result.changes[0].purchaseIdShort, null);
});

test("55. row_hash is excluded from public triggerChangedFields", async () => {
  const result = await compareWith({ events: [event({ changed_fields: ["row_hash", "booking_created_at"] })], compareRows: [realComparisonRows[0]] });
  assert.deepEqual(result.changes[0].triggerChangedFields, ["booking_created_at"]);
  assert.doesNotMatch(JSON.stringify(result), /row_hash/);
});

test("56. row_hash alone does not produce high confidence", async () => {
  const result = await compareWith({ events: [event({ changed_fields: ["row_hash"] })], compareRows: [realComparisonRows[0]] });
  assert.equal(result.changes[0].triggerBatchConfidence, "medium");
  assert.deepEqual(result.changes[0].triggerChangedFields, []);
});

test("57. updated_at_source alone does not produce high confidence", async () => {
  const result = await compareWith({ events: [event({ changed_fields: ["updated_at_source"] })], compareRows: [realComparisonRows[0]] });
  assert.equal(result.changes[0].triggerBatchConfidence, "medium");
});

test("58. price explains amount changes", async () => {
  const result = await compareWith({ events: [event({ changed_fields: ["price"], entity_id: realComparisonRows[1].current_purchase_id })], compareRows: [realComparisonRows[1]] });
  assert.equal(result.changes[0].triggerBatchConfidence, "high");
});

test("59. booking_created_at explains attribution appearance", async () => {
  const result = await compareWith({ events: [event({ changed_fields: ["booking_created_at"] })], compareRows: [realComparisonRows[0]] });
  assert.equal(result.changes[0].triggerBatchConfidence, "high");
});

test("60. booking validity fields explain recovered/unrecovered", async () => {
  for (const field of ["is_valid_purchase", "booking_status", "paying_status"]) {
    const result = await compareWith({ events: [event({ changed_fields: [field] })], compareRows: [realComparisonRows[0]] });
    assert.equal(result.changes[0].triggerBatchConfidence, "high");
  }
});

test("61. parking_code alone is medium", async () => {
  const result = await compareWith({
    compareRows: [compareRow({ cart_changed: true })],
    events: [event({ changed_fields: ["parking_code"], entity_id: realComparisonRows[0].cart_id, source: "carts" })],
  });
  assert.equal(result.changes[0].triggerBatchConfidence, "medium");
});

test("62. events outside the snapshot window are ignored", async () => {
  const result = await compareWith({
    compareRows: [realComparisonRows[0]],
    events: [event({ created_at: "2026-08-03T17:00:00.000Z" }), event({ created_at: "2026-08-03T13:00:00.000Z" })],
  });
  assert.equal(result.changes[0].triggerBatchConfidence, null);
});

test("63. multiple events choose the best evidence", async () => {
  const result = await compareWith({
    compareRows: [realComparisonRows[0]],
    events: [event({ changed_fields: ["cms_url"], id: "10000001-0000-4000-8000-000000000000" }), event({ changed_fields: ["booking_created_at"], id: "10000002-0000-4000-8000-000000000000" })],
  });
  assert.equal(result.changes[0].triggerBatchConfidence, "high");
  assert.deepEqual(result.changes[0].triggerChangedFields, ["booking_created_at"]);
});

test("64. same created_at uses id order and latest best tie", async () => {
  const result = await compareWith({
    compareRows: [realComparisonRows[0]],
    events: [event({ batch_id: "11111111-0000-4000-8000-000000000000", changed_fields: ["booking_created_at"], id: "10000001-0000-4000-8000-000000000000" }), event({ batch_id: "22222222-0000-4000-8000-000000000000", changed_fields: ["booking_created_at"], id: "10000002-0000-4000-8000-000000000000" })],
  });
  assert.equal(result.changes[0].triggerBatchShort, "22222222");
});

test("65. event pagination loads more than 1000 rows", async () => {
  const events = Array.from({ length: 1001 }, (_unused, index) => event({ entity_id: "99999999-0000-4000-8000-000000000000", id: `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000` }));
  events.push(event({ changed_fields: ["booking_created_at"], entity_id: realComparisonRows[0].current_purchase_id, id: "ffffffff-0000-4000-8000-000000000000" }));
  const result = await compareWith({ compareRows: [realComparisonRows[0]], events });
  assert.equal(result.changes[0].triggerBatchConfidence, "high");
});

test("66. error on a later event page degrades safely", async () => {
  const events = Array.from({ length: 1001 }, (_unused, index) => event({ id: `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000` }));
  const { supabase } = createSupabaseMock({ compareRows: [realComparisonRows[0]], errors: { "recovery_import_row_changes:range:1000": { message: "page failed" } }, events, snapshots: [previousSnapshot, currentSnapshot] });
  const result = await getRecoverySnapshotComparison("2026-07-20", { supabase });
  assert.equal(result.available, true);
  assert.equal(result.changes[0].triggerBatchConfidence, null);
});

test("67. negative delta explanation uses expected language", async () => {
  const downCurrent = snapshot({ recovered_amount: 20000, recovered_confirmed: 8, recovery_rate: 8, snapshot_at: "2026-08-03T16:00:00.000Z" });
  const downPrevious = snapshot({ id: previousSnapshot.id, recovered_amount: 30000, recovered_confirmed: 10, recovery_rate: 10, snapshot_at: "2026-08-03T14:00:00.000Z" });
  const result = await compareWith({ snapshots: [downPrevious, downCurrent] });
  assert.match(result.explanation.text, /2 carritos dejaron de estar recuperados/);
  assert.match(result.explanation.text, /El monto recuperado disminuy\u00f3 en \$10\.000/);
});

test("68. singular explanation uses singular wording", async () => {
  const oneCurrent = snapshot({ recovered_confirmed: 91, recovered_amount: 2695041, recovery_rate: 40.1 });
  const result = await compareWith({ compareRows: [realComparisonRows[0]], snapshots: [previousSnapshot, oneCurrent] });
  assert.match(result.explanation.text, /1 carrito adicional pas\u00f3 a recuperado/);
});

test("69. purchase-only changes and no_changes explanations are safe", async () => {
  const purchaseOnly = await compareWith({
    compareRows: [compareRow({ amount_changed: false, current_status: "unrecovered", previous_status: "unrecovered", purchase_changed: true, status_changed: false })],
    snapshots: [previousSnapshot, previousSnapshot],
  });
  assert.match(purchaseOnly.explanation.text, /compra atribuida cambi\u00f3/);

  const noChanges = await compareWith({
    compareRows: [compareRow({ amount_changed: false, current_status: "unrecovered", previous_status: "unrecovered", probable_change_reason: "unchanged", purchase_changed: false, purchase_data_changed: false, status_changed: false })],
  });
  assert.equal(noChanges.explanation.text, "No hubo cambios desde el snapshot anterior.");
});

test("70. added and removed changes are explained", async () => {
  const result = await compareWith({
    compareRows: [compareRow({ probable_change_reason: "added_to_snapshot" }), compareRow({ cart_id: "bbbbbbbb-0000-4000-8000-000000000000", probable_change_reason: "removed_from_snapshot" })],
  });
  assert.match(result.explanation.text, /1 carrito fue agregado/);
  assert.match(result.explanation.text, /1 carrito fue removido/);
});