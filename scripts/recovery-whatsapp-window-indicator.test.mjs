import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const helperPath = "src/lib/recuperacion/whatsapp-freeform-window.ts";
const chatIndicatorHelperPath = "src/lib/recuperacion/recovery-chat-indicator.ts";
const indicatorRoutePath = "src/app/api/recuperacion/carritos/chat-indicators/route.ts";
const tablePath = "src/app/recuperacion/recovery-cart-audit-table.tsx";
const orquestadorPathPattern = /src\/app\/orquestador/;

const helper = readFileSync(helperPath, "utf8");
const chatIndicatorHelper = readFileSync(chatIndicatorHelperPath, "utf8");
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
      if (name === "@/lib/recuperacion/commercial-parking") {
        return {
          resolveRecoveryCommercialParking({ parkingCode }) {
            const normalized = String(parkingCode ?? "").trim().toUpperCase();
            return {
              parkingCode: normalized === "EAP" || normalized === "MPV" ? normalized : null,
              reason: "parking_code",
              status: normalized === "EAP" || normalized === "MPV" ? "resolved" : "unknown",
            };
          },
        };
      }
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

function loadChatIndicatorHelperExports() {
  const module = { exports: {} };
  const output = ts.transpileModule(chatIndicatorHelper, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: chatIndicatorHelperPath,
  }).outputText;

  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    require(name) {
      if (name === "server-only") return {};
      if (name === "@/lib/recuperacion/commercial-parking") {
        return {
          resolveRecoveryCommercialParking({ cmsUrl, parkingCode }) {
            const host = String(cmsUrl ?? "").toLowerCase();
            if (host.includes("estacionamientoaeropuerto.cl")) return { parkingCode: "EAP", reason: "cms_url_host", status: "resolved" };
            if (host.includes("mcparking.cl")) return { parkingCode: "MPV", reason: "cms_url_host", status: "resolved" };
            const normalized = String(parkingCode ?? "").trim().toUpperCase();
            return {
              parkingCode: normalized === "MPV" || normalized === "EAP" ? normalized : null,
              reason: "parking_code",
              status: normalized === "MPV" || normalized === "EAP" ? "resolved" : "unknown",
            };
          },
        };
      }
      if (name === "@/lib/recuperacion/whatsapp-freeform-window") {
        return {
          businessKeyForBusinessPhone(value) {
            const normalized = String(value ?? "").replace(/\D/g, "");
            if (normalized === EAP_BUSINESS_PHONE) return "EAP";
            if (normalized === MPV_BUSINESS_PHONE) return "MPV";
            return null;
          },
          businessKeyForParking(value) {
            const normalized = String(value ?? "").trim().toUpperCase();
            if (normalized === "EAP") return "EAP";
            if (normalized === "MPV") return "MPV";
            return null;
          },
        };
      }
      throw new Error(`Unexpected require in chat indicator helper test: ${name}`);
    },
  });

  return module.exports;
}

const { chatConversationIndicatorFromMemoryRows } = loadChatIndicatorHelperExports();

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

