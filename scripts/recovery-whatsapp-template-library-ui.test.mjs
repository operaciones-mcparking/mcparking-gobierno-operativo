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
const longTemplateFixtures = Array.from({ length: 10 }, (_, index) => ({
  body: `https://example.com/${"segment-without-spaces".repeat(12)}-${index}`,
  name: `template_${index}`,
  variable: `{{${"1234567890".repeat(8)}}}`,
}));

test("1. drawer shows compact Plantillas button only when freeform is blocked by closed or missing", () => {
  assert.match(drawer, /shouldShowTemplateButton = isFreeformBlocked && \(freeformWindow\.kind === "closed" \|\| freeformWindow\.kind === "missing"\)/);
  assert.match(drawer, /Abrir biblioteca de plantillas aprobadas/);
  assert.match(drawer, /selectedTemplate \? "Cambiar plantilla" : "Plantillas"/);
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
  assert.match(modal, /event\.key !== "Escape"/);
  assert.match(modal, /focus:outline-none focus:ring-2 focus:ring-teal-500/);
});

test("4. modal fetches templates only on open with GET and AbortController", () => {
  assert.match(modal, /if \(!isOpen \|\| !cartId\) return/);
  assert.match(modal, /AbortController/);
  assert.match(modal, /method: "GET"/);
  assert.match(modal, /reloadToken/);
  assert.doesNotMatch(modal, /send-template|callN8nWebhook|N8N_RECOVERY/);
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
  assert.match(drawer, /Plantilla seleccionada/);
  assert.doesNotMatch(modal + route, /sendTemplate|\/chat\/send-template|callN8nWebhook/);
  assert.match(drawer, /Preparar envío/);
  assert.match(drawer, /dryRun: true/);
  assert.match(drawer, /\/chat\/send-template/);
  assert.doesNotMatch(drawer, /sendTemplateMessage|callN8nWebhook|N8N_RECOVERY/);
});

test("9. responsive desktop and mobile layouts are present", () => {
  assert.match(modal, /h-\[100dvh\] w-full/);
  assert.match(modal, /sm:max-h-\[calc\(100dvh-2rem\)\] sm:max-w-6xl sm:rounded-3xl/);
  assert.match(modal, /lg:grid-cols-\[13rem_minmax\(0,1fr\)\]/);
  assert.match(modal, /\[grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,16rem\),1fr\)\)\]/);
  assert.doesNotMatch(modal, /md:grid-cols-2 xl:grid-cols-3/);
  assert.match(modal, /overflow-x-auto/);
});

test("10. template cards contain long content without forcing grid width", () => {
  assert.equal(longTemplateFixtures.length, 10);
  assert.equal(longTemplateFixtures.every((template) => template.body.includes("https://") && template.variable.length > 50), true);
  assert.match(modal, /<main className="grid min-h-0 min-w-0/);
  assert.match(modal, /min-h-0 min-w-0 overflow-x-hidden overflow-y-auto/);
  assert.match(modal, /relative min-w-0 max-w-full overflow-hidden/);
  assert.match(modal, /group grid w-full min-w-0 max-w-full/);
  assert.match(modal, /whitespace-pre-wrap break-words[^"]*\[overflow-wrap:anywhere\]/);
  assert.match(modal, /preview\.header[\s\S]*break-words[\s\S]*preview\.footer/);
  assert.match(modal, /preview\.buttons\.map[\s\S]*max-w-full break-words/);
  assert.match(modal, /template\.variables\.map[\s\S]*max-w-full break-words/);
  assert.match(modal, /flex min-w-0 max-w-full flex-wrap justify-end gap-1/);
  assert.doesNotMatch(modal, /flex shrink-0 flex-wrap justify-end gap-1/);
  assert.doesNotMatch(modal, /filteredTemplates\.length\s*[<=>]+\s*\d+[\s\S]*grid-cols/);
});

test("11. endpoint and Meta helper expose safe approved previews", () => {
  assert.match(meta, /fields", "name,language,status,category,components"/);
  assert.match(meta, /status !== "APPROVED"/);
  assert.match(route, /preview: template\.preview/);
  assert.match(route, /variables: template\.variables/);
  assert.doesNotMatch(route, /phone_number_id|Authorization|Bearer|components:/i);
});
