import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routePath = "src/app/api/recuperacion/carritos/[id]/chat/send-template/route.ts";
const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";
const metaPayloadPath = "src/lib/recuperacion/whatsapp-template-send-payload.ts";
const n8nPayloadPath = "src/lib/recuperacion/whatsapp-template-n8n-payload.ts";

const route = readFileSync(routePath, "utf8");
const drawer = readFileSync(drawerPath, "utf8");
const metaPayload = readFileSync(metaPayloadPath, "utf8");
const n8nPayload = readFileSync(n8nPayloadPath, "utf8");

function validateFunctionBlock() {
  const start = drawer.indexOf("async function validateSelectedTemplate");
  const end = drawer.indexOf("async function sendPreparedTemplate", start);

  return drawer.slice(start, end);
}

function sendFunctionBlock() {
  const start = drawer.indexOf("async function sendPreparedTemplate");
  const end = drawer.indexOf("return (", start);

  return drawer.slice(start, end);
}

function responseBlock() {
  const marker = "dryRun: true,";
  const markerIndex = route.indexOf(marker);
  assert.notEqual(markerIndex, -1, "dry-run response block missing");
  const start = route.lastIndexOf("return NextResponse.json({", markerIndex);
  const end = route.indexOf("  const n8nResult", markerIndex);
  assert.notEqual(start, -1, "dry-run response block start missing");
  assert.notEqual(end, -1, "dry-run response block end missing");
  return route.slice(start, end);
}

test("1. n8n helper is server-only", () => {
  assert.match(n8nPayload, /^import "server-only";/);
});

test("2. internal contract uses template mode", () => {
  assert.match(n8nPayload, /mode: "template"/);
  assert.match(n8nPayload, /mode: payload\.mode/);
});

test("3. internal senderKey is MPV or EAP", () => {
  assert.match(n8nPayload, /senderKey: RecoveryWhatsappBusinessKey/);
  assert.match(route, /senderKey: businessKey/);
});

test("4. MPV and EAP are resolved server-side", () => {
  assert.match(route, /const businessKey = windowState\.businessKey/);
  assert.match(route, /isSupportedBusinessKey\(windowState\.businessKey\)/);
  assert.doesNotMatch(validateFunctionBlock(), /businessKey|senderKey/);
});

test("5. metaPayload is built from the Meta payload helper", () => {
  assert.match(route, /const metaPayload = buildRecoveryWhatsappMetaTemplatePayload/);
  assert.match(n8nPayload, /metaPayload: MetaTemplateMessagePayload/);
});

test("6. internal metaPayload keeps the full server-side phone", () => {
  assert.match(route, /to: cartResult\.cart\.phone_normalized/);
  assert.match(route, /metaPayload,/);
});

test("7. public n8n transport preview masks the phone", () => {
  assert.match(route, /buildRecoveryWhatsappTemplateN8nPayloadPreview/);
  assert.match(route, /maskPhone\(cartResult\.cart\.phone_normalized\)/);
  assert.match(n8nPayload, /buildRecoveryWhatsappMetaTemplatePayloadPreview\(payload\.metaPayload, maskedTo\)/);
});

test("8. template name comes from the validated Meta template", () => {
  assert.match(route, /templateName: template\.name/);
  assert.doesNotMatch(validateFunctionBlock(), /templateName/);
});

test("9. language comes from the validated Meta template", () => {
  assert.match(route, /language: template\.language/);
  assert.match(metaPayload, /code: language/);
});

test("10. components are created server-side from validated variables", () => {
  assert.match(route, /variables: variablesResult\.variables/);
  assert.match(metaPayload, /parameters: orderedVariables\.map/);
  assert.doesNotMatch(validateFunctionBlock(), /components/);
});

test("11. component order is numeric and stable", () => {
  assert.match(metaPayload, /sort\(\(left, right\) => left\.position - right\.position\)/);
});

test("12. previewText is rendered server-side", () => {
  assert.match(route, /previewBody = renderPreviewText\(template\.preview\.body, variablesResult\.variables\)/);
  assert.match(route, /previewText: previewBody \?\? ""/);
});

test("13. operatorEmail comes from auth, not client payload", () => {
  assert.match(route, /operatorEmail: admin\.user\.email \?\? ""/);
  assert.doesNotMatch(validateFunctionBlock(), /operatorEmail/);
});

