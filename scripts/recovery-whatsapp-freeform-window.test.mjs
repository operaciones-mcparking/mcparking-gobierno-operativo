import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const helperPath = "src/lib/recuperacion/whatsapp-freeform-window.ts";
const getRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/route.ts";
const sendRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/send/route.ts";
const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";

const helper = readFileSync(helperPath, "utf8");
const getRoute = readFileSync(getRoutePath, "utf8");
const sendRoute = readFileSync(sendRoutePath, "utf8");
const drawer = readFileSync(drawerPath, "utf8");

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
    require(name) {
      if (name === "server-only") return {};
      throw new Error(`Unexpected require in helper test: ${name}`);
    },
  });

  return module.exports;
}

const {
  businessKeyForBusinessPhone,
  businessKeyForParking,
  classifyWhatsappFreeformWindow,
  getWhatsappFreeformWindowForCart,
} = loadHelperExports();

const MPV_BUSINESS_PHONE = "56926817602";
const EAP_BUSINESS_PHONE = "56984533883";

function createSupabaseMock({ carts = [], errors = {}, tables = {} } = {}) {
  class QueryMock {
    constructor(tableName) {
      this.tableName = tableName;
      this.filters = [];
      this.limitCount = null;
      this.orderField = null;
      this.orderAscending = true;
    }

    select() {
      return this;
    }

    eq(field, value) {
      this.filters.push({ field, value });
      return this;
    }

    order(field, options = {}) {
      this.orderField = field;
      this.orderAscending = options.ascending !== false;
      return this;
    }

    limit(value) {
      this.limitCount = value;
      return this;
    }

    maybeSingle() {
      const rows = this.applyFilters();
      return Promise.resolve({ data: rows[0] ?? null, error: errors[this.tableName] ?? null });
    }

    then(resolve, reject) {
      return Promise.resolve({ data: this.applyFilters(), error: errors[this.tableName] ?? null }).then(resolve, reject);
    }

    applyFilters() {
      const sourceRows = this.tableName === "recovery_incomplete_bookings_import"
        ? carts
        : tables[this.tableName] ?? [];
      let rows = [...sourceRows];

      for (const filter of this.filters) {
        rows = rows.filter((row) => row[filter.field] === filter.value);
      }

      if (this.orderField) {
        rows.sort((left, right) => {
          const leftValue = left[this.orderField] ?? "";
          const rightValue = right[this.orderField] ?? "";
          const comparison = String(leftValue).localeCompare(String(rightValue));

          return this.orderAscending ? comparison : -comparison;
        });
      }

      return this.limitCount === null ? rows : rows.slice(0, this.limitCount);
    }
  }

  return {
    from(tableName) {
      return new QueryMock(tableName);
    },
  };
}

test("classifies the WhatsApp freeform window states", () => {
  const now = Date.parse("2026-07-31T12:00:00.000Z");

  assert.equal(classifyWhatsappFreeformWindow("2026-07-31T06:00:00.000Z", now).status, "open");
  assert.equal(classifyWhatsappFreeformWindow("2026-07-30T13:00:00.000Z", now).status, "closing_soon");
  assert.equal(classifyWhatsappFreeformWindow("2026-07-30T11:59:59.000Z", now).status, "closed");
  assert.equal(classifyWhatsappFreeformWindow(null, now).status, "missing");
  assert.equal(classifyWhatsappFreeformWindow("not-a-date", now).status, "missing");
});

test("closes at the exact 24-hour boundary", () => {
  const now = Date.parse("2026-07-31T12:00:00.000Z");
  const state = classifyWhatsappFreeformWindow("2026-07-30T12:00:00.000Z", now);

  assert.equal(state.status, "closed");
  assert.equal(state.canSendFreeform, false);
  assert.equal(state.remainingSeconds, 0);
});

test("parking code and business phone map to expected WhatsApp business keys", () => {
  assert.equal(businessKeyForParking("MPV"), "MPV");
  assert.equal(businessKeyForParking("mpv"), "MPV");
  assert.equal(businessKeyForParking("EAP"), "EAP");
  assert.equal(businessKeyForParking("otro"), null);
  assert.equal(businessKeyForParking(null), null);
  assert.equal(businessKeyForBusinessPhone(MPV_BUSINESS_PHONE), "MPV");
  assert.equal(businessKeyForBusinessPhone(EAP_BUSINESS_PHONE), "EAP");
  assert.equal(businessKeyForBusinessPhone("+56 9 2681 7602"), "MPV");
  assert.equal(businessKeyForBusinessPhone(null), null);
});