test("endpoint does not write and uses only scoped read RPCs", () => {
  assert.doesNotMatch(indicatorRoute, /\.insert\(/);
  assert.doesNotMatch(indicatorRoute, /\.update\(/);
  assert.doesNotMatch(indicatorRoute, /\.delete\(/);
  assert.doesNotMatch(indicatorRoute, /\.upsert\(/);
  assert.match(indicatorRoute, /\.rpc\("recovery_whatsapp_conversation_indicators_v2"/);
  assert.doesNotMatch(indicatorRoute, /\.rpc\("(?!recovery_whatsapp_conversation_indicators_v2)/);
});

test("endpoint uses batch processing without the individual loader", () => {
  assert.match(indicatorRoute, /normalizeIdsFromSearchParams/);
  assert.match(indicatorRoute, /\.in\("id", ids\)/);
  assert.match(indicatorRoute, /\.in\("wa_id_normalized", phones\)/);
  assert.match(indicatorRoute, /\.in\("cart_v2_id", cartIds\)/);
  assert.match(indicatorRoute, /\.in\("cart_id", legacyCartIds\)/);
  assert.match(indicatorRoute, /legacyCartIdentityByV2CartId/);
  assert.match(indicatorRoute, /dedupeLiveRows/);
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
  const publicDtoBlock = indicatorRoute.slice(indicatorRoute.indexOf("type ChatIndicatorPayload"), indicatorRoute.indexOf("type PagedRowsResult"));
  assert.doesNotMatch(publicDtoBlock, /businessKey|phone_number_id|lastInboundAt|source|wa_id|wamid|hash|email|phone/i);
});

test("chat indicator marks responded when the customer has any inbound message in the associated conversation", () => {
  const indicator = chatConversationIndicatorFromMemoryRows(
    { form_datetime: "2026-08-20T08:00:00.000Z", id: "cart-1", parking_code: "MPV" },
    [
      { api_phone_normalized: MPV_BUSINESS_PHONE, chat_state: "active", intent_category: "question", message_at: "2026-08-20T09:00:00.000Z", message_bound_type: "outbound", message_sentiment: "neutral", wa_id_normalized: "56900000000" },
      { api_phone_normalized: MPV_BUSINESS_PHONE, chat_state: "active", intent_category: "booking", message_at: "2026-08-20T10:00:00.000Z", message_bound_type: "inbound", message_sentiment: "positive", wa_id_normalized: "56900000000" },
    ],
  );

  assert.equal(indicator.hasChat, true);
  assert.equal(indicator.hasInbound, true);
  assert.equal(indicator.chatMessageCount, 2);
  assert.equal(indicator.lastInboundMessageAt, "2026-08-20T10:00:00.000Z");
});

test("chat indicator marks no response when only outbound messages exist", () => {
  const indicator = chatConversationIndicatorFromMemoryRows(
    { form_datetime: "2026-08-20T08:00:00.000Z", id: "cart-1", parking_code: "MPV" },
    [
      { api_phone_normalized: MPV_BUSINESS_PHONE, chat_state: null, intent_category: null, message_at: "2026-08-20T09:00:00.000Z", message_bound_type: "outbound", message_sentiment: null, wa_id_normalized: "56900000000" },
      { api_phone_normalized: MPV_BUSINESS_PHONE, chat_state: null, intent_category: null, message_at: "2026-08-20T09:05:00.000Z", message_bound_type: "outbound", message_sentiment: null, wa_id_normalized: "56900000000" },
    ],
  );

  assert.equal(indicator.hasChat, true);
  assert.equal(indicator.hasInbound, false);
  assert.equal(indicator.chatMessageCount, 2);
});

test("chat indicator picks latest inbound metadata across multiple messages", () => {
  const indicator = chatConversationIndicatorFromMemoryRows(
    { form_datetime: "2026-08-20T08:00:00.000Z", id: "cart-1", parking_code: "MPV" },
    [
      { api_phone_normalized: MPV_BUSINESS_PHONE, chat_state: "old", intent_category: "old", message_at: "2026-08-20T09:00:00.000Z", message_bound_type: "inbound", message_sentiment: "neutral", wa_id_normalized: "56900000000" },
      { api_phone_normalized: MPV_BUSINESS_PHONE, chat_state: "new", intent_category: "new", message_at: "2026-08-20T11:00:00.000Z", message_bound_type: "inbound", message_sentiment: "positive", wa_id_normalized: "56900000000" },
      { api_phone_normalized: MPV_BUSINESS_PHONE, chat_state: "out", intent_category: "out", message_at: "2026-08-20T12:00:00.000Z", message_bound_type: "outbound", message_sentiment: "neutral", wa_id_normalized: "56900000000" },
    ],
  );

  assert.equal(indicator.lastInboundChatState, "new");
  assert.equal(indicator.lastInboundIntentCategory, "new");
  assert.equal(indicator.lastInboundSentiment, "positive");
});

test("chat indicator keeps contacts without messages as no chat", () => {
  const indicator = chatConversationIndicatorFromMemoryRows({ form_datetime: "2026-08-20T08:00:00.000Z", id: "cart-1", parking_code: "MPV" }, []);

  assert.equal(indicator.hasChat, false);
  assert.equal(indicator.hasInbound, false);
  assert.equal(indicator.chatMessageCount, 0);
});

test("chat indicator does not count a different known business conversation as a response", () => {
  const indicator = chatConversationIndicatorFromMemoryRows(
    { form_datetime: "2026-08-20T08:00:00.000Z", id: "cart-1", parking_code: "MPV" },
    [
      { api_phone_normalized: EAP_BUSINESS_PHONE, chat_state: "active", intent_category: "booking", message_at: "2026-08-20T10:00:00.000Z", message_bound_type: "inbound", message_sentiment: "positive", wa_id_normalized: "56900000000" },
      { api_phone_normalized: MPV_BUSINESS_PHONE, chat_state: null, intent_category: null, message_at: "2026-08-20T11:00:00.000Z", message_bound_type: "outbound", message_sentiment: null, wa_id_normalized: "56900000000" },
    ],
  );

  assert.equal(indicator.hasChat, true);
  assert.equal(indicator.hasInbound, false);
  assert.equal(indicator.chatMessageCount, 1);
});

test("endpoint uses normalized phone keys from compat views for chat association", () => {
  assert.match(indicatorRoute, /\.select\("id,booking_id,phone_normalized,parking_code,cms_url,form_datetime"\)/);
  assert.match(indicatorRoute, /\.in\("wa_id_normalized", phones\)/);
  assert.doesNotMatch(indicatorRoute, /memoryBoundsForCarts/);
  assert.doesNotMatch(indicatorRoute, /\.gte\("message_at", memoryBounds\.from\)/);
  assert.doesNotMatch(indicatorRoute, /\.lt\("message_at", memoryBounds\.to\)/);
  assert.match(indicatorRoute, /normalMemoryRowsByPhone/);
  assert.match(chatIndicatorHelper, /businessKeyForBusinessPhone\(row\.api_phone_normalized\)/);
});

test("endpoint does not open the WhatsApp window from a different known business", () => {
  assert.match(indicatorRoute, /businessKeyForBusinessPhone/);
  assert.match(indicatorRoute, /function memoryRowsForCartBusiness/);
  assert.match(indicatorRoute, /resolveRecoveryCommercialParking/);
  assert.match(indicatorRoute, /cmsUrl:\s*cart\.cms_url/);
  assert.match(indicatorRoute, /const rowBusinessKey = businessKeyForBusinessPhone\(row\.api_phone_normalized\)/);
  assert.match(indicatorRoute, /return !rowBusinessKey \|\| rowBusinessKey === parkingBusinessKey/);
  assert.match(indicatorRoute, /const cartWindowMemoryRows = memoryRowsForCartBusiness/);
  assert.match(indicatorRoute, /memoryRows: cartWindowMemoryRows/);
});

test("chat indicator follows the conversation by phone and sender instead of the cart relation window", () => {
  const indicator = chatConversationIndicatorFromMemoryRows(
    { form_datetime: "2026-08-20T08:00:00.000Z", id: "cart-1", parking_code: "MPV" },
    [
      { api_phone_normalized: MPV_BUSINESS_PHONE, chat_state: "old", intent_category: "old", message_at: "2026-08-19T10:00:00.000Z", message_bound_type: "inbound", message_sentiment: "positive", wa_id_normalized: "56900000000" },
      { api_phone_normalized: MPV_BUSINESS_PHONE, chat_state: null, intent_category: null, message_at: "2026-08-20T09:00:00.000Z", message_bound_type: "outbound", message_sentiment: null, wa_id_normalized: "56900000000" },
    ],
  );

  assert.equal(indicator.hasChat, true);
  assert.equal(indicator.hasInbound, true);
  assert.equal(indicator.chatMessageCount, 2);
  assert.equal(indicator.lastInboundMessageAt, "2026-08-19T10:00:00.000Z");
});

test("responded and no-response rows render distinct visual states", () => {
  const viewStart = table.indexOf("function chatIndicatorView");
  const viewEnd = table.indexOf("function formatWhatsappWindowRemaining");
  const viewBlock = table.slice(viewStart, viewEnd);

  assert.match(viewBlock, /chatIndicator\?\.hasInbound[\s\S]*bg-sea/);
  assert.match(viewBlock, /row\.hasChat === true[\s\S]*bg-sky-400/);
  assert.match(viewBlock, /Chat respondió/);
  assert.match(viewBlock, /Chat sin respuesta/);
  assert.notEqual("bg-sea shadow-[0_0_0_3px_rgba(14,148,136,0.14)]", "bg-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.14)]");
});

test("current chat dot remains in the table", () => {
  assert.match(table, /chatIndicatorView/);
  assert.match(table, /Chat respondió/);
  assert.match(table, /Chat sin respuesta/);
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
  assert.match(mobileBlock, /chatIndicatorView/);
  assert.match(mobileBlock, /WhatsappWindowDot/);
});

test("desktop table includes both indicators", () => {
  const desktopBlock = table.slice(table.indexOf("hidden md:block"));
  assert.match(desktopBlock, /chatIndicatorView/);
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

test("table exposes a targeted chat indicator refresh helper", () => {
  assert.match(table, /const loadChatIndicatorsForIds = useCallback/);
  assert.match(table, /new URLSearchParams\(\{ cartIds: ids\.join\(","\) \}\)/);
  assert.match(table, /\/api\/recuperacion\/carritos\/chat-indicators\?\$\{params\.toString\(\)\}/);
});

test("chat drawer notifies the table when chat data can refresh indicators", () => {
  assert.match(table, /onChatIndicatorRefreshNeeded=\{\(cartId\) => \{/);
  assert.match(table, /void loadChatIndicatorsForIds\(\[cartId\]\)/);
  assert.match(readFileSync("src/app/recuperacion/recovery-cart-chat-drawer.tsx", "utf8"), /onChatIndicatorRefreshNeeded\?: \(cartId: string\) => void/);
});

test("silent chat polling refreshes only the opened cart indicator when new messages arrive", () => {
  const drawer = readFileSync("src/app/recuperacion/recovery-cart-chat-drawer.tsx", "utf8");

  assert.match(drawer, /CHAT_POLL_INTERVAL_MS = 5_000/);
  assert.match(drawer, /knownMessageIdentitiesRef/);
  assert.match(drawer, /params\.mode === "initial" \? nextMessageCount > 0 : hasUnseenMessages/);
  assert.match(drawer, /onChatIndicatorRefreshNeeded\?\.\(params\.activeCartId\)/);
});

test("indicator refresh does not introduce global table polling", () => {
  assert.equal((table.match(/chat-indicators\?/g) ?? []).length, 1);
  const intervalBlocks = table.match(/setInterval[\s\S]*?clearInterval/g) ?? [];

  assert.equal(intervalBlocks.length, 1);
  assert.doesNotMatch(intervalBlocks[0], /chat-indicators/);
  assert.doesNotMatch(intervalBlocks[0], /loadChatIndicatorsForIds/);
});

test("visual state transitions from open to closing_soon and closed locally", () => {
  assert.match(table, /remainingSeconds <= 0/);
  assert.match(table, /remainingSeconds <= 2 \* 60 \* 60/);
});

test("batch errors degrade safely to unverifiable", () => {
  assert.match(table, /status: "unverifiable"/);
  assert.match(indicatorRoute, /indicatorWithUnknownChat/);
  assert.match(indicatorRoute, /hasChat:\s*null/);
});

test("indicator normal with chat preserves hasChat true", () => {
  assert.match(chatIndicatorHelper, /hasChat:\s*relevantRows\.length > 0/);
});

test("indicator normal without chat preserves hasChat false", () => {
  assert.match(indicatorRoute, /function emptyIndicator\(cartId: string\)[\s\S]*hasChat:\s*false/);
});

test("metadata timeout keeps chat clickable with unknown chat state", () => {
  assert.match(indicatorRoute, /memoryRowsResult\.error/);
  assert.match(indicatorRoute, /indicatorWithUnknownChat\(indicator\)/);
});

test("raw timeout keeps chat clickable with unknown chat state", () => {
  assert.match(indicatorRoute, /rawRowsResult\.error/);
  assert.match(indicatorRoute, /indicatorWithUnknownChat\(indicator\)/);
});

test("live indicator source error keeps chat clickable with unknown chat state", () => {
  assert.match(indicatorRoute, /liveRowsResults\.some\(\(result\) => result\.error\)/);
  assert.match(indicatorRoute, /indicatorWithUnknownChat\(indicator\)/);
});

test("error fallback keeps WhatsApp window unverifiable", () => {
  assert.match(indicatorRoute, /whatsappWindow:\s*UNVERIFIABLE_WHATSAPP_WINDOW/);
});

test("cart row opens chat drawer independently from history indicator state", () => {
  assert.match(table, /function canOpenRecoveryChat\(row: RecoveryCartAuditRow\)/);
  assert.match(table, /Boolean\(row\.phone\?\.trim\(\)\) && Boolean\(row\.parking_code\?\.trim\(\)\)/);
  assert.equal((table.match(/const canOpenChat = canOpenRecoveryChat\(displayRow\)/g) ?? []).length, 2);
  assert.doesNotMatch(table, /const canOpenChat = displayRow\.hasChat !== false/);
  assert.doesNotMatch(table, /const canOpenChat = displayRow\.hasChat === true/);
});

test("chat opening rule allows empty-history carts when phone and parking are present", () => {
  const canOpenRecoveryChat = (row) => Boolean(row.phone?.trim()) && Boolean(row.parking_code?.trim());

  assert.equal(canOpenRecoveryChat({ hasChat: true, parking_code: "MPV", phone: "+56900000000" }), true);
  assert.equal(canOpenRecoveryChat({ hasChat: false, parking_code: "MPV", phone: "+56900000000" }), true);
  assert.equal(canOpenRecoveryChat({ hasChat: false, parking_code: "EAP", phone: "+56900000001" }), true);
  assert.equal(canOpenRecoveryChat({ hasChat: false, parking_code: "MPV", phone: "" }), false);
  assert.equal(canOpenRecoveryChat({ hasChat: false, parking_code: "", phone: "+56900000000" }), false);
});

test("footer legend explains chat and WhatsApp window indicators", () => {
  assert.match(table, /Chat:/);
  assert.match(table, /Respondi\u00f3/);
  assert.match(table, /Chat sin respuesta/);
  assert.match(table, /Ventana:/);
  assert.match(table, /Abierta/);
  assert.match(table, /Por cerrar/);
  assert.match(table, /Cerrada/);
  assert.match(table, /Sin respuesta/);
  assert.match(table, /No verificable/);
});

test("footer legend reuses the same indicator colors", () => {
  assert.match(table, /bg-sea shadow-\[0_0_0_3px_rgba\(14,148,136,0\.14\)\]/);
  assert.match(table, /bg-sky-400 shadow-\[0_0_0_3px_rgba\(56,189,248,0\.14\)\]/);
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
  assert.match(table, /aria-label="Chat respondi\u00f3"/);
  assert.match(table, /aria-label="Chat sin respuesta"/);
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