test("14. sentAt is generated server-side", () => {
  assert.match(route, /sentAt: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(validateFunctionBlock(), /sentAt/);
});

test("15. source is fixed server-side", () => {
  assert.match(n8nPayload, /source: "recovery_web"/);
  assert.doesNotMatch(validateFunctionBlock(), /source/);
});

test("16. public preview includes only safe transport fields", () => {
  assert.match(n8nPayload, /type RecoveryWhatsappTemplateN8nPayloadPreview = \{/);
  assert.match(n8nPayload, /metaPayload: MetaTemplateMessagePayload/);
  assert.match(n8nPayload, /previewText: string/);
  assert.doesNotMatch(n8nPayload.slice(n8nPayload.indexOf("type RecoveryWhatsappTemplateN8nPayloadPreview"), n8nPayload.indexOf("export type BuildRecovery")), /cartId|operatorEmail|sentAt|cartType/);
});

test("17. responses do not expose the full internal transport payload", () => {
  const dryRunBlock = responseBlock();
  const sendBlock = route.slice(route.lastIndexOf("return NextResponse.json({"));
  assert.match(dryRunBlock, /n8nTransportPreview/);
  assert.doesNotMatch(sendBlock, /n8nTransportPayload,|operatorEmail|sentAt|metaPayload|components/);
});

test("18. response keeps backwards-compatible previews", () => {
  const block = responseBlock();
  assert.match(block, /metaPayloadPreview/);
  assert.match(block, /n8nPayloadPreview/);
  assert.match(block, /validation/);
});

test("19. client can only send dryRun, templateKey, language, and variables", () => {
  assert.match(route, /ALLOWED_DRY_RUN_PAYLOAD_KEYS = new Set\(\["dryRun", "language", "templateKey", "variables"\]\)/);
  assert.match(route, /hasOnlyAllowedPayloadKeys\(payload\)/);
});

test("20. authority fields are explicitly forbidden", () => {
  for (const field of [
    "mode",
    "senderKey",
    "businessKey",
    "metaPayload",
    "graphPayload",
    "n8nPayload",
    "n8nTransportPayload",
    "phone",
    "components",
    "previewText",
    "operatorEmail",
    "sentAt",
    "source",
    "phone_number_id",
    "accessToken",
  ]) {
    assert.match(route, new RegExp(`"${field}"`));
  }
  assert.match(route, /unknown_payload_field/);
});

test("21. browser does not send authority fields", () => {
  const block = validateFunctionBlock();
  assert.match(block, /dryRun: true/);
  assert.match(block, /templateKey/);
  assert.match(block, /language/);
  assert.match(block, /variables/);
  assert.doesNotMatch(block, /mode|senderKey|businessKey|metaPayload|graphPayload|phone|components|previewText|operatorEmail|sentAt|phone_number_id|accessToken/);
});

test("22. no token, WABA, phone number id, or webhook URL is exposed", () => {
  assert.doesNotMatch(n8nPayload + route, /META_WHATSAPP_ACCESS_TOKEN|Authorization|Bearer|access_token|WABA|waba|N8N_RECOVERY|x-mcparking-recovery-secret/);
  assert.match(route, /"webhookUrl"/);
});

test("23. helper does not fetch", () => {
  assert.doesNotMatch(n8nPayload, /fetch\(/);
});

test("24. helper and route do not call n8n", () => {
  assert.doesNotMatch(n8nPayload + route, /callN8nWebhook|N8N_RECOVERY|n8n\.cloud/i);
});

test("25. helper and route do not call Graph messages", () => {
  assert.doesNotMatch(n8nPayload + route, /\/messages|whatsappMessageId|messaging_product[\s\S]*fetch\(/);
});

test("26. payload helper stays write-free and route persists only after dry-run returns", () => {
  assert.doesNotMatch(n8nPayload, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.ok(route.indexOf("if (payload.dryRun)") < route.indexOf('.from("recovery_whatsapp_live_messages")'));
  assert.match(route, /whatsapp_status: "pending"/);
});

test("27. route requires an explicit dryRun boolean", () => {
  assert.match(route, /typeof payload\.dryRun !== "boolean"/);
  assert.match(route, /dry_run_required/);
  assert.match(route, /dryRun: true/);
  assert.match(route, /dryRun: false/);
});

test("28. UI keeps preparation as the first step and adds explicit confirmation", () => {
  assert.match(drawer, /Preparar env/);
  assert.match(drawer, /Preparando env/);
  assert.match(drawer, /Confirmar y enviar/);
  assert.match(sendFunctionBlock(), /dryRun: false/);
});

test("29. UI confirmation calls only the server endpoint with no n8n authority fields", () => {
  const validateBlock = validateFunctionBlock();
  const sendBlock = sendFunctionBlock();

  assert.match(validateBlock, /method: "POST"/);
  assert.match(validateBlock, /dryRun: true/);
  assert.match(sendBlock, /method: "POST"/);
  assert.match(sendBlock, /\/chat\/send-template/);
  assert.doesNotMatch(sendBlock, /callN8nWebhook|N8N_RECOVERY|\/messages|senderKey|metaPayload|webhookUrl|secreto|phone_number_id|accessToken/);
});

test("30. public preview includes masked Meta payload and source", () => {
  assert.match(n8nPayload, /metaPayload: buildRecoveryWhatsappMetaTemplatePayloadPreview\(payload\.metaPayload, maskedTo\)/);
  assert.match(n8nPayload, /source: payload\.source/);
  assert.match(route, /n8nTransportPreview/);
});