test("helper selects the most recent valid inbound across sources for the same business number", async () => {
  const now = Date.parse("2026-07-31T12:00:00.000Z");
  const supabase = createSupabaseMock({
    carts: [{ id: "cart-1", parking_code: "MPV", phone_normalized: "56900000000" }],
    tables: {
      recovery_whatsapp_live_messages: [
        { cart_id: "cart-1", direction: "inbound", message_at: "2026-07-31T07:00:00.000Z", phone_normalized: "56900000000" },
        { cart_id: "other-cart", direction: "inbound", message_at: "2026-07-31T11:30:00.000Z", phone_normalized: "56999999999" },
      ],
      recovery_whatsapp_message_memory_raw_import: [
        { message_at: "2026-07-31T08:00:00.000Z", message_bound_type: "inbound", wa_id_normalized: "56900000000", api_phone_normalized: MPV_BUSINESS_PHONE },
      ],
      recovery_whatsapp_message_memory_import: [
        { message_at: "2026-07-31T10:00:00.000Z", message_bound_type: "inbound", wa_id_normalized: "56900000000", api_phone_normalized: MPV_BUSINESS_PHONE },
      ],
    },
  });

  const state = await getWhatsappFreeformWindowForCart(supabase, "cart-1", now);

  assert.equal(state.status, "open");
  assert.equal(state.canSendFreeform, true);
  assert.equal(state.lastInboundAt, "2026-07-31T10:00:00.000Z");
});

test("inbound from another business number does not open the MPV freeform window", async () => {
  const now = Date.parse("2026-08-03T14:39:30.000Z");
  const supabase = createSupabaseMock({
    carts: [{ id: "cart-mpv", parking_code: "MPV", phone_normalized: "56900000000" }],
    tables: {
      recovery_whatsapp_live_messages: [],
      recovery_whatsapp_message_memory_raw_import: [
        {
          api_phone_normalized: EAP_BUSINESS_PHONE,
          message_at: "2026-08-03T02:27:41.000Z",
          message_bound_type: "inbound",
          wa_id_normalized: "56900000000",
        },
      ],
      recovery_whatsapp_message_memory_import: [
        {
          api_phone_normalized: EAP_BUSINESS_PHONE,
          message_at: "2026-08-03T02:27:41.000Z",
          message_bound_type: "inbound",
          wa_id_normalized: "56900000000",
        },
      ],
    },
  });

  const state = await getWhatsappFreeformWindowForCart(supabase, "cart-mpv", now);

  assert.equal(state.businessKey, "MPV");
  assert.equal(state.status, "missing");
  assert.equal(state.canSendFreeform, false);
  assert.equal(state.lastInboundAt, null);
});

test("real Meta 131047 scenario is blocked before n8n when only the other business has inbound", async () => {
  const now = Date.parse("2026-08-03T14:39:30.000Z");
  const supabase = createSupabaseMock({
    carts: [{ id: "cart-131047", parking_code: "MPV", phone_normalized: "56900000000" }],
    tables: {
      recovery_whatsapp_live_messages: [],
      recovery_whatsapp_message_memory_raw_import: [
        {
          api_phone_normalized: EAP_BUSINESS_PHONE,
          message_at: "2026-08-03T02:27:41.000Z",
          message_bound_type: "inbound",
          wa_id_normalized: "56900000000",
        },
      ],
      recovery_whatsapp_message_memory_import: [],
    },
  });

  const state = await getWhatsappFreeformWindowForCart(supabase, "cart-131047", now);

  assert.equal(state.status, "missing");
  assert.equal(state.canSendFreeform, false);
  assert.equal(sendRoute.indexOf("getWhatsappFreeformWindowForCart(admin.supabase, cart.id)") < sendRoute.indexOf("callN8nWebhook({ cart, messageText, operatorEmail, sentAt })"), true);
  assert.match(sendRoute, /whatsapp_window_missing/);
});


