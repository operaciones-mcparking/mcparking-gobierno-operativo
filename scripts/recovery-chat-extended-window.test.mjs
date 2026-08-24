import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routePath = "src/app/api/recuperacion/carritos/[id]/chat/route.ts";
const rangeHelperPath = "src/lib/recuperacion/recovery-chat-read-range.ts";
const whatsappWindowPath = "src/lib/recuperacion/whatsapp-freeform-window.ts";
const sendRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/send/route.ts";
const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";
const templatesRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/templates/route.ts";
const templateModalPath = "src/app/recuperacion/recovery-whatsapp-template-library-modal.tsx";
const routeSource = readFileSync(routePath, "utf8");
const rangeHelperSource = readFileSync(rangeHelperPath, "utf8");
const whatsappWindowSource = readFileSync(whatsappWindowPath, "utf8");
const sendRouteSource = readFileSync(sendRoutePath, "utf8");
const drawerSource = readFileSync(drawerPath, "utf8");
const templatesRouteSource = readFileSync(templatesRoutePath, "utf8");
const templateModalSource = readFileSync(templateModalPath, "utf8");

function loadRangeHelperExports() {
  const module = { exports: {} };
  const output = ts.transpileModule(rangeHelperSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: rangeHelperPath,
  }).outputText;

  vm.runInNewContext(output, {
    exports: module.exports,
    module,
  });

  return module.exports;
}

const { resolveChatReadRange } = loadRangeHelperExports();
const maxChatMessagesMatch = routeSource.match(/const MAX_CHAT_MESSAGES = (\d+);/);
const MAX_CHAT_MESSAGES = maxChatMessagesMatch ? Number(maxChatMessagesMatch[1]) : null;

function isInHalfOpenRange(value, start, end) {
  return Date.parse(value) >= Date.parse(start) && Date.parse(value) < Date.parse(end);
}

test("latest cart extends Message Memory read range from windowStart to now", () => {
  const windowStart = "2026-07-21T21:00:56+00:00";
  const windowEnd = "2026-07-28T21:00:56.000Z";
  const nowIso = "2026-07-31T20:00:00.000Z";
  const laterMessageAt = "2026-07-31T19:31:17+00:00";

  const range = resolveChatReadRange({
    hasNewerCartForPhone: false,
    newerCartLookupFailed: false,
    nowIso,
    windowEnd,
    windowStart,
  });

  assert.equal(range.chatReadStart, windowStart);
  assert.equal(range.chatReadEnd, nowIso);
  assert.equal(isInHalfOpenRange(laterMessageAt, range.chatReadStart, range.chatReadEnd), true);
});

test("older cart keeps historical windowEnd when a newer cart exists for the same phone", () => {
  const windowStart = "2026-07-21T21:00:56+00:00";
  const windowEnd = "2026-07-28T21:00:56.000Z";
  const laterMessageAt = "2026-07-31T19:31:17+00:00";

  const range = resolveChatReadRange({
    hasNewerCartForPhone: true,
    newerCartLookupFailed: false,
    nowIso: "2026-07-31T20:00:00.000Z",
    windowEnd,
    windowStart,
  });

  assert.equal(range.chatReadEnd, windowEnd);
  assert.equal(isInHalfOpenRange(laterMessageAt, range.chatReadStart, range.chatReadEnd), false);
});

test("newer cart with a different phone does not block extension", () => {
  assert.match(routeSource, /\.eq\("phone_normalized",\s*params\.phoneNormalized\)/);
  assert.match(routeSource, /\.gt\("form_datetime",\s*params\.formDatetime\)/);
  assert.match(routeSource, /\.neq\("id",\s*params\.cartId\)/);

  const range = resolveChatReadRange({
    hasNewerCartForPhone: false,
    newerCartLookupFailed: false,
    nowIso: "2026-07-31T20:00:00.000Z",
    windowEnd: "2026-07-28T21:00:56.000Z",
    windowStart: "2026-07-21T21:00:56+00:00",
  });

  assert.equal(range.chatReadEnd, "2026-07-31T20:00:00.000Z");
});

test("newer cart lookup errors fail closed and keep windowEnd", () => {
  const range = resolveChatReadRange({
    hasNewerCartForPhone: false,
    newerCartLookupFailed: true,
    nowIso: "2026-07-31T20:00:00.000Z",
    windowEnd: "2026-07-28T21:00:56.000Z",
    windowStart: "2026-07-21T21:00:56+00:00",
  });

  assert.equal(range.chatReadEnd, "2026-07-28T21:00:56.000Z");
});

test("public cart DTO keeps the original historical windowStart and windowEnd", () => {
  assert.match(routeSource, /cart:\s*safeCartPayload\(cart,\s*windowStart,\s*windowEnd\)/);
  assert.doesNotMatch(routeSource, /safeCartPayload\(cart,\s*chatReadStart,\s*chatReadEnd\)/);
  assert.match(routeSource, /windowEndDate = cart\.form_datetime \? addDays\(cart\.form_datetime,\s*7\) : null/);
});

