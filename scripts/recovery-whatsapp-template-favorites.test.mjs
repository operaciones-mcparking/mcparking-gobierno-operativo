import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalPath = "src/app/recuperacion/recovery-whatsapp-template-library-modal.tsx";
const listRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/templates/route.ts";
const favoritesRoutePath = "src/app/api/recuperacion/carritos/[id]/chat/templates/favorites/route.ts";
const migrationPath = "supabase/migrations/20260824130000_add_recovery_whatsapp_template_favorites.sql";

const modal = readFileSync(modalPath, "utf8");
const listRoute = readFileSync(listRoutePath, "utf8");
const favoritesRoute = readFileSync(favoritesRoutePath, "utf8");
const migration = readFileSync(migrationPath, "utf8");

test("1. favorites are stored by user business template and language", () => {
  assert.match(migration, /primary key \(user_id, business_key, template_name, language\)/);
  assert.match(migration, /references public\.user_profiles\(user_id\)[\s\S]*on delete cascade/);
  assert.match(migration, /check \(business_key in \('MPV', 'EAP'\)\)/);
  assert.match(favoritesRoute, /onConflict: "user_id,business_key,template_name,language"/);
});

test("2. RLS permits only active admins to read insert and delete their own favorites", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, delete[\s\S]*to authenticated/);
  assert.match(migration, /for select[\s\S]*auth\.uid\(\) = user_id[\s\S]*public\.is_app_admin\(\)/);
  assert.match(migration, /for insert[\s\S]*auth\.uid\(\) = user_id[\s\S]*public\.is_app_admin\(\)/);
  assert.match(migration, /for delete[\s\S]*auth\.uid\(\) = user_id[\s\S]*public\.is_app_admin\(\)/);
  assert.doesNotMatch(migration, /for update|grant update/);
});

test("3. list endpoint derives user and business and exposes only isFavorite", () => {
  assert.match(listRoute, /userId: user\.id/);
  assert.match(listRoute, /\.eq\("user_id", admin\.userId\)/);
  assert.match(listRoute, /\.eq\("business_key", businessKey\)/);
  assert.match(listRoute, /isFavorite: favoriteKeys\.has\(template\.key\)/);
  assert.doesNotMatch(listRoute, /user_id:\s*favorite|created_at:\s*favorite/);
});

test("4. favorite mutation accepts only template identity and derives ownership", () => {
  assert.match(favoritesRoute, /ALLOWED_PAYLOAD_KEYS = new Set\(\["language", "template_name"\]\)/);
  assert.match(favoritesRoute, /profile\.app_role !== "admin" \|\| profile\.status !== "active"/);
  assert.match(favoritesRoute, /getWhatsappFreeformWindowForCart\(supabase, cart\.id\)/);
  assert.doesNotMatch(favoritesRoute, /payload\.user|payload\.business|payload\.business_key/);
});

test("5. POST validates an approved template while DELETE remains independent from Meta", () => {
  const postBody = favoritesRoute.slice(favoritesRoute.indexOf("export async function POST"), favoritesRoute.indexOf("export async function DELETE"));
  const deleteBody = favoritesRoute.slice(favoritesRoute.indexOf("export async function DELETE"));
  assert.match(postBody, /fetchMetaWhatsappTemplatesForBusiness\(resolved\.businessKey\)/);
  assert.match(postBody, /template\.status === "APPROVED"/);
  assert.match(postBody, /\.upsert\(/);
  assert.match(deleteBody, /\.delete\(\)/);
  assert.doesNotMatch(deleteBody, /fetchMetaWhatsappTemplatesForBusiness/);
});

test("6. library opens on Favorites and shows count and empty-state escape hatch", () => {
  assert.match(modal, /useState\(FAVORITE_CATEGORY\)/);
  assert.match(modal, /setCategoryFilter\(FAVORITE_CATEGORY\)/);
  assert.match(modal, /templates\.filter\(\(template\) => template\.isFavorite\)\.length/);
  assert.match(modal, /Aún no tienes plantillas favoritas\./);
  assert.match(modal, /Ver todas las plantillas/);
});

test("7. star is a sibling action and favorites remain compatible with filters", () => {
  assert.match(modal, /<article[\s\S]*<button[\s\S]*aria-pressed=\{isSelected\}[\s\S]*<\/button>[\s\S]*aria-label=\{favoriteLabel/);
  assert.match(modal, /<Star[\s\S]*fill=\{template\.isFavorite \? "currentColor" : "none"\}/);
  assert.match(modal, /matchesCategory[\s\S]*matchesLanguage[\s\S]*matchesSearch/);
});

test("8. optimistic add and remove roll back on failure", () => {
  assert.match(modal, /async function addFavorite[\s\S]*isFavorite: true[\s\S]*method: "POST"[\s\S]*catch \{[\s\S]*isFavorite: false/);
  assert.match(modal, /async function removeFavorite[\s\S]*isFavorite: false[\s\S]*method: "DELETE"[\s\S]*catch \{[\s\S]*isFavorite: true/);
  assert.match(modal, /pendingFavoriteKey/);
});

test("9. removing a favorite requires an accessible confirmation", () => {
  assert.match(modal, /¿Quitar esta plantilla de Favoritas\?/);
  assert.match(modal, /aria-modal="true"[\s\S]*role="dialog"/);
  assert.match(modal, /Cancelar/);
  assert.match(modal, /Quitar de favoritas/);
  assert.match(modal, /event\.key !== "Escape"[\s\S]*setFavoriteToRemove\(null\)/);
});