test("EAP cart uses the explicit outbound business number before accepting the inbound", async () => {
  const now = Date.parse("2026-08-04T12:15:00.000Z");
  const supabase = createSupabaseMock({
    carts: [{ id: "cart-eap", parking_code: "EAP", phone_normalized: "56900000000" }],
    tables: {
      recovery_whatsapp_live_messages: [],
      recovery_whatsapp_message_memory_raw_import: [
        {
          api_phone_normalized: MPV_BUSINESS_PHONE,
          message_at: "2026-08-04T11:30:14.000Z",
          message_bound_type: "outbound",
          wa_id_normalized: "56900000000",
        },
        {
          api_phone_normalized: MPV_BUSINESS_PHONE,
          message_at: "2026-08-04T11:50:44.000Z",
          message_bound_type: "inbound",
          wa_id_normalized: "56900000000",
        },
        {
          api_phone_normalized: MPV_BUSINESS_PHONE,
          message_at: "2026-08-04T11:50:44.000Z",
          message_bound_type: "outbound",
          wa_id_normalized: "56900000000",
        },
      ],
      recovery_whatsapp_message_memory_import: [],
    },
  });

  const state = await getWhatsappFreeformWindowForCart(supabase, "cart-eap", now);

  assert.equal(state.businessKey, "MPV");
  assert.equal(state.status, "open");
  assert.equal(state.canSendFreeform, true);
  assert.equal(state.lastInboundAt, "2026-08-04T11:50:44.000Z");
  assert.equal(state.closesAt, "2026-08-05T11:50:44.000Z");
});

test("null or unknown direction does not count as inbound", async () => {
  const supabase = createSupabaseMock({
    carts: [{ id: "cart-1", parking_code: "MPV", phone_normalized: "56900000000" }],
    tables: {
      recovery_whatsapp_live_messages: [
        { cart_id: "cart-1", direction: null, message_at: "2026-07-31T10:00:00.000Z", phone_normalized: "56900000000" },
        { cart_id: "cart-1", direction: "unknown", message_at: "2026-07-31T11:00:00.000Z", phone_normalized: "56900000000" },
      ],
      recovery_whatsapp_message_memory_raw_import: [
        { message_at: "2026-07-31T10:00:00.000Z", message_bound_type: null, wa_id_normalized: "56900000000", api_phone_normalized: MPV_BUSINESS_PHONE },
      ],
      recovery_whatsapp_message_memory_import: [
        { message_at: "2026-07-31T11:00:00.000Z", message_bound_type: "unknown", wa_id_normalized: "56900000000", api_phone_normalized: MPV_BUSINESS_PHONE },
      ],
    },
  });

  const state = await getWhatsappFreeformWindowForCart(supabase, "cart-1", Date.parse("2026-07-31T12:00:00.000Z"));

  assert.equal(state.status, "missing");
  assert.equal(state.canSendFreeform, false);
});

test("partial source error is fail-closed even when another source has inbound", async () => {
  const supabase = createSupabaseMock({
    carts: [{ id: "cart-1", parking_code: "MPV", phone_normalized: "56900000000" }],
    errors: {
      recovery_whatsapp_message_memory_raw_import: { message: "simulated source error" },
    },
    tables: {
      recovery_whatsapp_live_messages: [
        { cart_id: "cart-1", direction: "inbound", message_at: "2026-07-31T10:00:00.000Z", phone_normalized: "56900000000" },
      ],
      recovery_whatsapp_message_memory_import: [],
    },
  });

  const state = await getWhatsappFreeformWindowForCart(supabase, "cart-1", Date.parse("2026-07-31T12:00:00.000Z"));

  assert.equal(state.status, "unverifiable");
  assert.equal(state.canSendFreeform, false);
});

test("empty source tables return missing with null metadata", async () => {
  const supabase = createSupabaseMock({
    carts: [{ id: "cart-1", parking_code: "MPV", phone_normalized: "56900000000" }],
    tables: {
      recovery_whatsapp_live_messages: [],
      recovery_whatsapp_message_memory_raw_import: [],
      recovery_whatsapp_message_memory_import: [],
    },
  });

  const state = await getWhatsappFreeformWindowForCart(supabase, "cart-1", Date.parse("2026-07-31T12:00:00.000Z"));

  assert.equal(state.status, "missing");
  assert.equal(state.canSendFreeform, false);
  assert.equal(state.lastInboundAt, null);
  assert.equal(state.expiresAt, null);
  assert.equal(state.remainingSeconds, null);
});

