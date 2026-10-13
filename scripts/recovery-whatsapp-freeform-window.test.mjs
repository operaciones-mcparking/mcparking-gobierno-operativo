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
const migrationPath = "supabase/migrations/20261008120000_add_recovery_whatsapp_freeform_window_v2.sql";

const helper = readFileSync(helperPath, "utf8");
const getRoute = readFileSync(getRoutePath, "utf8");
const sendRoute = readFileSync(sendRoutePath, "utf8");
const drawer = readFileSync(drawerPath, "utf8");
const migration = readFileSync(migrationPath, "utf8");

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
  function normalizeBusinessKey(value) {
    const normalized = String(value ?? "").trim().toUpperCase();

    return normalized === "MPV" || normalized === "EAP" ? normalized : null;
  }

  function businessPhoneForKey(key) {
    return key === "MPV" ? MPV_BUSINESS_PHONE : EAP_BUSINESS_PHONE;
  }

  function latestTimestamp(rows) {
    return rows
      .map((row) => row.message_at)
      .filter(Boolean)
      .filter((value) => !Number.isNaN(new Date(value).getTime()))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
  }

  class QueryMock {
    constructor(tableName) {
      this.tableName = tableName;
      this.filters = [];
      this.limitCount = null;
      this.orderField = null;
      this.orderAscending = true;
      this.notNullFields = [];
    }

    select() {
      return this;
    }

    eq(field, value) {
      this.filters.push({ field, value });
      return this;
    }

    not(field, operator, value) {
      if (operator === "is" && value === null) {
        this.notNullFields.push(field);
      }

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
      const sourceRows = this.tableName === "v_recovery_incomplete_bookings_current_compat"
        ? carts
        : tables[this.tableName] ?? [];
      let rows = [...sourceRows];

      for (const filter of this.filters) {
        rows = rows.filter((row) => row[filter.field] === filter.value);
      }

      for (const field of this.notNullFields) {
        rows = rows.filter((row) => row[field] !== null && row[field] !== undefined);
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

    rpc(name, params) {
      if (name !== "recovery_whatsapp_freeform_window_v2") {
        return Promise.resolve({ data: null, error: { message: `Unexpected RPC: ${name}` } });
      }

      if (errors[name]) {
        return Promise.resolve({ data: null, error: errors[name] });
      }

      const cart = carts.find((row) => row.id === params.p_cart_id) ?? null;

      if (!cart) {
        return Promise.resolve({ data: [], error: null });
      }

      const businessKey = normalizeBusinessKey(cart.parking_code);

      if (!businessKey) {
        return Promise.resolve({
          data: [{ business_key: null, error_code: "business_key_unresolved", last_inbound_at: null, source: null }],
          error: null,
        });
      }

      if (!cart.phone_normalized) {
        return Promise.resolve({
          data: [{ business_key: businessKey, error_code: null, last_inbound_at: null, source: null }],
          error: null,
        });
      }

      if (errors.recovery_whatsapp_messages_v2) {
        return Promise.resolve({ data: null, error: errors.recovery_whatsapp_messages_v2 });
      }

      const businessPhone = businessPhoneForKey(businessKey);
      const v2Rows = (tables.recovery_whatsapp_messages_v2 ?? []).filter((row) => (
        row.wa_id === cart.phone_normalized
        && row.api_phone === businessPhone
        && row.message_bound_type === "inbound"
      ));
      const liveRows = (tables.recovery_whatsapp_live_messages ?? []).filter((row) => (
        (row.cart_v2_id === cart.id || row.cart_id === cart.id)
        && row.direction === "inbound"
      ));
      const v2Latest = latestTimestamp(v2Rows);
      const liveLatest = latestTimestamp(liveRows);
      const latest = latestTimestamp([...v2Rows, ...liveRows]);
      const source = latest && v2Latest === latest && liveLatest === latest
        ? "combined"
        : latest && liveLatest === latest
          ? "live"
          : latest && v2Latest === latest
            ? "message_memory"
            : null;

      return Promise.resolve({
        data: [{
          business_key: businessKey,
          error_code: null,
          last_inbound_at: latest,
          source,
        }],
        error: null,
      });
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
      recovery_whatsapp_messages_v2: [
        { api_phone: MPV_BUSINESS_PHONE, message_at: "2026-07-31T08:00:00.000Z", message_bound_type: "inbound", source_id: 10, wa_id: "56900000000" },
        { api_phone: MPV_BUSINESS_PHONE, message_at: "2026-07-31T10:00:00.000Z", message_bound_type: "inbound", source_id: 11, wa_id: "56900000000" },
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
      recovery_whatsapp_messages_v2: [
        {
          api_phone: EAP_BUSINESS_PHONE,
          message_at: "2026-08-03T02:27:41.000Z",
          message_bound_type: "inbound",
          source_id: 20,
          wa_id: "56900000000",
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
      recovery_whatsapp_messages_v2: [
        {
          api_phone: EAP_BUSINESS_PHONE,
          message_at: "2026-08-03T02:27:41.000Z",
          message_bound_type: "inbound",
          source_id: 30,
          wa_id: "56900000000",
        },
      ],
    },
  });

  const state = await getWhatsappFreeformWindowForCart(supabase, "cart-131047", now);

  assert.equal(state.status, "missing");
  assert.equal(state.canSendFreeform, false);
  assert.equal(sendRoute.indexOf("getWhatsappFreeformWindowForCart(admin.supabase, cart.id)") < sendRoute.indexOf("callN8nWebhook({ cart, messageText, operatorEmail, sentAt })"), true);
  assert.match(sendRoute, /whatsapp_window_missing/);
});


test("EAP cart uses parking business before accepting the inbound", async () => {
  const now = Date.parse("2026-08-04T12:15:00.000Z");
  const supabase = createSupabaseMock({
    carts: [{ id: "cart-eap", parking_code: "EAP", phone_normalized: "56900000000" }],
    tables: {
      recovery_whatsapp_live_messages: [],
      recovery_whatsapp_messages_v2: [
        {
          api_phone: EAP_BUSINESS_PHONE,
          message_at: "2026-08-04T11:50:44.000Z",
          message_bound_type: "inbound",
          source_id: 40,
          wa_id: "56900000000",
        },
      ],
    },
  });

  const state = await getWhatsappFreeformWindowForCart(supabase, "cart-eap", now);

  assert.equal(state.businessKey, "EAP");
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
      recovery_whatsapp_messages_v2: [
        { api_phone: MPV_BUSINESS_PHONE, message_at: "2026-07-31T10:00:00.000Z", message_bound_type: null, source_id: 50, wa_id: "56900000000" },
        { api_phone: MPV_BUSINESS_PHONE, message_at: "2026-07-31T11:00:00.000Z", message_bound_type: "unknown", source_id: 51, wa_id: "56900000000" },
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
      recovery_whatsapp_messages_v2: { message: "simulated source error" },
    },
    tables: {
      recovery_whatsapp_live_messages: [
        { cart_id: "cart-1", direction: "inbound", message_at: "2026-07-31T10:00:00.000Z", phone_normalized: "56900000000" },
      ],
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
      recovery_whatsapp_messages_v2: [],
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
      recovery_whatsapp_messages_v2: [],
    },
  });

  const state = await getWhatsappFreeformWindowForCart(supabase, "cart-1", Date.parse("2026-07-31T12:00:00.000Z"));

  assert.equal(state.status, "missing");
  assert.equal(state.canSendFreeform, false);
});

