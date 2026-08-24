import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routePath = "src/app/api/recuperacion/carritos/[id]/chat/send-template/route.ts";
const drawerPath = "src/app/recuperacion/recovery-cart-chat-drawer.tsx";
const metaPayloadPath = "src/lib/recuperacion/whatsapp-template-send-payload.ts";
const route = readFileSync(routePath, "utf8");
const drawer = readFileSync(drawerPath, "utf8");
const metaPayload = readFileSync(metaPayloadPath, "utf8");

function blockBetween(start, end) {
  const startIndex = route.indexOf(start);
  const endIndex = route.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `Missing start marker ${start}`);
  assert.notEqual(endIndex, -1, `Missing end marker ${end}`);

  return route.slice(startIndex, endIndex);
}

test("1. method POST exists and no other handler is exported", () => {
  assert.match(route, /export async function POST\(request: NextRequest, context: RouteContext\)/);
  assert.doesNotMatch(route, /export async function GET|export async function PUT|export async function PATCH|export async function DELETE/);
});

test("2. requires auth and active admin", () => {
  assert.match(route, /async function requireAdminForApi\(\)/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /from\("user_profiles"\)/);
  assert.match(route, /profile\.app_role !== "admin"/);
  assert.match(route, /profile\.status !== "active"/);
  assert.match(route, /auth_required/);
  assert.match(route, /forbidden/);
});

test("3. invalid UUID returns 400", () => {
  assert.match(route, /const UUID_RE =/);
  assert.match(route, /!UUID_RE\.test\(cartId\)/);
  assert.match(route, /invalid_cart_id/);
});

test("4. missing cart returns 404", () => {
  assert.match(route, /\.from\("recovery_incomplete_bookings_import"\)/);
  assert.match(route, /\.maybeSingle\(\)/);
  assert.match(route, /cart_not_found/);
});

test("5. cart without normalized phone returns 409", () => {
  assert.match(route, /!cartResult\.cart\.phone_normalized/);
  assert.match(route, /business_key_unverifiable/);
});

test("6. unverifiable business key returns 409", () => {
  assert.match(route, /getWhatsappFreeformWindowForCart\(admin\.supabase, cartResult\.cart\.id\)/);
  assert.match(route, /windowState\.status === "unverifiable"/);
  assert.match(route, /!isSupportedBusinessKey\(windowState\.businessKey\)/);
});

test("7. MPV cannot use EAP templates because Meta is queried by resolved business", () => {
  assert.match(route, /const businessKey = windowState\.businessKey/);
  assert.match(route, /fetchMetaWhatsappTemplatesForBusiness\(businessKey\)/);
  assert.doesNotMatch(route, /payload\.businessKey|payload\.parking|parking_code.*template/i);
});

test("8. EAP cannot use MPV templates because client businessKey is ignored", () => {
  assert.match(route, /isSupportedBusinessKey\(value: unknown\): value is RecoveryWhatsappBusinessKey/);
  assert.doesNotMatch(route, /businessKey\?: unknown|phone_number_id\?: unknown/);
  assert.doesNotMatch(route, /payload\.businessKey|payload\.phone_number_id/);
});

test("9. missing template is blocked", () => {
  assert.match(route, /function findTemplate/);
  assert.match(route, /template\.key === templateKey \|\| template\.name === templateKey/);
  assert.match(route, /template_not_allowed/);
});

test("10. non approved template is blocked", () => {
  assert.match(route, /template\.status !== "APPROVED"/);
  assert.match(route, /template_not_approved/);
});

test("11. mismatched language is blocked", () => {
  assert.match(route, /template\.language === language/);
  assert.match(route, /const language = safeString\(payload\.language\)/);
});

test("12. missing variable is blocked", () => {
  assert.match(route, /Faltan variables obligatorias/);
  assert.match(route, /missing_variable/);
});

test("13. empty variable is blocked", () => {
  assert.match(route, /const text = rawValue\.trim\(\)/);
  assert.match(route, /if \(!text\)/);
});

test("14. spaces-only variable is blocked", () => {
  assert.match(route, /rawValue\.trim\(\)/);
  assert.match(route, /Todas las variables son obligatorias/);
});

test("15. extra variable is blocked", () => {
  assert.match(route, /expectedPositions\.includes\(position\)/);
  assert.match(route, /unknown_variable/);
});

test("16. variable over 500 chars is blocked", () => {
  assert.match(route, /MAX_TEMPLATE_VARIABLE_LENGTH = 500/);
  assert.match(route, /text\.length > MAX_TEMPLATE_VARIABLE_LENGTH/);
  assert.match(route, /variable_too_long/);
});

