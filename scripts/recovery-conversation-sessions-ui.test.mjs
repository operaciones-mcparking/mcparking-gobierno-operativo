import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("src/app/recuperacion/page.tsx", "utf8");
const tabs = readFileSync("src/app/recuperacion/recovery-view-tabs.tsx", "utf8");
const conversations = readFileSync("src/app/recuperacion/recovery-conversation-sessions.tsx", "utf8");

function assertContains(source, value) {
  assert.ok(source.includes(value), `Missing ${value}`);
}

test("1. Carritos perdidos es la vista por defecto", () => {
  assert.match(page, /return requestedView === "conversaciones" \? "conversaciones" : "carritos"/);
  assertContains(tabs, '{ label: "Carritos perdidos", value: "carritos" }');
});

test("2. tabs permite cambiar a Conversaciones y conserva la vista en URL", () => {
  assertContains(tabs, 'router.replace(href, { scroll: false })');
  assertContains(tabs, '"/recuperacion?view=conversaciones"');
  assertContains(tabs, 'role="tablist"');
  assertContains(tabs, 'aria-selected={isActive}');
});

test("3. Conversaciones usa solamente el endpoint paginado", () => {
  assert.match(conversations, /fetch\(\s*`\/api\/recuperacion\/conversaciones\/sesiones\?page=\$\{page\}&pageSize=\$\{PAGE_SIZE\}`/);
  assertContains(conversations, "const PAGE_SIZE = 50");
  assert.doesNotMatch(conversations, /supabase|\.rpc\(|sessionize|message_text/i);
});

test("4. renderiza el total entregado por el endpoint", () => {
  assertContains(conversations, "Total de interacciones");
  assertContains(conversations, 'total.toLocaleString("es-CL")');
});

test("5. renderiza las marcas MCP y EAP sin calcular totales globales", () => {
  assertContains(conversations, 'brand: "MCP" | "EAP"');
  assertContains(conversations, "<SessionBrand brand={session.brand} />");
  assert.doesNotMatch(conversations, /mcpTotal|eapTotal/);
});

test("6. humaniza primary intent sin alterar el valor backend", () => {
  for (const label of ["Ubicacion y transporte", "Cotizar reserva", "Problema operativo", "Packs", "IA / automatico"]) {
    assertContains(conversations, label);
  }
  assertContains(conversations, "formatConversationIntent(session.primaryIntent)");
});

test("7. representa compra previa objetivamente", () => {
  assertContains(conversations, 'if (hasBefore) return "Compra previa"');
});

test("8. representa compra posterior y su distancia", () => {
  assertContains(conversations, 'if (hasAfter) return "Compra posterior"');
  assertContains(conversations, "formatPurchaseAfter(session.nearestPurchaseAfterMinutes)");
  assertContains(conversations, "min despues");
  assertContains(conversations, "h despues");
  assertContains(conversations, "dias despues");
});

test("9. representa compras previa y posterior juntas", () => {
  assertContains(conversations, 'if (hasBefore && hasAfter) return "Previa + posterior"');
});

test("10. representa ausencia de compra sin inferir causalidad", () => {
  assertContains(conversations, 'return "Sin compra identificada"');
});

test("11. muestra relacion potencial con carrito como Relacionado", () => {
  assert.match(conversations, /session\.potentialCartRelation \? [\s\S]*Relacionado/);
  assert.doesNotMatch(conversations, /Carrito recuperado/);
});

test("12. no presenta purchase-after como conversion", () => {
  assert.doesNotMatch(conversations, /Conversi[oó]n|Recuperado|Venta atribuida|No compr[oó]/i);
});

test("13. no muestra texto crudo ni telefono", () => {
  assert.doesNotMatch(conversations, /message_text|messageText|waIdNormalized|email/i);
});

test("14. paginacion usa Anterior y Siguiente con limites reales", () => {
  assertContains(conversations, "Anterior");
  assertContains(conversations, "Siguiente");
  assertContains(conversations, "disabled={page === 1}");
  assertContains(conversations, "disabled={page >= totalPages}");
  assertContains(conversations, "Math.ceil(total / PAGE_SIZE)");
});

test("15. una pagina vacia conserva total y muestra empty state", () => {
  assertContains(conversations, "const total = result?.total ?? 0");
  assertContains(conversations, "No se encontraron interacciones para los filtros seleccionados.");
  assert.match(conversations, /!loading && !error && sessions\.length === 0/);
});

test("16. un error HTTP no se convierte en lista vacia", () => {
  assertContains(conversations, 'if (!response.ok) throw new Error("No fue posible cargar las conversaciones.")');
  assert.match(conversations, /role="alert"/);
  assert.match(conversations, /!loading && error/);
});

test("17. mobile usa cards y desktop conserva tabla documental", () => {
  assertContains(conversations, 'className="mt-5 space-y-3 md:hidden"');
  assertContains(conversations, 'className="mt-5 hidden overflow-x-auto md:block"');
  assertContains(conversations, "break-words");
});

test("18. Carritos perdidos conserva sus bloques existentes sin reescritura", () => {
  for (const component of [
    "RecoveryCartAuditBlock",
    "RecoveryAdminDataAccordion",
    "RecoveryLatestImportsBlock",
    "PurchasesUploadMock",
    "IncompleteBookingsUploadMock",
    "TrackingUploadCard",
    "MessageMemoryUploadCard",
    "RecoveryImportHistoryBlock",
  ]) {
    assertContains(page, `<${component}`);
  }
  assert.match(page, /activeView === "conversaciones"[\s\S]*<RecoveryConversationSessions \/>[\s\S]*RecoveryCartAuditBlock/);
});
