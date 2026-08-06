import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routePath = "src/app/api/recuperacion/carritos/[id]/chat/templates/route.ts";
const catalogPath = "src/lib/recuperacion/whatsapp-recovery-template-catalog.ts";
const metaPath = "src/lib/recuperacion/meta-whatsapp-templates.ts";
const windowHelperPath = "src/lib/recuperacion/whatsapp-freeform-window.ts";

const route = readFileSync(routePath, "utf8");
const catalog = readFileSync(catalogPath, "utf8");
const meta = readFileSync(metaPath, "utf8");
const windowHelper = readFileSync(windowHelperPath, "utf8");

test("1. endpoint is GET-only and requires active admin", () => {
  assert.match(route, /export async function GET\(_request: NextRequest, context: RouteContext\)/);
  assert.doesNotMatch(route, /export async function POST|export async function PUT|export async function PATCH|export async function DELETE/);
  assert.match(route, /createSupabaseAuthServerClient/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /\.from\("user_profiles"\)[\s\S]*\.select\("app_role,status"\)/);
  assert.match(route, /profile\.app_role !== "admin" \|\| profile\.status !== "active"/);
});

test("2. invalid admin paths return 401 or 403", () => {
  assert.match(route, /jsonError\("No autenticado\.", 401, "auth_required"\)/);
  assert.match(route, /jsonError\("No autorizado\.", 403, "forbidden"\)/);
});

test("3. missing cart returns 404", () => {
  assert.match(route, /\.from\("recovery_incomplete_bookings_import"\)[\s\S]*\.select\("id,phone_normalized,parking_code"\)[\s\S]*\.eq\("id", cartId\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(route, /jsonError\("Carrito no encontrado\.", 404, "cart_not_found"\)/);
});

test("4. endpoint uses real conversation window resolution, not parking_code alone", () => {
  assert.match(route, /getWhatsappFreeformWindowForCart\(admin\.supabase, cartResult\.cart\.id\)/);
  assert.match(route, /windowState\.businessKey/);
  assert.match(route, /windowState\.status === "unverifiable"/);
  assert.doesNotMatch(route, /businessKeyForParking\(|parking_code\)\s*=>|const businessKey = cartResult\.cart\.parking_code/);
  assert.match(windowHelper, /resolveConversationBusinessKey/);
  assert.match(windowHelper, /api_phone_normalized/);
});

test("5. unverifiable business key is blocked before Meta lookup", () => {
  assert.match(route, /!isSupportedBusinessKey\(windowState\.businessKey\)/);
  assert.match(route, /jsonError\("No fue posible verificar el negocio de la conversacion de WhatsApp\.", 409, "business_key_unverifiable"\)/);
  assert.ok(route.indexOf("business_key_unverifiable") < route.indexOf("fetchMetaWhatsappTemplatesForBusiness(businessKey)"));
});

test("6. endpoint returns all Meta APPROVED templates for the resolved business", () => {
  assert.match(route, /fetchMetaWhatsappTemplatesForBusiness\(businessKey\)/);
  assert.match(route, /\.map\(\(template\) => decorateRecoveryTemplateForBusiness\(businessKey, template\)\)/);
  assert.doesNotMatch(route, /\.filter\(\(template\) => isRecoveryTemplateAllowed|allowedByMetaName|getAllowedRecoveryTemplatesForBusiness\(businessKey\)/);
  assert.match(meta, /status !== "APPROVED"/);
  assert.match(meta, /fields", "name,language,status,category,components"/);
});

test("7. MPV and EAP remain separated by server-side business key", () => {
  assert.match(route, /const businessKey = windowState\.businessKey/);
  assert.match(route, /fetchMetaWhatsappTemplatesForBusiness\(businessKey\)/);
  assert.doesNotMatch(route, /fetchMetaWhatsappTemplatesForBusiness\("MPV"\)[\s\S]*fetchMetaWhatsappTemplatesForBusiness\("EAP"\)/);
  assert.doesNotMatch(route, /businessKey.*searchParams|businessKey.*request|payload\.businessKey|body\.businessKey/);
});

test("8. DTO is safe and includes normalized preview only", () => {
  assert.match(route, /business:\s*{[\s\S]*key: businessKey,[\s\S]*label: businessLabel\(businessKey\)/);
  assert.match(route, /preview: template\.preview/);
  assert.match(route, /variables: template\.variables/);
  assert.match(route, /status: template\.status/);
  assert.doesNotMatch(route, /META_WHATSAPP_ACCESS_TOKEN|Authorization|Bearer|phone_number_id|PHONE_NUMBER_ID|WABA|payload|graph\.facebook\.com/);
  assert.doesNotMatch(route, /components:|template\.components|whatsapp_message_id|wamid|access_token|token/i);
});

test("9. Meta error is sanitized", () => {
  assert.match(route, /catch \{/);
  assert.match(route, /jsonError\("No se pudieron cargar templates de WhatsApp\.", 500, "meta_templates_unavailable"\)/);
  assert.doesNotMatch(route, /error\.message|JSON\.stringify\(error\)|debugDetails|debugMessage/);
});

test("10. endpoint does not call n8n or send messages", () => {
  assert.doesNotMatch(route, /N8N_RECOVERY|n8n|callN8nWebhook|messageText|send-template|\/chat\/send/);
  assert.doesNotMatch(route, /method:\s*"POST"|fetch\([^)]*webhook|whatsappMessageId/);
});

test("11. endpoint does not write Supabase", () => {
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.match(route, /\.from\("user_profiles"\)/);
  assert.match(route, /\.from\("recovery_incomplete_bookings_import"\)/);
});

test("12. endpoint returns the expected public DTO shape", () => {
  assert.match(route, /return NextResponse\.json\(\{[\s\S]*business:[\s\S]*ok: true,[\s\S]*templates,[\s\S]*\}\)/);
  for (const field of ["key", "label", "language", "category", "name", "preview", "status", "variables"]) {
    assert.match(route, new RegExp(`${field}: template\\.${field}`));
  }
});

test("13. catalog is optional presentation and not an inventory allowlist", () => {
  assert.match(catalog, /RECOVERY_TEMPLATE_PRESENTATION/);
  assert.match(catalog, /decorateRecoveryTemplateForBusiness/);
  assert.doesNotMatch(catalog, /RECOVERY_TEMPLATE_CATALOG|enabled: false|\.filter\(\(template\) => template\.enabled\)/);
});
