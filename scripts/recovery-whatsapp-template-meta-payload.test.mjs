import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helperPath = "src/lib/recuperacion/whatsapp-template-send-payload.ts";
const routePath = "src/app/api/recuperacion/carritos/[id]/chat/send-template/route.ts";
const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";

const helper = readFileSync(helperPath, "utf8");
const route = readFileSync(routePath, "utf8");
const drawer = readFileSync(drawerPath, "utf8");

function validateFunctionBlock() {
  return drawer.slice(drawer.indexOf("async function validateSelectedTemplate"), drawer.indexOf("return (", drawer.indexOf("async function validateSelectedTemplate")));
}

test("1. builds messaging_product whatsapp", () => {
  assert.match(helper, /messaging_product: "whatsapp"/);
});

test("2. builds template message type", () => {
  assert.match(helper, /type: "template"/);
});

test("3. uses server-side validated phone", () => {
  assert.match(route, /to: cartResult\.cart\.phone_normalized/);
  assert.doesNotMatch(validateFunctionBlock(), /phone\s*:|phone_number_id|to\s*:/);
});

test("4. uses validated Meta template name", () => {
  assert.match(route, /templateName: template\.name/);
  assert.doesNotMatch(validateFunctionBlock(), /templateName/);
});

test("5. uses validated Meta language", () => {
  assert.match(route, /language: template\.language/);
  assert.match(helper, /code: language/);
});

test("6. orders BODY parameters", () => {
  assert.match(helper, /sort\(\(left, right\) => left\.position - right\.position\)/);
});

test("7. transforms variables to text parameters", () => {
  assert.match(helper, /parameters: orderedVariables\.map/);
  assert.match(helper, /type: "text"/);
  assert.match(helper, /text: variable\.text/);
});

test("8. omits components when there are no variables", () => {
  assert.match(helper, /if \(orderedVariables\.length > 0\)/);
  assert.doesNotMatch(helper, /components: \[\]/);
});

test("9. helper does not include token", () => {
  assert.doesNotMatch(helper + route, /META_WHATSAPP_ACCESS_TOKEN|Authorization|Bearer|access_token/);
});

test("10. helper does not include phone_number_id", () => {
  assert.doesNotMatch(helper, /phone_number_id|META_WHATSAPP_PHONE_NUMBER_ID/);
  assert.doesNotMatch(route, /META_WHATSAPP_PHONE_NUMBER_ID|payload\.phone_number_id|phone_number_id\?: unknown/);
  assert.match(route, /"phone_number_id"/);
});

test("11. helper does not include WABA", () => {
  assert.doesNotMatch(helper + route, /WABA|waba/i);
});

test("12. route does not accept graph payload from the client", () => {
  assert.match(route, /ALLOWED_DRY_RUN_PAYLOAD_KEYS = new Set\(\["dryRun", "language", "templateKey", "variables"\]\)/);
  assert.doesNotMatch(route, /graphPayload\?: unknown|payload\.graphPayload/);
});

test("13. route does not accept businessKey from the client", () => {
  assert.doesNotMatch(route, /businessKey\?: unknown|payload\.businessKey/);
  assert.match(route, /const businessKey = windowState\.businessKey/);
});

test("14. route does not accept phone from the client", () => {
  assert.doesNotMatch(route, /phone\?: unknown|payload\.phone/);
  assert.match(route, /cartResult\.cart\.phone_normalized/);
});

test("15. public Meta payload preview masks phone", () => {
  assert.match(route, /buildRecoveryWhatsappMetaTemplatePayloadPreview\(metaPayload, maskPhone\(cartResult\.cart\.phone_normalized\)\)/);
  assert.match(helper, /to: maskedTo \?\? "masked"/);
});

test("16. internal payload keeps full phone for future server-side integration", () => {
  assert.match(helper, /to,/);
  assert.match(route, /const metaPayload = buildRecoveryWhatsappMetaTemplatePayload/);
  assert.match(route, /to: cartResult\.cart\.phone_normalized/);
});

test("17. payload helper does not fetch", () => {
  assert.doesNotMatch(helper, /fetch\(/);
});

test("18. payload helper and route do not call n8n", () => {
  assert.doesNotMatch(helper + route, /N8N_RECOVERY|callN8nWebhook|webhookUrl|x-mcparking-recovery-secret/);
});

test("19. payload helper does not write Supabase", () => {
  assert.doesNotMatch(helper, /supabase|\.insert\(|\.update\(|\.upsert\(|\.delete\(/i);
});

test("20. route still does not send Meta messages", () => {
  assert.doesNotMatch(helper + route, /\/messages|whatsappMessageId|messaging_product[\s\S]*fetch\(/);
});

test("21. UI continues using dryRun true", () => {
  assert.match(validateFunctionBlock(), /dryRun: true/);
});

test("22. button continues saying Preparar envio", () => {
  assert.match(drawer, /Preparar envío/);
  assert.match(drawer, /Preparando envío/);
});

test("23. no real send is enabled", () => {
  assert.doesNotMatch(drawer, /Enviar plantilla|Confirmar envío|Enviar mensaje de plantilla/);
  assert.doesNotMatch(validateFunctionBlock(), /dryRun: false|callN8nWebhook|N8N_RECOVERY/);
});