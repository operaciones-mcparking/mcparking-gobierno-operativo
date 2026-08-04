import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const helperPath = "src/lib/recuperacion/whatsapp-freeform-window.ts";
const indicatorRoutePath = "src/app/api/recuperacion/carritos/chat-indicators/route.ts";
const tablePath = "src/app/recuperacion/recovery-cart-audit-table.tsx";
const orquestadorPathPattern = /src\/app\/orquestador/;

const helper = readFileSync(helperPath, "utf8");
const indicatorRoute = readFileSync(indicatorRoutePath, "utf8");
const table = readFileSync(tablePath, "utf8");

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
  classifyWhatsappFreeformWindow,
  publicWhatsappFreeformWindow,
  resolveWhatsappFreeformWindowFromLoadedSources,
} = loadHelperExports();

const MPV_BUSINESS_PHONE = "56926817602";
const EAP_BUSINESS_PHONE = "56984533883";
const NOW = Date.parse("2026-08-04T12:00:00.000Z");

function resolveWindow({ liveCandidates = [], memoryRows = [], parkingBusinessKey = "MPV", nowMs = NOW } = {}) {
  return resolveWhatsappFreeformWindowFromLoadedSources({
    liveCandidates,
    memoryRows,
    nowMs,
    parkingBusinessKey,
  });
}

test("endpoint batch returns whatsappWindow in the safe DTO", () => {
  assert.match(indicatorRoute, /whatsappWindow:\s*ChatIndicatorWhatsappWindow/);
  assert.match(indicatorRoute, /status:\s*WhatsappFreeformWindowStatus/);
  assert.match(indicatorRoute, /closesAt:\s*string \| null/);
  assert.match(indicatorRoute, /remainingSeconds:\s*number \| null/);
  assert.match(indicatorRoute, /publicWhatsappFreeformWindow/);
});

test("endpoint is GET-only for chat indicators", () => {
  assert.match(indicatorRoute, /export async function GET\(request: NextRequest\)/);
  assert.doesNotMatch(indicatorRoute, /export async function POST/);
});

