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
const validateTemplateButtonBlock = drawer.slice(drawer.indexOf("Preparar envío") - 900, drawer.indexOf("Preparar envío") + 600);

test("1. without selection the compact button says Plantillas", () => {
  assert.match(drawer, /selectedTemplate \? "Cambiar plantilla" : "Plantillas"/);
  assert.match(drawer, /Abrir biblioteca de plantillas aprobadas/);
});

test("2. with selection the compact button says Cambiar plantilla", () => {
  assert.match(drawer, /selectedTemplate \? "Cambiar plantilla" : "Plantillas"/);
  assert.match(drawer, /Cambiar plantilla aprobada/);
  assert.match(drawer, /onClick=\{\(\) => setIsTemplateLibraryOpen\(true\)\}/);
});

test("3. selected template header exposes only the accessible close control", () => {
  const headerBlock = drawer.slice(drawer.indexOf("Plantilla seleccionada"), drawer.indexOf("<div className=\"rounded-2xl bg-[#eef7f4] p-2\">"));

  assert.match(headerBlock, /Plantilla seleccionada/);
  assert.match(headerBlock, /aria-label="Cerrar plantilla"/);
  assert.match(headerBlock, /title="Cerrar plantilla"/);
  assert.match(headerBlock, /<X className="h-3\.5 w-3\.5"/);
  assert.doesNotMatch(headerBlock, />\s*Cambiar plantilla\s*</);
  assert.doesNotMatch(headerBlock, />\s*Cerrar plantilla\s*</);
});

test("4. closing selected template clears selected template and variable values", () => {
  assert.match(drawer, /function closeSelectedTemplate\(\)/);
  assert.match(drawer, /setSelectedTemplate\(null\)/);
  assert.ok(drawer.includes("setTemplateVariableValues({})"));
});