test("live messages explicitly associated to the cart keep their existing query and limit", () => {
  assert.match(routeSource, /\.from\("recovery_whatsapp_live_messages"\)[\s\S]*?\.eq\("cart_id",\s*params\.cartId\)[\s\S]*?\.limit\(MAX_CHAT_MESSAGES\)/);
  assert.match(routeSource, /\.from\("recovery_whatsapp_live_messages"\)[\s\S]*?\.eq\("phone_normalized",\s*params\.phoneNormalized\)[\s\S]*?\.gte\("message_at",\s*params\.windowStart\)[\s\S]*?\.lt\("message_at",\s*params\.windowEnd\)/);
});

test("Message Memory queries use the protected chatRead range", () => {
  assert.match(routeSource, /import \{ resolveChatReadRange \} from "@\/lib\/recuperacion\/recovery-chat-read-range"/);
  assert.doesNotMatch(routeSource, /export function resolveChatReadRange/);
  assert.match(routeSource, /recovery_whatsapp_message_memory_raw_import[\s\S]*?\.gte\("message_at",\s*chatReadStart\)[\s\S]*?\.lt\("message_at",\s*chatReadEnd\)/);
  assert.match(routeSource, /recovery_whatsapp_message_memory_import[\s\S]*?\.gte\("message_at",\s*chatReadStart\)[\s\S]*?\.lt\("message_at",\s*chatReadEnd\)/);
});

test("MAX_CHAT_MESSAGES remains 100", () => {
  assert.equal(MAX_CHAT_MESSAGES, 100);
  assert.doesNotMatch(routeSource, /export const MAX_CHAT_MESSAGES/);
  assert.match(routeSource, /\.limit\(MAX_CHAT_MESSAGES\)/);
});

test("raw Message Memory keeps priority over normal metadata", () => {
  const rawQueryIndex = routeSource.indexOf('from("recovery_whatsapp_message_memory_raw_import")');
  const rawReturnIndex = routeSource.indexOf('summary: buildSummary(messages, "raw")');
  const normalQueryIndex = routeSource.indexOf('from("recovery_whatsapp_message_memory_import")');

  assert.ok(rawQueryIndex > 0, "raw query exists");
  assert.ok(rawReturnIndex > rawQueryIndex, "raw return exists after raw query");
  assert.ok(normalQueryIndex > rawReturnIndex, "normal query happens only after raw priority branch");
});

test("WAMID remains outside the public DTO and Message Memory selects", () => {
  assert.doesNotMatch(routeSource, /conversation_id/);
  assert.doesNotMatch(routeSource, /whatsapp_message_id/);
  assert.doesNotMatch(routeSource, /wamid/i);
});

test("WhatsApp 24-hour authorization helper and POST send route are not part of this change", () => {
  assert.match(routeSource, /getWhatsappFreeformWindowForCart\(admin\.supabase,\s*cartId\)/);
  assert.match(whatsappWindowSource, /classifyWhatsappFreeformWindow/);
  assert.match(sendRouteSource, /getWhatsappFreeformWindowForCart\(admin\.supabase,\s*cart\.id\)/);
  assert.match(sendRouteSource, /callN8nWebhook\(\{ cart, messageText, operatorEmail, sentAt \}\)/);
  assert.match(sendRouteSource, /whatsapp_window_unverifiable/);
  assert.doesNotMatch(routeSource, /callN8nWebhook/);
  assert.doesNotMatch(routeSource, /export\s+async\s+function\s+POST/);
});


test("open recovery chat keeps the freeform composer behavior", () => {
  assert.match(drawerSource, /const canSendMessage = !isSending && !isFreeformBlocked && Boolean\(cart\?\.phone\) && messageDraft\.trim\(\)\.length > 0/);
  assert.match(drawerSource, /disabled=\{isSending \|\| !cart\?\.phone \|\| isFreeformBlocked\}/);
  assert.match(drawerSource, /if \(canSendMessage\) void sendMessage\(\)/);
  assert.match(drawerSource, /\/api\/recuperacion\/carritos\/" \+ encodeURIComponent\(cartId\) \+ "\/chat\/send/);
});

test("composer template action is available for open closed and missing windows", () => {
  const canUseTemplates = (phone, kind) => Boolean(phone) && kind !== "unverifiable";

  assert.equal(canUseTemplates("+56900000000", "open"), true);
  assert.equal(canUseTemplates("+56900000000", "closed"), true);
  assert.equal(canUseTemplates("+56900000000", "missing"), true);
  assert.equal(canUseTemplates(null, "open"), false);
  assert.equal(canUseTemplates("+56900000000", "unverifiable"), false);
  assert.match(drawerSource, /const canUseTemplates = Boolean\(cart\?\.phone\) && freeformWindow\.kind !== "unverifiable"/);
  assert.doesNotMatch(drawerSource, /shouldShowTemplateButton/);
});

