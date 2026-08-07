import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";
const drawer = readFileSync(drawerPath, "utf8");

function functionBlock(name) {
  const declaration = drawer.indexOf(`function ${name}`) >= 0 ? `function ${name}` : `async function ${name}`;
  const start = drawer.indexOf(declaration);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = drawer.indexOf("{", start);
  assert.notEqual(bodyStart, -1, `Missing function body for ${name}`);

  let depth = 0;

  for (let index = bodyStart; index < drawer.length; index += 1) {
    const character = drawer[index];

    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;

    if (depth === 0) {
      return drawer.slice(start, index + 1);
    }
  }

  assert.fail(`Missing function end for ${name}`);
}
const validateBlock = functionBlock("validateSelectedTemplate");
const sendBlock = functionBlock("sendPreparedTemplate");
const selectedPanel = drawer.slice(drawer.indexOf("Plantilla seleccionada"), drawer.indexOf("<div className=\"flex items-end gap-2", drawer.indexOf("Plantilla seleccionada")));
const preparedBlock = drawer.slice(drawer.indexOf("Plantilla preparada"), drawer.indexOf("templateValidationError", drawer.indexOf("Plantilla preparada")));
const sentBlock = drawer.slice(drawer.indexOf("Plantilla enviada"), drawer.indexOf("templateSendError", drawer.indexOf("Plantilla enviada")));

test("1. keep the first step as explicit dry-run preparation", () => {
  assert.match(drawer, /Preparar env/);
  assert.match(drawer, /Preparando env/);
  assert.match(validateBlock, /dryRun: true/);
  assert.doesNotMatch(validateBlock, /dryRun: false/);
});

test("2. confirmation button exists only for the second step", () => {
  assert.match(drawer, /Confirmar y enviar/);
  assert.match(drawer, /canConfirmTemplateSend/);
  assert.match(selectedPanel, /disabled=\{!canConfirmTemplateSend\}/);
});

test("3. confirmation calls the same send-template endpoint", () => {
  assert.match(sendBlock, /\/api\/recuperacion\/carritos\/\$\{encodeURIComponent\(cartId\)\}\/chat\/send-template/);
  assert.match(sendBlock, /method: "POST"/);
});

test("4. confirmation sends exactly the allowed request fields", () => {
  const bodyBlock = sendBlock.slice(sendBlock.indexOf("body: JSON.stringify"), sendBlock.indexOf("headers:", sendBlock.indexOf("body: JSON.stringify")));

  assert.match(bodyBlock, /templateKey: selectedTemplate\.key/);
  assert.match(bodyBlock, /language: selectedTemplate\.language/);
  assert.match(bodyBlock, /variables/);
  assert.match(bodyBlock, /dryRun: false/);
  assert.doesNotMatch(bodyBlock, /businessKey|phone_number_id|phone:|components|previewText|templateName|token|payload/);
});