test("helper is server-only and reads only explicit inbound sources", () => {
  assert.match(helper, /import\s+"server-only"/);
  const getWindowBlock = helper.slice(helper.indexOf("export async function getWhatsappFreeformWindowForCart"));

  assert.match(getWindowBlock, /\.rpc\("recovery_whatsapp_freeform_window_v2"/);
  assert.doesNotMatch(getWindowBlock, /v_recovery_whatsapp_message_memory_raw_current_compat/);
  assert.doesNotMatch(getWindowBlock, /v_recovery_whatsapp_message_memory_current_compat/);
  assert.doesNotMatch(getWindowBlock, /recovery_whatsapp_messages_v2/);
  assert.doesNotMatch(getWindowBlock, /recovery_whatsapp_live_messages/);
  assert.match(helper, /message_bound_type === "inbound"/);
  assert.doesNotMatch(helper, /message_bound_type\s*!==\s*"outbound"/);
  assert.doesNotMatch(helper, /direction\s*!==\s*"outbound"/);
});

test("fast resolver RPC is security-definer and avoids compat view scans", () => {
  assert.match(migration, /create or replace function public\.recovery_whatsapp_freeform_window_v2\(p_cart_id uuid\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /recovery_whatsapp_messages_v2_window_lookup_idx/i);
  assert.match(migration, /recovery_whatsapp_live_messages_cart_v2_inbound_message_at_idx/i);
  assert.match(migration, /recovery_whatsapp_live_messages_legacy_inbound_message_at_idx/i);
  assert.match(migration, /public\.recovery_whatsapp_messages_v2/i);
  assert.match(migration, /public\.recovery_whatsapp_live_messages/i);
  assert.doesNotMatch(migration, /v_recovery_whatsapp_message_memory_raw_current_compat|v_recovery_whatsapp_message_memory_current_compat/i);
  assert.match(migration, /grant execute on function public\.recovery_whatsapp_freeform_window_v2\(uuid\) to authenticated, service_role/i);
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

test("freeform n8n contract is ready for the unified workflow", () => {
  const payloadStart = sendRoute.indexOf("body: JSON.stringify({");
  const payloadEnd = sendRoute.indexOf("}),", payloadStart);
  const payloadBlock = sendRoute.slice(payloadStart, payloadEnd);

  assert.ok(payloadStart > 0, "n8n payload exists");
  assert.match(payloadBlock, /mode:\s*"freeform"/);
  assert.match(payloadBlock, /cartId:\s*payload\.cart\.id/);
  assert.match(payloadBlock, /cartType:\s*payload\.cart\.type/);
  assert.match(payloadBlock, /email:\s*payload\.cart\.email_normalized/);
  assert.match(payloadBlock, /messageText:\s*payload\.messageText/);
  assert.match(payloadBlock, /operatorEmail:\s*payload\.operatorEmail/);
  assert.match(payloadBlock, /parking:\s*payload\.cart\.parking_code/);
  assert.match(payloadBlock, /phone:\s*payload\.cart\.phone_normalized/);
  assert.match(payloadBlock, /sentAt:\s*payload\.sentAt/);
  assert.match(payloadBlock, /source:\s*"recovery_web"/);

  assert.match(sendRoute, /process\.env\.N8N_RECOVERY_WHATSAPP_WEBHOOK_URL/);
  assert.match(sendRoute, /process\.env\.N8N_RECOVERY_WEBHOOK_SECRET/);
  assert.match(sendRoute, /"x-mcparking-recovery-secret":\s*webhookSecret/);
  assert.match(sendRoute, /fetch\(webhookUrl/);
  assert.doesNotMatch(sendRoute, /N8N_RECOVERY_WHATSAPP_TEMPLATE_WEBHOOK_URL/);
  assert.doesNotMatch(sendRoute, /sendRecoveryWhatsappTemplateViaN8n/);
});

test("freeform accepts legacy and unified n8n message identifiers", () => {
  assert.match(sendRoute, /whatsappMessageId:\s*safeString\(typedPayload\?\.whatsappMessageId\) \|\| safeString\(typedPayload\?\.messageId\) \|\| null/);
  assert.match(sendRoute, /whatsappStatus:\s*safeString\(typedPayload\?\.whatsappStatus\) \|\| safeString\(typedPayload\?\.messageStatus\) \|\| "sent"/);
  assert.match(sendRoute, /n8nExecutionId:\s*safeString\(typedPayload\?\.n8nExecutionId\) \|\| safeString\(typedPayload\?\.executionId\) \|\| null/);
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
  const changedFiles = execFileSync("git", ["status", "--short", "--untracked-files=no"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"));

  const allowedRecoveryChatFiles = new Set([
    "scripts/recovery-chart-presentation.test.mjs",
    "scripts/recovery/incomplete-bookings-csv-validator.js",
    "src/app/api/recuperacion/carritos/importar/route.ts",
    "src/lib/dashboard/data.ts",
    "scripts/recovery-quoted-amount.test.mjs",
    "scripts/recovery/backfill-incomplete-booking-quoted-amount.js",
    "supabase/migrations/20260819120000_add_recovery_cart_quoted_amount.sql",
    "scripts/recovery-chat-extended-window.test.mjs",
    "scripts/recovery-snapshot-comparison-api.test.mjs",
    "scripts/recovery-attribution-canonical.test.mjs",
    "scripts/recovery-v2-recuperacion-compat.test.mjs",
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
    "scripts/recovery-whatsapp-template-favorites.test.mjs",
    "src/app/api/recuperacion/carritos/[id]/chat/templates/favorites/route.ts",
    "supabase/migrations/20260824130000_add_recovery_whatsapp_template_favorites.sql",
    "scripts/recovery-whatsapp-template-preparation-ui.test.mjs",
    "scripts/recovery-whatsapp-template-send-dry-run.test.mjs",
    "scripts/recovery-whatsapp-template-meta-payload.test.mjs",
    "scripts/recovery-whatsapp-template-n8n-payload.test.mjs",
    "scripts/recovery-whatsapp-template-send-real.test.mjs",
    "scripts/recovery-whatsapp-template-send-confirmation-ui.test.mjs",
    "src/app/api/recuperacion/carritos/[id]/chat/templates/route.ts",
    "src/app/api/recuperacion/carritos/[id]/chat/send-template/route.ts",
    "src/app/recuperacion/recovery-whatsapp-template-library-modal.tsx",
    "src/lib/recuperacion/meta-whatsapp-templates.ts",
    "src/lib/recuperacion/whatsapp-recovery-template-catalog.ts",
    "src/lib/recuperacion/whatsapp-template-send-payload.ts",
    "src/lib/recuperacion/whatsapp-template-n8n-payload.ts",
    "src/lib/recuperacion/whatsapp-template-n8n-transport.ts",
    "scripts/recovery-whatsapp-business-window.test.mjs",
    "scripts/recovery-whatsapp-window-indicator.test.mjs",
    "scripts/recovery-live-message-dual-identity.test.mjs",
    "src/app/api/recuperacion/carritos/chat-indicators/route.ts",
    "src/app/api/recuperacion/whatsapp/live-message/route.ts",
    "scripts/recovery-conversation-sessions.test.mjs",
    "src/app/api/recuperacion/conversaciones/sesiones/route.ts",
    "src/lib/recuperacion/recovery-conversation-sessions.ts",
    "supabase/migrations/20260819130000_add_recovery_conversation_sessions_read_contract.sql",
    "supabase/migrations/20261007190000_fix_recovery_v2_attribution_invalid_arrival_window.sql",
    "scripts/recovery-conversation-sessions-ui.test.mjs",
    "src/app/recuperacion/page.tsx",
    "src/app/recuperacion/recovery-conversation-sessions.tsx",
    "src/app/recuperacion/recovery-view-tabs.tsx",
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