test("5. closing selected template does not close the drawer or call APIs", () => {
  const closeFunction = drawer.slice(drawer.indexOf("function closeSelectedTemplate"), drawer.indexOf("function formatMissingTemplateVariablesMessage"));
  assert.doesNotMatch(closeFunction, /onClose\(|fetch\(|POST|send-template|callN8nWebhook|supabase/i);
});

test("6. cart changes reset template preparation but freeform reopening does not", () => {
  const loadChatBlock = drawer.slice(drawer.indexOf("async function loadChat"), drawer.indexOf("void loadChat()"));

  assert.match(loadChatBlock, /setMessageDraft\(""\)/);
  assert.match(loadChatBlock, /setSelectedTemplate\(null\)/);
  assert.match(loadChatBlock, /setTemplateVariableValues\(\{\}\)/);
  assert.doesNotMatch(drawer, /currentWindow\?\.canSendFreeform/);
});

test("7. all template variables are considered required", () => {
  assert.match(drawer, /selectedTemplatePreparationVariables = selectedTemplate \? selectedTemplate\.variables : \[\]/);
  assert.doesNotMatch(drawer, /selectedTemplateBodyVariablePositions/);
});

test("8. empty or spaces-only variables are pending", () => {
  assert.match(drawer, /!templateVariableValues\[variable\.position\]\?\.trim\(\)/);
  assert.match(drawer, /aria-invalid=\{hasError\}/);
});

test("9. an accessible compact input is created per variable", () => {
  assert.match(drawer, /selectedTemplatePreparationVariables\.map/);
  assert.match(drawer, /<label className="grid min-w-0" htmlFor=\{inputId\}/);
  assert.match(drawer, /<span className="sr-only">Variable \{variable\.placeholder\}<\/span>/);
  assert.match(drawer, /id=\{inputId\}/);
  assert.match(drawer, /placeholder=\{variable\.placeholder\}/);
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
  assert.match(drawer, /Variables listas para preparar en modo prueba./);
});

test("14. individual visible labels and input errors are removed", () => {
  assert.doesNotMatch(drawer, /Variable requerida para preparar la plantilla./);
  assert.doesNotMatch(drawer, /aria-describedby={hasError ? errorId : undefined}/);
  assert.doesNotMatch(drawer, /templateVariableErrorId|errorId/);
});

test("15. preview helper keeps placeholders when a value is empty", () => {
  assert.ok(modal.includes("value.trim().length > 0 ? value : placeholder"));
});

test("16. preview helper replaces placeholders when values exist", () => {
  assert.match(modal, /export function renderTemplatePreviewText/);
  assert.ok(drawer.includes("renderTemplatePreviewText(selectedTemplate.preview.body, templateVariableValues)"));
  assert.ok(drawer.includes("renderTemplatePreviewText(button.text, templateVariableValues)"));
});

test("17. changing to another template clears previous values and validation", () => {
  assert.ok(drawer.includes("current?.key !== template.key"));
  assert.ok(drawer.includes("setTemplateVariableValues({})"));
  assert.ok(drawer.includes("setTemplateValidationResult(null)"));
});

test("18. choosing the same template preserves values", () => {
  const selectFunction = drawer.slice(drawer.indexOf("function handleTemplateSelected"), drawer.indexOf("function closeSelectedTemplate"));
  assert.ok(selectFunction.includes("if (current?.key !== template.key)"));
  assert.doesNotMatch(selectFunction, /elses*{s*setTemplateVariableValues/);
});

test("19. Preparar envio replaces send copy", () => {
  assert.match(drawer, /Preparar envío/);
  assert.match(drawer, /Preparando envío.../);
  assert.doesNotMatch(validateTemplateButtonBlock, /Validar plantilla|Validando plantilla|Enviar plantilla/);
});

test("20. validation button calls the dry-run endpoint", () => {
  assert.match(validateTemplateButtonBlock, /disabled={!canValidateTemplate}/);
  assert.ok(validateTemplateButtonBlock.includes("onClick={() => void validateSelectedTemplate()}"));
  assert.ok(drawer.includes('/api/recuperacion/carritos/${encodeURIComponent(cartId)}/chat/send-template'));
});

test("21. template validation request is dry-run and narrow", () => {
  const validateFunction = drawer.slice(drawer.indexOf("async function validateSelectedTemplate"), drawer.indexOf("return (", drawer.indexOf("async function validateSelectedTemplate")));

  assert.match(validateFunction, /dryRun: true/);
  assert.match(validateFunction, /templateKey: selectedTemplate.key/);
  assert.match(validateFunction, /language: selectedTemplate.language/);
  assert.match(validateFunction, /variables/);
  assert.doesNotMatch(validateFunction, /businessKey|phone_number_id|phone:|components|previewText|templateName|token/);
});

test("21b. prepared result is operator-friendly and hides technical details", () => {
  const resultBlock = drawer.slice(drawer.indexOf("Plantilla preparada") - 300, drawer.indexOf("Plantilla preparada") + 1600);

  assert.match(resultBlock, /Plantilla preparada/);
  assert.match(resultBlock, /Vista previa final/);
  assert.match(resultBlock, /templateValidationBusinessLabel/);
  assert.match(drawer, /MPV" \| "EAP"/);
  assert.match(drawer, /McParking/);
  assert.match(drawer, /Estacionamiento Aeropuerto/);
  assert.match(resultBlock, /selectedTemplate.label/);
  assert.match(resultBlock, /Idioma/);
  assert.doesNotMatch(resultBlock, /variableCount|maskedPhone|templateName|Payload|phone_number_id|token|components/);
});

test("21c. redundant closed and missing footer hints are hidden when templates are available", () => {
  assert.match(drawer, /freeformWindow.kind === "closed" && !shouldShowTemplateButton/);
  assert.match(drawer, /freeformWindow.kind === "missing" && !shouldShowTemplateButton/);
  assert.match(drawer, /freeformWindow.kind === "unverifiable"/);
});

test("22. template dry-run UI still has no n8n, Supabase write, or message history update", () => {
  const validateFunction = drawer.slice(drawer.indexOf("async function validateSelectedTemplate"), drawer.indexOf("return (", drawer.indexOf("async function validateSelectedTemplate")));

  assert.doesNotMatch(modal + route, /callN8nWebhook|N8N_RECOVERY|insert\(|upsert\(|update\(/i);
  assert.doesNotMatch(validateFunction, /callN8nWebhook|N8N_RECOVERY|supabase|setData\(|messageDraft|\/messages/i);
});

test("23. mobile layout avoids horizontal overflow", () => {
  assert.match(drawer, /flex flex-col gap-2 sm:flex-row sm:items-center/);
  assert.match(drawer, /grid min-w-0 gap-2 sm:grid-cols-2/);
  assert.match(drawer, /w-full min-w-0/);
  assert.match(drawer, /focus:ring-2/);
});