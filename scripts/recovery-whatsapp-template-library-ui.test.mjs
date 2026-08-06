import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalPath = "src/app/recuperacion/recovery-whatsapp-template-library-modal.tsx";
const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";
const routePath = "src/app/api/recuperacion/carritos/[id]/chat/templates/route.ts";
const metaPath = "src/lib/recuperacion/meta-whatsapp-templates.ts";

const modal = readFileSync(modalPath, "utf8");
const drawer = readFileSync(drawerPath, "utf8");
const route = readFileSync(routePath, "utf8");
const meta = readFileSync(metaPath, "utf8");

test("1. drawer shows compact Plantillas button only when freeform is blocked by closed or missing", () => {
  assert.match(drawer, /shouldShowTemplateButton = isFreeformBlocked && \(freeformWindow\.kind === "closed" \|\| freeformWindow\.kind === "missing"\)/);
  assert.match(drawer, /Abrir biblioteca de plantillas aprobadas/);
  assert.match(drawer, /<span>Plantillas<\/span>/);
  assert.doesNotMatch(drawer, /Enviar plantilla aprobada|id="recovery-chat-template"|templatesStatus|setTemplates\(/);
});

test("2. drawer keeps open and closing_soon freeform composer", () => {
  assert.match(drawer, /const canSendMessage = !isSending && !isFreeformBlocked/);
  assert.match(drawer, /disabled=\{isSending \|\| !cart\?\.phone \|\| isFreeformBlocked\}/);
  assert.match(drawer, /if \(canSendMessage\) void sendMessage\(\)/);
});

test("3. modal is accessible and keyboard closable", () => {
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby="recovery-template-library-title"/);
  assert.match(modal, /aria-label="Cerrar biblioteca de plantillas"/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /focus:outline-none focus:ring-2 focus:ring-teal-500/);
});

test("4. modal fetches templates only on open with GET and AbortController", () => {
  assert.match(modal, /if \(!isOpen \|\| !cartId\) return/);
  assert.match(modal, /AbortController/);
  assert.match(modal, /method: "GET"/);
  assert.match(modal, /reloadToken/);
  assert.doesNotMatch(modal, /method: "POST"|send-template|callN8nWebhook|N8N_RECOVERY/);
});

test("5. search is client-side and covers name label preview category", () => {
  assert.match(modal, /Buscar plantilla\.\.\./);
  assert.match(modal, /previewText\(template\)\.toLowerCase\(\)\.includes\(normalizedQuery\)/);
  assert.match(modal, /template\.name/);
  assert.match(modal, /template\.label/);
  assert.match(modal, /template\.category/);
  assert.match(modal, /template\.preview\.body/);
});

test("6. categories and languages are dynamic", () => {
  assert.match(modal, /categoryCounts/);
  assert.match(modal, /categoryLabel\(template\.category\)/);
  assert.match(modal, /Marketing/);
  assert.match(modal, /Utility/);
  assert.match(modal, /Authentication/);
  assert.match(modal, /templates\.map\(\(template\) => template\.language\)/);
  assert.match(modal, /Todos/);
});

test("7. cards show real preview and placeholders without filling variables", () => {
  assert.match(modal, /template\.preview\.header/);
  assert.match(modal, /template\.preview\.body/);
  assert.match(modal, /template\.preview\.footer/);
  assert.match(modal, /template\.preview\.buttons\.map/);
  assert.match(modal, /template\.variables\.map/);
  assert.match(meta, /placeholder: `\{\{\$\{position\}\}\}`/);
  assert.doesNotMatch(modal, /email|phone_number_id|WABA|access_token|components:/i);
});

test("8. selection is visual only and does not send", () => {
  assert.match(modal, /Usar plantilla/);
  assert.match(modal, /onSelectTemplate\(selectedTemplate\)/);
  assert.match(drawer, /Plantilla seleccionada:/);
  assert.doesNotMatch(modal + route, /sendTemplate|\/chat\/send-template|method:\s*"POST"|callN8nWebhook/);
  assert.doesNotMatch(drawer, /\/chat\/send-template|sendTemplateMessage/);
});

test("9. responsive desktop and mobile layouts are present", () => {
  assert.match(modal, /h-\[100dvh\] w-full/);
  assert.match(modal, /sm:max-h-\[calc\(100dvh-2rem\)\] sm:max-w-6xl sm:rounded-3xl/);
  assert.match(modal, /lg:grid-cols-\[13rem_minmax\(0,1fr\)\]/);
  assert.match(modal, /md:grid-cols-2 xl:grid-cols-3/);
  assert.match(modal, /overflow-x-auto/);
});

test("10. endpoint and Meta helper expose safe approved previews", () => {
  assert.match(meta, /fields", "name,language,status,category,components"/);
  assert.match(meta, /status !== "APPROVED"/);
  assert.match(route, /preview: template\.preview/);
  assert.match(route, /variables: template\.variables/);
  assert.doesNotMatch(route, /phone_number_id|Authorization|Bearer|components:/i);
});