test("composer template action reuses the plus-menu library handler", () => {
  const handlerBlock = drawerSource.slice(drawerSource.indexOf("function openTemplateLibrary"), drawerSource.indexOf("return (", drawerSource.indexOf("function openTemplateLibrary")));
  const composerBlock = drawerSource.slice(drawerSource.indexOf("<form"), drawerSource.indexOf("</form>"));

  assert.match(handlerBlock, /setIsContactActionsOpen\(false\)/);
  assert.match(handlerBlock, /setIsTemplateLibraryOpen\(true\)/);
  assert.equal((drawerSource.match(/onClick=\{openTemplateLibrary\}/g) ?? []).length, 2);
  assert.match(drawerSource, /Enviar plantilla/);
  assert.match(drawerSource, /<RecoveryWhatsappTemplateLibraryModal/);
  assert.match(composerBlock, /aria-label="Enviar plantilla"/);
  assert.match(composerBlock, /title="Enviar plantilla"/);
  assert.match(composerBlock, /<FileText className="h-4 w-4"/);
  assert.match(composerBlock, /disabled=\{isTemplateSending \|\| isTemplateLibraryOpen\}/);
  assert.ok(composerBlock.indexOf('aria-label="Enviar plantilla"') < composerBlock.indexOf('aria-label="Enviar mensaje"'));
  assert.doesNotMatch(drawerSource, /Enviar plantilla aprobada|id="recovery-chat-template"|templatesStatus|templatesError|setTemplates\(/);
});
test("template library modal loads from the safe GET endpoint only", () => {
  const templatesFetch = templateModalSource.match(/fetch\(`\/api\/recuperacion\/carritos\/\$\{encodeURIComponent\(activeCartId\)\}\/chat\/templates`, \{[\s\S]*?\}\);/);

  assert.ok(templatesFetch, "templates fetch block exists");
  assert.match(templatesFetch[0], /method: "GET"/);
  assert.doesNotMatch(templatesFetch[0], /method: "POST"/);
  assert.match(templateModalSource, /AbortController/);
  assert.match(templateModalSource, /reloadToken/);
  assert.doesNotMatch(templateModalSource, /sendTemplate|sendTemplateMessage|\/chat\/send-template/);
});

test("template library modal covers states, search, filters, preview, and selection", () => {
  assert.match(templateModalSource, /role="dialog"/);
  assert.match(templateModalSource, /aria-modal="true"/);
  assert.match(templateModalSource, /event\.key !== "Escape"/);
  assert.match(templateModalSource, /Cargando plantillas desde Meta/);
  assert.match(templateModalSource, /No se pudieron cargar las plantillas/);
  assert.match(templateModalSource, /No hay plantillas aprobadas disponibles para este número/);
  assert.match(templateModalSource, /No se puede determinar el número de WhatsApp de esta conversación/);
  assert.match(templateModalSource, /No hay plantillas que coincidan con la búsqueda/);
  assert.match(templateModalSource, /Buscar plantilla\.\.\./);
  assert.match(templateModalSource, /categoryCounts/);
  assert.match(templateModalSource, /languageFilter/);
  assert.match(templateModalSource, /template\.preview\.body/);
  assert.match(templateModalSource, /template\.variables\.map/);
  assert.match(templateModalSource, /Usar plantilla/);
  assert.match(drawerSource, /Plantilla seleccionada/);
});
test("template visualization does not call n8n or send messages", () => {
  assert.doesNotMatch(templatesRouteSource, /n8n|N8N|callN8nWebhook|messageText/);
  assert.doesNotMatch(drawerSource, /templatesError[\s\S]*callN8nWebhook/);
  assert.match(sendRouteSource, /callN8nWebhook\(\{ cart, messageText, operatorEmail, sentAt \}\)/);
});
test("no unrelated /orquestador files are touched", () => {
  const changedFiles = execFileSync("git", ["status", "--short", "--untracked-files=all"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replaceAll("\\", "/"));
  const orquestadorFiles = changedFiles.filter((path) => path.startsWith("src/app/orquestador/") || path.startsWith("src/lib/orquestador/"));

  assert.equal(orquestadorFiles.every((path) => path === "src/app/orquestador/page.tsx"), true);
});

test("open recovery chat exposes approved templates through the existing plus menu", () => {
  assert.match(drawerSource, /const canUseTemplates = Boolean\(cart\?\.phone\) && freeformWindow\.kind !== "unverifiable"/);
  assert.match(drawerSource, /Abrir acciones del contacto/);
  assert.match(drawerSource, /Enviar plantilla/);
  assert.match(drawerSource, /setIsContactActionsOpen\(false\);[\s\S]*setIsTemplateLibraryOpen\(true\)/);
  for (const action of ["Abrir WhatsApp", "Copiar correo", "Copiar teléfono", "Copiar reserva", "Abrir reserva"]) {
    assert.match(drawerSource, new RegExp(action));
  }
});
