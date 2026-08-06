import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";
const modalPath = "src/app/recuperacion/recovery-whatsapp-template-library-modal.tsx";
const metaPath = "src/lib/recuperacion/meta-whatsapp-templates.ts";
const routePath = "src/app/api/recuperacion/carritos/[id]/chat/templates/route.ts";

const drawer = readFileSync(drawerPath, "utf8");
const modal = readFileSync(modalPath, "utf8");
const meta = readFileSync(metaPath, "utf8");
const route = readFileSync(routePath, "utf8");
const changedSources = [drawer, modal, meta, route].join("\n");
const sendTemplateButtonBlock = drawer.slice(drawer.indexOf("Enviar plantilla") - 600, drawer.indexOf("Enviar plantilla") + 300);

test("1. without selection the compact button says Plantillas", () => {
  assert.match(drawer, /selectedTemplate \? "Cambiar plantilla" : "Plantillas"/);
  assert.match(drawer, /Abrir biblioteca de plantillas aprobadas/);
});

test("2. with selection the compact button says Cambiar plantilla", () => {
  assert.match(drawer, /selectedTemplate \? "Cambiar plantilla" : "Plantillas"/);
  assert.match(drawer, /Cambiar plantilla aprobada/);
  assert.match(drawer, /onClick=\{\(\) => setIsTemplateLibraryOpen\(true\)\}/);
});

test("3. selected template panel exposes Cambiar plantilla and Cerrar plantilla", () => {
  assert.match(drawer, /Plantilla seleccionada/);
  assert.match(drawer, /Cambiar plantilla/);
  assert.match(drawer, /Cerrar plantilla/);
  assert.match(drawer, /aria-label="Cerrar plantilla seleccionada"/);
});

test("4. closing selected template clears selected template and variable values", () => {
  assert.match(drawer, /function closeSelectedTemplate\(\)/);
  assert.match(drawer, /setSelectedTemplate\(null\)/);
  assert.match(drawer, /setTemplateVariableValues\(\{\}\)/);
});

test("5. closing selected template does not close the drawer or call APIs", () => {
  const closeFunction = drawer.slice(drawer.indexOf("function closeSelectedTemplate"), drawer.indexOf("function formatMissingTemplateVariablesMessage"));
  assert.doesNotMatch(closeFunction, /onClose\(|fetch\(|POST|send-template|callN8nWebhook|supabase/i);
});

test("6. cart changes and freeform reopening reset template preparation", () => {
  assert.match(drawer, /setMessageDraft\(""\)/);
  assert.match(drawer, /setSelectedTemplate\(null\)/);
  assert.match(drawer, /setTemplateVariableValues\(\{\}\)/);
  assert.match(drawer, /currentWindow\?\.canSendFreeform/);
});

test("7. all template variables are considered required", () => {
  assert.match(drawer, /selectedTemplatePreparationVariables = selectedTemplate \? selectedTemplate\.variables : \[\]/);
  assert.doesNotMatch(drawer, /selectedTemplateBodyVariablePositions/);
});

test("8. empty or spaces-only variables are pending", () => {
  assert.match(drawer, /!templateVariableValues\[variable\.position\]\?\.trim\(\)/);
  assert.match(drawer, /aria-invalid=\{hasError\}/);
});

test("9. a labelled input is created per variable", () => {
  assert.match(drawer, /selectedTemplatePreparationVariables\.map/);
  assert.match(drawer, /Variable \{variable\.placeholder\}/);
  assert.match(drawer, /htmlFor=\{inputId\}/);
  assert.match(drawer, /id=\{inputId\}/);
  assert.match(drawer, /maxLength=\{500\}/);
});

test("10. missing variable message supports a single missing variable", () => {
  assert.match(drawer, /Falta completar la variable \$\{positions\[0\]\}\./);
});

test("11. missing variable message supports multiple missing variables", () => {
  assert.match(drawer, /Falta completar las variables \$\{firstPositions\} y \$\{lastPosition\}\./);
});

test("12. pending alert is inline and accessible", () => {
  assert.match(drawer, /role="alert"/);
  assert.match(drawer, /formatMissingTemplateVariablesMessage\(selectedTemplateVariableErrors\)/);
  assert.match(drawer, /Completa todas las variables antes de continuar\./);
});

test("13. complete variables show ready helper text", () => {
  assert.match(drawer, /Variables listas para la siguiente etapa\./);
});

test("14. individual input errors remain available", () => {
  assert.match(drawer, /Variable requerida para preparar la plantilla\./);
  assert.match(drawer, /aria-describedby=\{hasError \? errorId : undefined\}/);
});

test("15. preview helper keeps placeholders when a value is empty", () => {
  assert.match(modal, /value\.trim\(\)\.length > 0 \? value : placeholder/);
});

test("16. preview helper replaces placeholders when values exist", () => {
  assert.match(modal, /export function renderTemplatePreviewText/);
  assert.match(drawer, /renderTemplatePreviewText\(selectedTemplate\.preview\.body, templateVariableValues\)/);
  assert.match(drawer, /renderTemplatePreviewText\(button\.text, templateVariableValues\)/);
});

test("17. changing to another template clears previous values", () => {
  assert.match(drawer, /current\?\.key !== template\.key/);
  assert.match(drawer, /setTemplateVariableValues\(\{\}\)/);
});

test("18. choosing the same template preserves values", () => {
  const selectFunction = drawer.slice(drawer.indexOf("function handleTemplateSelected"), drawer.indexOf("function closeSelectedTemplate"));
  assert.match(selectFunction, /if \(current\?\.key !== template\.key\)/);
  assert.doesNotMatch(selectFunction, /else\s*\{\s*setTemplateVariableValues/);
});

test("19. Enviar plantilla remains visible and disabled", () => {
  assert.match(drawer, /Enviar plantilla/);
  assert.match(sendTemplateButtonBlock, /aria-disabled="true"/);
  assert.match(sendTemplateButtonBlock, /disabled/);
  assert.match(sendTemplateButtonBlock, /title="El envío se habilitará en la siguiente etapa"/);
});

test("20. Enviar plantilla has no send onClick", () => {
  assert.doesNotMatch(sendTemplateButtonBlock, /onClick/);
});

test("21. no template POST or send-template endpoint exists", () => {
  assert.doesNotMatch(changedSources, /send-template|sendTemplate|\/chat\/send-template/i);
  assert.doesNotMatch(modal + route, /method:\s*"POST"/);
});

test("22. no n8n, Supabase write, or message send path is added for templates", () => {
  assert.doesNotMatch(modal + route, /callN8nWebhook|N8N_RECOVERY|supabase\.from\([^)]*\)\.insert|insert\(|upsert\(|update\(/i);
  assert.doesNotMatch(sendTemplateButtonBlock, /fetch\(|POST|n8n|supabase/i);
});

test("23. mobile layout avoids horizontal overflow", () => {
  assert.match(drawer, /flex flex-col gap-2 sm:flex-row sm:items-center/);
  assert.match(drawer, /grid min-w-0 gap-2 sm:grid-cols-2/);
  assert.match(drawer, /w-full min-w-0/);
  assert.match(drawer, /focus:ring-2/);
});