test("invalid timestamps are ignored", async () => {
  const supabase = createSupabaseMock({
    carts: [{ id: "cart-1", parking_code: "MPV", phone_normalized: "56900000000" }],
    tables: {
      recovery_whatsapp_live_messages: [
        { cart_id: "cart-1", direction: "inbound", message_at: "not-a-date", phone_normalized: "56900000000" },
      ],
      recovery_whatsapp_message_memory_raw_import: [],
      recovery_whatsapp_message_memory_import: [],
    },
  });

  const state = await getWhatsappFreeformWindowForCart(supabase, "cart-1", Date.parse("2026-07-31T12:00:00.000Z"));

  assert.equal(state.status, "missing");
  assert.equal(state.canSendFreeform, false);
});

test("helper is server-only and reads only explicit inbound sources", () => {
  assert.match(helper, /import\s+"server-only"/);
  assert.match(helper, /recovery_whatsapp_live_messages/);
  assert.match(helper, /recovery_whatsapp_message_memory_raw_import/);
  assert.match(helper, /recovery_whatsapp_message_memory_import/);
  assert.match(helper, /\.eq\("direction",\s*"inbound"\)/);
  assert.match(helper, /message_bound_type === "inbound"/);
  assert.doesNotMatch(helper, /message_bound_type\s*!==\s*"outbound"/);
  assert.doesNotMatch(helper, /direction\s*!==\s*"outbound"/);
});

test("GET chat route returns server-calculated whatsappWindow without replacing chat range", () => {
  assert.match(getRoute, /getWhatsappFreeformWindowForCart\(admin\.supabase,\s*cartId\)/);
  assert.match(getRoute, /whatsappWindow/);
  assert.match(getRoute, /windowStart/);
  assert.match(getRoute, /windowEnd/);
});

test("POST send route recalculates the window before local insert, updates, or n8n call", () => {
  const checkIndex = sendRoute.indexOf("getWhatsappFreeformWindowForCart(admin.supabase, cart.id)");
  const rejectIndex = sendRoute.indexOf("return whatsappWindowError(whatsappWindow)");
  const insertIndex = sendRoute.indexOf(".insert(");
  const n8nIndex = sendRoute.indexOf("callN8nWebhook({ cart, messageText, operatorEmail, sentAt })");
  const updateIndex = sendRoute.indexOf(".update(");

  assert.ok(checkIndex > 0, "window check exists");
  assert.ok(rejectIndex > checkIndex, "window rejection follows check");
  assert.ok(insertIndex > checkIndex, "insert happens after window check");
  assert.ok(n8nIndex > checkIndex, "n8n call happens after window check");
  assert.ok(updateIndex > checkIndex, "updates happen after window check");
  assert.match(sendRoute, /whatsapp_window_closed/);
  assert.match(sendRoute, /whatsapp_window_missing/);
  assert.match(sendRoute, /whatsapp_window_unverifiable/);
  assert.match(sendRoute, /windowState\.status === "unverifiable"/);
  assert.match(sendRoute, /stage:\s*"whatsapp_window"/);
  assert.match(sendRoute, /status:\s*409/);
});