test("5. dry-run successful preparation stores the exact current snapshot", () => {
  assert.match(validateBlock, /setTemplatePreparedSnapshot\(\{/);
  assert.match(validateBlock, /cartId,/);
  assert.match(validateBlock, /language: selectedTemplate\.language/);
  assert.match(validateBlock, /templateKey: selectedTemplate\.key/);
  assert.match(validateBlock, /variables,/);
});

test("6. confirmation is enabled only for a current preparation", () => {
  assert.match(drawer, /isPreparedTemplateCurrent/);
  assert.match(drawer, /templateSnapshotsMatch\(templatePreparedSnapshot, currentTemplateSnapshot\)/);
  assert.match(drawer, /templateSendStatus !== "sent"/);
  assert.match(drawer, /!templateValidationError/);
});

test("7. snapshot comparison includes cart, template, language, and variables", () => {
  const compareBlock = functionBlock("templateSnapshotsMatch");

  assert.match(compareBlock, /left\.cartId === right\.cartId/);
  assert.match(compareBlock, /left\.templateKey === right\.templateKey/);
  assert.match(compareBlock, /left\.language === right\.language/);
  assert.match(compareBlock, /JSON\.stringify\(left\.variables\) === JSON\.stringify\(right\.variables\)/);
});

test("8. send state is explicit", () => {
  assert.match(drawer, /type TemplateSendStatus = "idle" \| "sending" \| "sent" \| "error"/);
  assert.match(drawer, /setTemplateSendStatus\("sending"\)/);
  assert.match(drawer, /setTemplateSendStatus\("sent"\)/);
  assert.match(drawer, /setTemplateSendStatus\("error"\)/);
});

test("9. sending state guards against double click", () => {
  assert.match(sendBlock, /isTemplateSending\) return/);
  assert.match(drawer, /const isTemplateSending = templateSendStatus === "sending"/);
});

test("10. sending disables preparation and confirmation controls", () => {
  assert.match(drawer, /!isTemplateSending && !error/);
  assert.match(selectedPanel, /disabled=\{!canValidateTemplate\}/);
  assert.match(selectedPanel, /disabled=\{!canConfirmTemplateSend\}/);
});

test("11. sending disables the upper close control and lower template switch", () => {
  const lowerTemplateButton = drawer.slice(drawer.lastIndexOf("Cambiar plantilla aprobada") - 250, drawer.lastIndexOf("Cambiar plantilla aprobada") + 550);

  assert.match(selectedPanel, /aria-label="Cerrar plantilla"/);
  assert.match(selectedPanel, /disabled=\{isTemplateSending\}/);
  assert.doesNotMatch(selectedPanel, />\s*Cambiar plantilla\s*</);
  assert.doesNotMatch(selectedPanel, />\s*Cerrar plantilla\s*</);
  assert.match(lowerTemplateButton, /Cambiar plantilla aprobada/);
  assert.match(lowerTemplateButton, /disabled=\{isTemplateSending\}/);
});

test("12. sending disables variable inputs", () => {
  assert.match(selectedPanel, /disabled=\{isTemplateSending\}/);
  assert.match(selectedPanel, /onChange=\{\(event\) => updateTemplateVariable/);
});

test("13. sending state shows a visible loading message", () => {
  assert.match(drawer, /Enviando plantilla/);
  assert.match(drawer, /aria-live="polite"/);
});

test("14. changing variable clears preparation and send state", () => {
  const updateBlock = functionBlock("updateTemplateVariable");

  assert.match(updateBlock, /resetTemplatePreparationState\(\)/);
  assert.match(updateBlock, /if \(isTemplateSending\) return/);
});

test("15. changing template clears preparation and send state", () => {
  const selectBlock = functionBlock("handleTemplateSelected");

  assert.match(selectBlock, /resetTemplatePreparationState\(\)/);
  assert.match(selectBlock, /if \(isTemplateSending\) return/);
});

test("16. closing selected template clears selection, variables, dry-run, and send state", () => {
  const closeBlock = functionBlock("closeSelectedTemplate");

  assert.match(closeBlock, /setSelectedTemplate\(null\)/);
  assert.match(closeBlock, /setTemplateVariableValues\(\{\}\)/);
  assert.match(closeBlock, /resetTemplatePreparationState\(\)/);
  assert.match(closeBlock, /templateSendControllerRef\.current\?\.abort\(\)/);
});

test("17. cart changes reset template preparation and send status", () => {
  assert.match(drawer, /setTemplatePreparedSnapshot\(null\)/);
  assert.match(drawer, /setTemplateSendError\(null\)/);
  assert.match(drawer, /setTemplateSendResult\(null\)/);
  assert.match(drawer, /setTemplateSendStatus\("idle"\)/);
});

test("18. abort controller is used for in-flight confirmation", () => {
  assert.match(drawer, /templateSendControllerRef = useRef<AbortController \| null>\(null\)/);
  assert.match(sendBlock, /const controller = new AbortController\(\)/);
  assert.match(sendBlock, /signal: controller\.signal/);
  assert.match(sendBlock, /AbortError/);
});

test("19. success block is friendly and compact", () => {
  assert.match(sentBlock, /Plantilla enviada/);
  assert.match(sentBlock, /Negocio/);
  assert.match(sentBlock, /Plantilla/);
  assert.match(sentBlock, /Idioma/);
  assert.match(sentBlock, /templateValidationBusinessLabel/);
});

test("20. success block hides technical identifiers and payloads", () => {
  assert.doesNotMatch(sentBlock, /messageId|messageStatus|maskedPhone|variableCount|payload|components|token|phone_number_id|WABA|wamid/i);
});

test("21. safe error mapping covers n8n and WhatsApp acceptance failures", () => {
  const errorBlock = functionBlock("templateSendErrorMessage");

  assert.match(errorBlock, /n8n_configuration_error/);
  assert.match(errorBlock, /El servicio de env/);
  assert.match(errorBlock, /n8n_timeout/);
  assert.match(errorBlock, /No vuelvas a enviarlo inmediatamente/);
  assert.match(errorBlock, /n8n_network_error/);
  assert.match(errorBlock, /n8n_http_error/);
  assert.match(errorBlock, /n8n_rejected/);
  assert.match(errorBlock, /No se pudo enviar la plantilla/);
});

test("22. error messages are displayed accessibly without auto retry", () => {
  assert.match(drawer, /templateSendError/);
  assert.match(drawer, /role="alert"/);
  assert.doesNotMatch(sendBlock, /setTimeout|retry|while\s*\(|for\s*\(/);
});

test("23. closed and missing states still expose template flow", () => {
  assert.match(drawer, /freeformWindow\.kind === "closed" \|\| freeformWindow\.kind === "missing"/);
  assert.doesNotMatch(sendBlock, /freeformWindow\.kind|canSendFreeform|isFreeformBlocked/);
});

test("24. no direct n8n, Graph messages, Supabase write, or manual insert in the drawer", () => {
  assert.doesNotMatch(drawer, /callN8nWebhook|N8N_RECOVERY|graph\.facebook\.com|\/messages|supabase|\.insert\(|\.update\(|\.upsert\(|\.delete\(/i);
});

test("25. freeform sending remains separate from template confirmation", () => {
  const freeformBlock = functionBlock("sendMessage");

  assert.match(freeformBlock, /\/chat\/send/);
  assert.match(freeformBlock, /messageText/);
  assert.doesNotMatch(freeformBlock, /send-template|templateKey|dryRun: false/);
});