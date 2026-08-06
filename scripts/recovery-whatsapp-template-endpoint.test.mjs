import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const routePath = "src/app/api/recuperacion/carritos/[id]/chat/templates/route.ts";
const catalogPath = "src/lib/recuperacion/whatsapp-recovery-template-catalog.ts";
const metaPath = "src/lib/recuperacion/meta-whatsapp-templates.ts";
const windowHelperPath = "src/lib/recuperacion/whatsapp-freeform-window.ts";

const route = readFileSync(routePath, "utf8");
const catalog = readFileSync(catalogPath, "utf8");
const meta = readFileSync(metaPath, "utf8");
const windowHelper = readFileSync(windowHelperPath, "utf8");

function loadCatalogExports() {
  const module = { exports: {} };
  const output = ts.transpileModule(catalog, {
    compilerOptions: {
      esModuleInterop: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: catalogPath,
  }).outputText;

  vm.runInNewContext(output, {
    exports: module.exports,
    module,
    require(name) {
      if (name === "server-only") return {};
      throw new Error(`Unexpected require in endpoint test: ${name}`);
    },
  });

  return module.exports;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

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

test("4. MPV catalog allows only cp_generico", () => {
  const { getAllowedRecoveryTemplatesForBusiness, isRecoveryTemplateAllowed } = loadCatalogExports();
  const templates = plain(getAllowedRecoveryTemplatesForBusiness("MPV"));

  assert.deepEqual(templates.map((template) => template.metaName), ["cp_generico"]);
  assert.equal(isRecoveryTemplateAllowed("MPV", "cp_generico"), true);
  assert.equal(isRecoveryTemplateAllowed("MPV", "cp_generico_eap"), false);
});

test("5. EAP catalog allows only cp_generico_eap", () => {
  const { getAllowedRecoveryTemplatesForBusiness, isRecoveryTemplateAllowed } = loadCatalogExports();
  const templates = plain(getAllowedRecoveryTemplatesForBusiness("EAP"));

  assert.deepEqual(templates.map((template) => template.metaName), ["cp_generico_eap"]);
  assert.equal(isRecoveryTemplateAllowed("EAP", "cp_generico_eap"), true);
  assert.equal(isRecoveryTemplateAllowed("EAP", "cp_generico"), false);
});

test("6. endpoint applies Meta APPROVED templates through the allowed catalog", () => {
  assert.match(route, /fetchMetaWhatsappTemplatesForBusiness\(businessKey\)/);
  assert.match(route, /getAllowedRecoveryTemplatesForBusiness\(businessKey\)/);
  assert.match(route, /isRecoveryTemplateAllowed\(businessKey, template\.name\)/);
  assert.match(route, /allowedByMetaName\.get\(template\.name\)/);
  assert.match(route, /key: catalogTemplate\.key/);
  assert.match(route, /label: catalogTemplate\.label/);
  assert.match(route, /language: template\.language \|\| catalogTemplate\.language/);
  assert.match(route, /category: template\.category/);
  assert.match(meta, /status !== "APPROVED"/);
});

test("7. endpoint uses real conversation window resolution, not parking_code alone", () => {
  assert.match(route, /getWhatsappFreeformWindowForCart\(admin\.supabase, cartResult\.cart\.id\)/);
  assert.match(route, /windowState\.businessKey/);
  assert.match(route, /windowState\.status === "unverifiable"/);
  assert.doesNotMatch(route, /businessKeyForParking\(|parking_code\)\s*=>|const businessKey = cartResult\.cart\.parking_code/);
  assert.match(windowHelper, /resolveConversationBusinessKey/);
  assert.match(windowHelper, /api_phone_normalized/);
});

test("8. unverifiable business key is blocked", () => {
  assert.match(route, /!isSupportedBusinessKey\(windowState\.businessKey\)/);
  assert.match(route, /jsonError\("No fue posible verificar el negocio de la conversacion de WhatsApp\.", 409, "business_key_unverifiable"\)/);
});

test("9. DTO is safe and does not expose secrets or Meta internals", () => {
  assert.match(route, /business:\s*{[\s\S]*key: businessKey,[\s\S]*label: businessLabel\(businessKey\)/);
  assert.match(route, /templates,/);
  assert.doesNotMatch(route, /META_WHATSAPP_ACCESS_TOKEN|Authorization|Bearer|phone_number_id|PHONE_NUMBER_ID|WABA|payload|components|graph\.facebook\.com/);
  assert.doesNotMatch(route, /whatsapp_message_id|wamid|access_token|token/i);
});

test("10. Meta error is sanitized", () => {
  assert.match(route, /catch \{/);
  assert.match(route, /jsonError\("No se pudieron cargar templates de WhatsApp\.", 500, "meta_templates_unavailable"\)/);
  assert.doesNotMatch(route, /error\.message|JSON\.stringify\(error\)|debugDetails|debugMessage/);
});

test("11. endpoint does not call n8n or send messages", () => {
  assert.doesNotMatch(route, /N8N_RECOVERY|n8n|callN8nWebhook|messageText|send-template|\/chat\/send/);
  assert.doesNotMatch(route, /method:\s*"POST"|fetch\([^)]*webhook|whatsappMessageId/);
});

test("12. endpoint does not write Supabase", () => {
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.match(route, /\.from\("user_profiles"\)/);
  assert.match(route, /\.from\("recovery_incomplete_bookings_import"\)/);
});

test("13. endpoint returns the expected public DTO shape", () => {
  assert.match(route, /return NextResponse\.json\(\{[\s\S]*business:[\s\S]*ok: true,[\s\S]*templates,[\s\S]*\}\)/);
  assert.match(route, /key: catalogTemplate\.key/);
  assert.match(route, /label: catalogTemplate\.label/);
  assert.match(route, /language: template\.language \|\| catalogTemplate\.language/);
  assert.match(route, /category: template\.category/);
});