test("drawer relies on server window state and preserves the draft on server rejection", () => {
  assert.match(drawer, /whatsappWindow\?: WhatsappFreeformWindowPayload/);
  assert.match(drawer, /serverWhatsappWindow = whatsappWindowOverride \?\? \(isDataForCurrentCart \? data\?\.whatsappWindow : null\)/);
  assert.match(drawer, /getWhatsappFreeformWindowView\(serverWhatsappWindow/);
  assert.doesNotMatch(drawer, /messages\.reduce<number \| null>/);
  assert.match(drawer, /setWhatsappWindowOverride\(payload\.whatsappWindow\)/);

  const rejectionIndex = drawer.indexOf("if (!response.ok || !payload.ok)");
  const clearDraftIndex = drawer.indexOf('setMessageDraft("")', rejectionIndex);
  const successStatusIndex = drawer.indexOf("setSendStatus(\"Mensaje enviado\")", rejectionIndex);
  const rejectionBranch = drawer.slice(rejectionIndex, clearDraftIndex);

  assert.ok(rejectionIndex > 0, "rejection branch exists");
  assert.ok(clearDraftIndex > rejectionIndex, "draft clear follows rejection branch");
  assert.ok(successStatusIndex > clearDraftIndex, "success status follows draft clear");
  assert.doesNotMatch(rejectionBranch, /setMessageDraft/, "rejection branch does not clear draft");
});

test("visible drawer copy exposes every safe window status", () => {
  assert.match(drawer, /Verificando ventana/);
  assert.match(drawer, /Ventana abierta/);
  assert.match(drawer, /Historial mostrado/);
  assert.match(drawer, /Cierre WhatsApp/);
  assert.match(drawer, /Cierra pronto/);
  assert.match(drawer, /Ventana cerrada/);
  assert.match(drawer, /Sin respuesta del cliente/);
  assert.match(drawer, /No se pudo verificar ventana/);
});

test("no unrelated modules are part of this task diff", () => {
  const changedFiles = execFileSync("git", ["status", "--short", "--untracked-files=all"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"));

  const allowedRecoveryChatFiles = new Set([
    "scripts/recovery-chat-extended-window.test.mjs",
    "scripts/recovery-snapshot-comparison-api.test.mjs",
    "scripts/recovery-attribution-canonical.test.mjs",
    "scripts/recovery-weekly-snapshots.test.mjs",
    "scripts/recovery-import-row-changes.test.mjs",
    "docs/recovery_import_row_changes.md",
    "docs/recovery_weekly_snapshots.md",
    "src/lib/recuperacion/recovery-snapshots.ts",
    "supabase/migrations/20260803110000_create_recovery_import_row_changes.sql",
    "supabase/migrations/20260802120000_create_recovery_weekly_snapshots.sql",
    "src/lib/dashboard/data.ts",
    "src/lib/recuperacion/recovery-attribution.ts",
    "scripts/recovery-whatsapp-freeform-window.test.mjs",
    "src/app/api/recuperacion/carritos/[id]/chat/route.ts",
    "src/app/api/recuperacion/carritos/[id]/chat/send/route.ts",
    "src/app/api/recuperacion/snapshots/compare/route.ts",
    "src/app/orquestador/page.tsx",
    "src/app/recuperacion/recovery-cart-chat-drawer.tsx",
    "src/lib/recuperacion/recovery-chat-read-range.ts",
    "src/lib/recuperacion/recovery-snapshot-comparison.ts",
    "scripts/recovery-snapshot-comparison-ui.test.mjs",
    "src/app/recuperacion/recovery-cart-audit-table.tsx",
    "src/app/recuperacion/recovery-snapshot-comparison-drawer.tsx",
    "src/lib/recuperacion/whatsapp-freeform-window.ts",
    "scripts/recovery-meta-whatsapp-templates.test.mjs",
    "scripts/recovery-whatsapp-template-catalog.test.mjs",
    "scripts/recovery-whatsapp-template-endpoint.test.mjs",
    "scripts/recovery-whatsapp-template-library-ui.test.mjs",
    "scripts/recovery-whatsapp-template-preparation-ui.test.mjs",
    "src/app/api/recuperacion/carritos/[id]/chat/templates/route.ts",
    "src/app/recuperacion/recovery-whatsapp-template-library-modal.tsx",
    "src/lib/recuperacion/meta-whatsapp-templates.ts",
    "src/lib/recuperacion/whatsapp-recovery-template-catalog.ts",
    "scripts/recovery-whatsapp-business-window.test.mjs",
    "scripts/recovery-whatsapp-window-indicator.test.mjs",
    "src/app/api/recuperacion/carritos/chat-indicators/route.ts",
  ]);

  assert.equal(
    changedFiles.every((file) => allowedRecoveryChatFiles.has(file)),
    true,
    `Unexpected changed files: ${changedFiles.filter((file) => !allowedRecoveryChatFiles.has(file)).join(", ")}`,
  );
});

test("changed sources do not contain common mojibake markers", () => {
  for (const [path, source] of [
    [helperPath, helper],
    [getRoutePath, getRoute],
    [sendRoutePath, sendRoute],
    [drawerPath, drawer],
  ]) {
    assert.doesNotMatch(source, /\u00C3|\u00C2|\u00E2|\u00EF\u00BF\u00BD/, `${path} contains mojibake markers`);
  }
});
