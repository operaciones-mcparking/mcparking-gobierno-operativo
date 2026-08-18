import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const access = readFileSync("src/lib/auth/access.ts", "utf8");
const middleware = readFileSync("src/middleware.ts", "utf8");
const structurePage = readFileSync("src/app/estructura/page.tsx", "utf8");
const catalog = readFileSync("src/app/procesos/process-catalog-client.tsx", "utf8");
const detailModal = readFileSync("src/app/procesos/process-detail-modal.tsx", "utf8");
const detailRoute = readFileSync("src/app/api/estructura/procesos/[processId]/ficha/route.ts", "utf8");
const pdfRoute = readFileSync("src/app/api/procesos/[processId]/pdf/route.ts", "utf8");
const masterSheet = readFileSync("src/app/procesos/process-master/process-master-sheet.tsx", "utf8");

assert.ok(structurePage.includes("canViewProcessDetails={structureAccess.canAccessStructure}"));
assert.ok(catalog.includes("canViewProcessDetails ? <ProcessDetailModal"));
assert.ok(detailModal.includes('type="button"'));
assert.ok(detailModal.includes("Ver ficha"));
assert.ok(detailModal.includes('role="dialog"'));
assert.ok(detailModal.includes('aria-modal="true"'));
assert.ok(detailModal.includes('<ProcessMasterSheet mode="readonly" process={detail} />'));
assert.ok(masterSheet.includes('risk.risk_type === "opportunity" ? "Oportunidad:" : "Riesgo:"'));
assert.ok(!masterSheet.includes('<ValueBadge tone={risk.risk_type'));
assert.ok(detailModal.includes("/api/estructura/procesos/"));
assert.ok(detailModal.includes("process.process_id"));
assert.ok(detailModal.includes("/ficha"));
for (const forbidden of ["href=", "/editar", "Activar proceso", "Zona administrativa", "Eliminar definitivamente"]) {
  assert.ok(!detailModal.includes(forbidden));
}
assert.ok(detailModal.includes("fixed inset-0"));
assert.ok(detailModal.includes("h-full w-full"));
assert.ok(detailModal.includes("overflow-y-auto"));
assert.ok(detailModal.includes('aria-label="Cerrar ficha"'));
assert.ok(detailModal.includes('event.key === "Escape"'));

assert.ok(detailRoute.includes("createSupabaseAuthServerClient()"));
assert.ok(detailRoute.includes('profile.status !== "active"'));
assert.ok(detailRoute.includes("canUseStructurePermission(structurePermissions.view)"));
assert.ok(detailRoute.includes('return jsonError("No autorizado.", 403)'));
assert.ok(detailRoute.includes("getProcessMasterReadModel(processId)"));
assert.ok(detailRoute.includes('"Cache-Control": "private, no-store"'));
for (const forbidden of ["createSupabaseAdminClient", "SUPABASE_SERVICE_ROLE", ".insert(", ".update(", ".delete(", ".upsert("]) {
  assert.ok(!detailRoute.includes(forbidden));
}

assert.ok(middleware.includes("structureProcessDetailPath"));
assert.ok(middleware.includes('if (structureProcessDetailPath.test(pathname)) requiredPermission = "structure.view"'));
assert.ok(middleware.includes("if (!requiredPermission) return denied(request)"));
assert.ok(!middleware.includes('pathname.startsWith("/procesos")'));
assert.ok(access.includes("canNavigateProcesses: !isStructureRestricted"));

assert.ok(catalog.includes("canExportPdf ? <a"));
assert.ok(pdfRoute.includes("canUseStructurePermission(structurePermissions.exportPdf)"));
assert.ok(!detailRoute.includes("structurePermissions.exportPdf"));
assert.ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}/i.test(detailModal + detailRoute + middleware));

console.log("structure-editor-process-read: 41/41 OK");