test("endpoint does not write or call RPCs", () => {
  assert.doesNotMatch(indicatorRoute, /\.insert\(/);
  assert.doesNotMatch(indicatorRoute, /\.update\(/);
  assert.doesNotMatch(indicatorRoute, /\.delete\(/);
  assert.doesNotMatch(indicatorRoute, /\.upsert\(/);
  assert.doesNotMatch(indicatorRoute, /\.rpc\(/);
});

test("endpoint uses batch processing without the individual loader", () => {
  assert.match(indicatorRoute, /normalizeIdsFromSearchParams/);
  assert.match(indicatorRoute, /\.in\("id", ids\)/);
  assert.match(indicatorRoute, /\.in\("wa_id_normalized", phones\)/);
  assert.match(indicatorRoute, /\.in\("cart_id", cartIds\)/);
  assert.doesNotMatch(indicatorRoute, /getWhatsappFreeformWindowForCart/);
});

test("endpoint paginates sources with range and page size 1000", () => {
  assert.match(indicatorRoute, /const PAGE_SIZE = 1000/);
  assert.match(indicatorRoute, /fetchRowsInPages/);
  assert.match(indicatorRoute, /\.range\(from, from \+ PAGE_SIZE - 1\)/);
});

test("helper deduplicates candidates across sources", () => {
  assert.match(helper, /function dedupeCandidates/);
  assert.match(helper, /wamid:/);
  assert.match(helper, /fallback:/);
  const state = resolveWindow({
    memoryRows: [
      { api_phone_normalized: MPV_BUSINESS_PHONE, message_at: "2026-08-04T10:00:00.000Z", message_bound_type: "inbound" },
      { api_phone_normalized: MPV_BUSINESS_PHONE, message_at: "2026-08-04T10:00:00.000Z", message_bound_type: "inbound" },
    ],
  });
  assert.equal(state.status, "open");
  assert.equal(state.lastInboundAt, "2026-08-04T10:00:00.000Z");
});

test("open window status is preserved", () => {
  assert.equal(classifyWhatsappFreeformWindow("2026-08-04T09:00:00.000Z", NOW).status, "open");
});

test("closing_soon window status is preserved", () => {
  assert.equal(classifyWhatsappFreeformWindow("2026-08-03T13:00:00.000Z", NOW).status, "closing_soon");
});

test("closed window status is preserved", () => {
  assert.equal(classifyWhatsappFreeformWindow("2026-08-03T11:59:59.000Z", NOW).status, "closed");
});

test("missing window status is preserved", () => {
  assert.equal(classifyWhatsappFreeformWindow(null, NOW).status, "missing");
});

test("unverifiable status is returned for ambiguous conversation", () => {
  const state = resolveWindow({
    memoryRows: [
      { api_phone_normalized: MPV_BUSINESS_PHONE, message_at: "2026-08-04T10:00:00.000Z", message_bound_type: "outbound" },
      { api_phone_normalized: EAP_BUSINESS_PHONE, message_at: "2026-08-04T10:05:00.000Z", message_bound_type: "outbound" },
    ],
    parkingBusinessKey: null,
  });
  assert.equal(state.status, "unverifiable");
  assert.equal(state.canSendFreeform, false);
});

test("exactly 24 hours is closed", () => {
  const state = classifyWhatsappFreeformWindow("2026-08-03T12:00:00.000Z", NOW);
  assert.equal(state.status, "closed");
  assert.equal(state.remainingSeconds, 0);
});

test("exactly 2 hours is closing_soon", () => {
  assert.equal(classifyWhatsappFreeformWindow("2026-08-03T14:00:00.000Z", NOW).status, "closing_soon");
});

test("more than 2 hours is open", () => {
  assert.equal(classifyWhatsappFreeformWindow("2026-08-03T14:00:01.000Z", NOW).status, "open");
});

test("MPV inbound does not open EAP", () => {
  const state = resolveWindow({
    memoryRows: [{ api_phone_normalized: MPV_BUSINESS_PHONE, message_at: "2026-08-04T10:00:00.000Z", message_bound_type: "inbound" }],
    parkingBusinessKey: "EAP",
  });
  assert.equal(state.businessKey, "EAP");
  assert.equal(state.status, "missing");
});

test("EAP inbound does not open MPV", () => {
  const state = resolveWindow({
    memoryRows: [{ api_phone_normalized: EAP_BUSINESS_PHONE, message_at: "2026-08-04T10:00:00.000Z", message_bound_type: "inbound" }],
    parkingBusinessKey: "MPV",
  });
  assert.equal(state.businessKey, "MPV");
  assert.equal(state.status, "missing");
});

test("explicit real conversation evidence prevails over parking", () => {
  const state = resolveWindow({
    memoryRows: [
      { api_phone_normalized: MPV_BUSINESS_PHONE, message_at: "2026-08-04T09:00:00.000Z", message_bound_type: "outbound" },
      { api_phone_normalized: MPV_BUSINESS_PHONE, message_at: "2026-08-04T10:00:00.000Z", message_bound_type: "inbound" },
    ],
    parkingBusinessKey: "EAP",
  });
  assert.equal(state.businessKey, "MPV");
  assert.equal(state.status, "open");
});

test("validated EAP case can be open", () => {
  const state = resolveWindow({
    memoryRows: [
      { api_phone_normalized: EAP_BUSINESS_PHONE, message_at: "2026-08-04T07:50:00.000Z", message_bound_type: "outbound" },
      { api_phone_normalized: EAP_BUSINESS_PHONE, message_at: "2026-08-04T07:50:00.000Z", message_bound_type: "inbound" },
    ],
    parkingBusinessKey: "EAP",
  });
  assert.equal(state.businessKey, "EAP");
  assert.equal(state.status, "open");
});

test("validated MPV case can be open", () => {
  const state = resolveWindow({
    memoryRows: [
      { api_phone_normalized: MPV_BUSINESS_PHONE, message_at: "2026-08-04T07:50:00.000Z", message_bound_type: "outbound" },
      { api_phone_normalized: MPV_BUSINESS_PHONE, message_at: "2026-08-04T07:50:00.000Z", message_bound_type: "inbound" },
    ],
    parkingBusinessKey: "MPV",
  });
  assert.equal(state.businessKey, "MPV");
  assert.equal(state.status, "open");
});

test("public DTO excludes internal fields", () => {
  const dto = publicWhatsappFreeformWindow(classifyWhatsappFreeformWindow("2026-08-04T07:50:00.000Z", NOW, "MPV"));
  assert.deepEqual(Object.keys(dto).sort(), ["closesAt", "remainingSeconds", "status"]);
  assert.equal("businessKey" in dto, false);
  assert.equal("lastInboundAt" in dto, false);
  assert.equal("source" in dto, false);
});

test("endpoint source does not expose private WhatsApp fields in JSON DTO", () => {
  const publicDtoBlock = indicatorRoute.slice(indicatorRoute.indexOf("type ChatIndicatorWhatsappWindow"), indicatorRoute.indexOf("type ChatIndicatorPayload"));
  assert.doesNotMatch(publicDtoBlock, /businessKey|phone_number_id|lastInboundAt|source|wa_id|wamid|hash|email|phone/i);
});

test("current chat dot remains in the table", () => {
  assert.match(table, /chatDotClass/);
  assert.match(table, /Chat disponible/);
  assert.match(table, /Sin chat asociado/);
});

test("second WhatsApp window indicator exists", () => {
  assert.match(table, /function WhatsappWindowDot/);
  assert.match(table, /<WhatsappWindowDot nowMs=\{whatsappWindowNowMs\} state=\{chatIndicator\?\.whatsappWindow\}/);
});

test("open uses green visual treatment", () => {
  assert.match(table, /bg-emerald-500/);
  assert.match(table, /Ventana de WhatsApp abierta/);
});

test("closing_soon uses amber visual treatment", () => {
  assert.match(table, /bg-amber-400/);
  assert.match(table, /próxima a cerrar/);
});

test("closed uses red visual treatment", () => {
  assert.match(table, /bg-rose-500/);
  assert.match(table, /Ventana cerrada/);
});

test("missing uses light gray visual treatment", () => {
  assert.match(table, /bg-slate-300\/80/);
  assert.match(table, /Sin respuesta válida del cliente/);
});

test("unverifiable uses differentiated gray treatment", () => {
  assert.match(table, /border border-slate-500 bg-slate-600/);
  assert.match(table, /No se pudo verificar la ventana/);
});

test("indicator has aria-label and tooltip", () => {
  assert.match(table, /aria-label=\{indicator\.ariaLabel\}/);
  assert.match(table, /title=\{indicator\.title\}/);
});

test("mobile card includes both indicators", () => {
  const mobileBlock = table.slice(table.indexOf("md:hidden"), table.indexOf("hidden md:block"));
  assert.match(mobileBlock, /chatDotClass/);
  assert.match(mobileBlock, /WhatsappWindowDot/);
});

test("desktop table includes both indicators", () => {
  const desktopBlock = table.slice(table.indexOf("hidden md:block"));
  assert.match(desktopBlock, /chatDotClass/);
  assert.match(desktopBlock, /WhatsappWindowDot/);
});

test("component uses one global timer at 60 seconds", () => {
  assert.equal((table.match(/setInterval/g) ?? []).length, 1);
  assert.match(table, /60_000/);
});

test("timer cleanup is registered", () => {
  assert.match(table, /clearInterval\(intervalId\)/);
});

test("timer does not refetch indicators every minute", () => {
  const timerBlock = table.slice(table.indexOf("const intervalId = window.setInterval"), table.indexOf("}, []);", table.indexOf("const intervalId = window.setInterval")));
  assert.doesNotMatch(timerBlock, /fetch\(/);
});

test("visual state transitions from open to closing_soon and closed locally", () => {
  assert.match(table, /remainingSeconds <= 0/);
  assert.match(table, /remainingSeconds <= 2 \* 60 \* 60/);
});

test("batch errors degrade safely to unverifiable", () => {
  assert.match(table, /status: "unverifiable"/);
  assert.match(indicatorRoute, /indicatorWithUnverifiableWindow/);
});

test("footer legend explains chat and WhatsApp window indicators", () => {
  assert.match(table, /Chat: actividad/);
  assert.match(table, /Ventana:/);
  assert.match(table, /Abierta/);
  assert.match(table, /Por cerrar/);
  assert.match(table, /Cerrada/);
  assert.match(table, /Sin respuesta/);
  assert.match(table, /No verificable/);
});

test("footer legend reuses the same indicator colors", () => {
  assert.match(table, /bg-sea shadow-\[0_0_0_3px_rgba\(14,148,136,0\.14\)\]/);
  assert.match(table, /bg-emerald-500 shadow-\[0_0_0_3px_rgba\(16,185,129,0\.16\)\]/);
  assert.match(table, /bg-amber-400 shadow-\[0_0_0_3px_rgba\(251,191,36,0\.18\)\]/);
  assert.match(table, /bg-rose-500 shadow-\[0_0_0_3px_rgba\(244,63,94,0\.14\)\]/);
  assert.match(table, /bg-slate-300\/80/);
  assert.match(table, /border border-slate-500 bg-slate-600/);
});

test("footer legend supports desktop right alignment and mobile wrap", () => {
  assert.match(table, /sm:justify-end/);
  assert.match(table, /flex flex-wrap items-center gap-x-3 gap-y-1/);
  assert.match(table, /whitespace-nowrap/);
});

test("footer legend is visible text and accessible", () => {
  assert.match(table, /aria-label="Chat: actividad"/);
  assert.match(table, /aria-label="Ventana abierta"/);
  assert.match(table, /aria-label="Ventana por cerrar"/);
  assert.match(table, /aria-label="Ventana cerrada"/);
  assert.match(table, /aria-label="Ventana sin respuesta"/);
  assert.match(table, /aria-label="Ventana no verificable"/);
});
test("no POST is introduced for indicators", () => {
  assert.doesNotMatch(table, /chat-indicators[\s\S]*?method:\s*"POST"/);
  assert.doesNotMatch(indicatorRoute, /export async function POST/);
});

test("no snapshot or orquestador code is referenced", () => {
  assert.doesNotMatch(indicatorRoute, /snapshot|create_recovery_weekly_snapshot/i);
  assert.doesNotMatch(table, orquestadorPathPattern);
});