test("17. variables are ordered by numeric position", () => {
  assert.match(route, /sort\(\(left, right\) => left - right\)/);
  assert.match(route, /expectedPositions\.map\(\(position\) => \(\{ position, text:/);
});

test("18. BODY components are built server-side", () => {
  assert.match(route, /buildRecoveryWhatsappMetaTemplatePayload/);
  assert.match(route, /variables: variablesResult\.variables/);
  assert.match(metaPayload, /type: "body"/);
  assert.match(metaPayload, /type: "text"/);
});

test("19. template without variables omits components", () => {
  assert.match(metaPayload, /if \(orderedVariables\.length > 0\)/);
  assert.match(route, /Esta plantilla no acepta variables/);
});

test("20. preview final replaces placeholders", () => {
  assert.match(route, /function renderPreviewText/);
  assert.match(route, /value\.replace\(\/\\\{\\\{\\s\*\(\\d\+\)\\s\*\\\}\\\}\//);
  assert.match(route, /previewBody = renderPreviewText\(template\.preview\.body, variablesResult\.variables\)/);
});

test("21. client components are rejected as an unknown payload field", () => {
  assert.doesNotMatch(route, /payload\.components|components\?: unknown/);
  assert.match(route, /hasOnlyAllowedPayloadKeys\(payload\)/);
  assert.match(route, /buildRecoveryWhatsappMetaTemplatePayload/);
  assert.match(route, /variables: variablesResult\.variables/);
});

test("22. client businessKey is rejected as an unknown payload field", () => {
  assert.doesNotMatch(route, /payload\.businessKey|businessKey\?: unknown/);
  assert.match(route, /hasOnlyAllowedPayloadKeys\(payload\)/);
  assert.match(route, /unknown_payload_field/);
  assert.match(route, /businessKey = windowState\.businessKey/);
});

test("23. client phone_number_id is rejected as an unknown payload field", () => {
  assert.doesNotMatch(route, /payload\.phone_number_id|phone_number_id\?: unknown/);
  assert.match(route, /"phone_number_id"/);
  assert.match(route, /hasOnlyAllowedPayloadKeys\(payload\)/);
});

test("24. dry-run route path does not expose n8n configuration", () => {
  assert.doesNotMatch(route, /N8N_RECOVERY|callN8nWebhook|x-mcparking-recovery-secret/);
  assert.match(route, /"webhookUrl"/);
});

test("25. dry-run returns before outbound persistence", () => {
  assert.match(route, /recovery_whatsapp_live_messages/);
  assert.ok(route.indexOf("if (payload.dryRun)") < route.indexOf('.from("recovery_whatsapp_live_messages")'));
});

test("26. real send persists and updates only the live outbound", () => {
  assert.match(route, /\.from\("recovery_whatsapp_live_messages"\)/);
  assert.match(route, /\.insert\(\{/);
  assert.match(route, /whatsapp_status: "pending"/);
  assert.match(route, /whatsapp_message_id: n8nResult\.messageId/);
  assert.doesNotMatch(route, /\.upsert\(|\.delete\(/);
});

test("27. route does not send Meta messages", () => {
  assert.doesNotMatch(route, /\/messages|messages\?access_token|whatsappMessageId/);
  assert.match(route, /fetchMetaWhatsappTemplatesForBusiness\(businessKey\)/);
});

test("28. route does not expose token", () => {
  assert.doesNotMatch(route, /META_WHATSAPP_ACCESS_TOKEN|Authorization|Bearer|access_token/);
});

test("29. route does not expose phone_number_id", () => {
  assert.doesNotMatch(route, /META_WHATSAPP_PHONE_NUMBER_ID|payload\.phone_number_id|phone_number_id\?: unknown/);
  assert.match(route, /"phone_number_id"/);
  assert.match(route, /maskedPhone: maskPhone/);
});

test("30. response supports dryRun true and dryRun false safely", () => {
  assert.match(route, /dryRun: true/);
  assert.match(route, /dryRun: false/);
  assert.match(route, /typeof payload\.dryRun !== "boolean"/);
  assert.match(route, /dry_run_required/);
});

test("31. drawer calls send-template only in dry-run mode", () => {
  const validateFunction = drawer.slice(drawer.indexOf("async function validateSelectedTemplate"), drawer.indexOf("return (", drawer.indexOf("async function validateSelectedTemplate")));

  assert.ok(validateFunction.includes('/chat/send-template'));
  assert.match(validateFunction, /dryRun: true/);
  assert.match(validateFunction, /method: "POST"/);
  assert.doesNotMatch(validateFunction, /businessKey|phone_number_id|components|previewText|templateName|token/);
});

test("32. template action is gated by complete variables and current preparation", () => {
  const templatePopup = drawer.slice(drawer.indexOf("{selectedTemplate && displayedTemplatePreview"), drawer.indexOf("<RecoveryWhatsappTemplateLibraryModal"));

  assert.ok(drawer.includes("canValidateTemplate = Boolean(cartId)"));
  assert.ok(drawer.includes("selectedTemplateVariableErrors.length === 0"));
  assert.ok(drawer.includes("canRunTemplateAction = isTemplatePrepared ? canConfirmTemplateSend : canValidateTemplate"));
  assert.ok(templatePopup.includes("disabled={!canRunTemplateAction}"));
  assert.ok(templatePopup.includes("isTemplatePrepared ? sendPreparedTemplate() : validateSelectedTemplate()"));
});

test("33. request DTO is intentionally narrow", () => {
  const dtoBlock = blockBetween("type SendTemplateDryRunRequest", "type TemplateVariableValue");

  assert.match(dtoBlock, /dryRun\?: unknown/);
  assert.match(dtoBlock, /language\?: unknown/);
  assert.match(dtoBlock, /templateKey\?: unknown/);
  assert.match(dtoBlock, /variables\?: unknown/);
  assert.doesNotMatch(dtoBlock, /businessKey|phone|phone_number_id|components|previewText|templateName/);
});

test("34. unknown request fields are blocked before validation", () => {
  assert.match(route, /function hasOnlyAllowedPayloadKeys/);
  assert.match(route, /ALLOWED_DRY_RUN_PAYLOAD_KEYS = new Set\(\["dryRun", "language", "templateKey", "variables"\]\)/);
  assert.match(route, /FORBIDDEN_DRY_RUN_PAYLOAD_KEYS/);
  assert.match(route, /unknown_payload_field/);
});
