import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261013130000_add_recovery_whatsapp_template_media_config.sql", "utf8");
const configRoute = readFileSync("src/app/api/recuperacion/carritos/[id]/chat/templates/media-config/route.ts", "utf8");
const templatesRoute = readFileSync("src/app/api/recuperacion/carritos/[id]/chat/templates/route.ts", "utf8");
const validateRoute = readFileSync("src/app/api/recuperacion/carritos/[id]/chat/templates/media/validate/route.ts", "utf8");
const libraryRoute = readFileSync("src/app/api/recuperacion/carritos/[id]/chat/templates/media-library/route.ts", "utf8");
const previewRoute = readFileSync("src/app/api/recuperacion/carritos/[id]/chat/templates/media-library/[fileId]/preview/route.ts", "utf8");
const modal = readFileSync("src/app/recuperacion/recovery-whatsapp-template-library-modal.tsx", "utf8");

test("1. media config migration creates an admin-scoped persistent table only", () => {
  assert.match(migration, /create table if not exists public\.recovery_whatsapp_template_media_config/);
  assert.match(migration, /primary key \(business_key, template_name, language, component_type\)/);
  assert.match(migration, /business_key text not null check \(business_key in \('MPV', 'EAP'\)\)/);
  assert.match(migration, /media_source text not null check \(media_source in \('google_drive', 'https_url', 'meta_media_id'\)\)/);
  assert.match(migration, /alter table public\.recovery_whatsapp_template_media_config enable row level security/);
  assert.match(migration, /revoke all on table public\.recovery_whatsapp_template_media_config from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert, update, delete on table public\.recovery_whatsapp_template_media_config to authenticated, service_role/);
  assert.match(migration, /using \(public\.is_app_admin\(\)\)/);
  assert.doesNotMatch(migration, /insert into|update\s+public\.|delete from|truncate|drop table/i);
});

test("2. saving media is server-side, scoped by cart business, and idempotent", () => {
  assert.match(configRoute, /export async function POST\(request: NextRequest, context: RouteContext\)/);
  assert.match(configRoute, /createSupabaseAuthServerClient/);
  assert.match(configRoute, /profile\.app_role !== "admin" \|\| profile\.status !== "active"/);
  assert.match(configRoute, /resolveRecoveryCommercialParking/);
  assert.match(configRoute, /getWhatsappFreeformWindowForCart/);
  assert.match(configRoute, /fetchMetaWhatsappTemplatesForBusiness\(business\.businessKey\)/);
  assert.match(configRoute, /validateRecoveryWhatsappTemplateMediaSelection\(parsed\.media, expectedFormat\)/);
  assert.match(configRoute, /\.from\("recovery_whatsapp_template_media_config"\)[\s\S]*\.upsert\(/);
  assert.match(configRoute, /onConflict: "business_key,template_name,language,component_type"/);
  assert.doesNotMatch(configRoute, /N8N_RECOVERY|webhook|send-template|fetch\([^)]*whatsapp|messageText/);
});

test("3. persisted media is loaded for templates without browser storage", () => {
  assert.match(templatesRoute, /\.from\("recovery_whatsapp_template_media_config"\)/);
  assert.match(templatesRoute, /\.eq\("business_key", businessKey\)/);
  assert.match(templatesRoute, /mediaSelection: validSavedMedia/);
  assert.match(templatesRoute, /compatibility: validSavedMedia && template\.compatibility\.status === "blocked"/);
  assert.match(modal, /saveMediaSelection/);
  assert.doesNotMatch(modal, /localStorage|sessionStorage/);
});

test("4. Drive preview uses an authenticated proxy while send media remains the validated URL", () => {
  assert.match(libraryRoute, /previewUrl: `\/api\/recuperacion\/carritos\/\$\{encodeURIComponent\(cartId\)\}\/chat\/templates\/media-library\/\$\{encodeURIComponent\(item\.driveFileId\)\}\/preview`/);
  assert.match(previewRoute, /requireAdminForApi/);
  assert.match(previewRoute, /fetchRecoveryWhatsappTemplateDrivePreview/);
  assert.match(previewRoute, /"Cache-Control": "private, max-age=300"/);
  assert.match(validateRoute, /previewUrl/);
  assert.match(configRoute, /previewUrl/);
  assert.match(modal, /mediaSelection\.previewUrl \?\? mediaSelection\.link/);
});

test("5. invalid or unsupported media remains fail-closed before sending", () => {
  assert.match(validateRoute, /validateRecoveryWhatsappTemplateMediaSelection/);
  assert.match(configRoute, /template_media_not_required/);
  assert.match(configRoute, /template_not_available/);
  assert.match(configRoute, /unknown_payload_field/);
  assert.match(configRoute, /validation\.ok/);
  assert.doesNotMatch(configRoute, /media_id: crypto|wamid|sent/);
});
