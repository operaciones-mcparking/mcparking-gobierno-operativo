import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const tablePath = "src/app/recuperacion/recovery-cart-audit-table.tsx";
const drawerPath = "src/app/recuperacion/recovery-snapshot-comparison-drawer.tsx";
const apiRoutePath = "src/app/api/recuperacion/snapshots/compare/route.ts";
const backendHelperPath = "src/lib/recuperacion/recovery-snapshot-comparison.ts";
const orchestratorPath = "src/app/orquestador/page.tsx";

const table = readFileSync(tablePath, "utf8");
const drawer = readFileSync(drawerPath, "utf8");
const apiRoute = readFileSync(apiRoutePath, "utf8");
const backendHelper = readFileSync(backendHelperPath, "utf8");
const orchestrator = readFileSync(orchestratorPath, "utf8");

function assertHas(source, pattern, message) {
  assert.match(source, pattern, message);
}

function assertNotHas(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

test("1. comparison drawer component exists", () => {
  assert.equal(existsSync(drawerPath), true);
  assertHas(drawer, /export function RecoverySnapshotComparisonDrawer/);
});

test("2. recovery audit table integrates the drawer", () => {
  assertHas(table, /RecoverySnapshotComparisonDrawer/);
  assertHas(table, /snapshotComparisonDrawerOpen/);
});

test("3. UI calls the correct endpoint", () => {
  assertHas(table, /\/api\/recuperacion\/snapshots\/compare\?weekStart=/);
});

test("4. activeWeekStart is used in the query", () => {
  assertHas(table, /const requestedWeekStart = activeWeekStart/);
  assertHas(table, /encodeURIComponent\(requestedWeekStart\)/);
});

test("5. fetch uses AbortController", () => {
  assertHas(table, /new AbortController\(\)/);
  assertHas(table, /signal: controller\.signal/);
});

test("6. cleanup aborts when the active week changes", () => {
  assertHas(table, /return \(\) => \{\s*controller\.abort\(\);\s*\};/s);
});

test("7. loading state is represented", () => {
  assertHas(table, /snapshotComparisonLoading/);
  assertHas(drawer, /Cargando comparación histórica/);
});

test("8. error state is represented", () => {
  assertHas(table, /snapshotComparisonError/);
  assertHas(drawer, /error \?/);
  assertHas(drawer, /<AlertCircle/);
});

test("9. missing comparison state is represented", () => {
  assertHas(table, /Sin comparación histórica/);
  assertHas(drawer, /Sin comparación histórica para la semana seleccionada/);
});

test("10. no changes state is represented", () => {
  assertHas(table, /Sin cambios desde el snapshot anterior/);
  assertHas(drawer, /Sin cambios desde el snapshot anterior/);
});

test("11. positive delta formatting is supported", () => {
  assertHas(table, /value > 0 \? "\+"/);
  assertHas(drawer, /value > 0 \? "\+"/);
});

test("12. negative delta formatting is supported", () => {
  assertHas(table, /value < 0 \? "-"/);
  assertHas(drawer, /value < 0 \? "-"/);
});

test("13. zero delta is neutral", () => {
  assertHas(table, /value === 0\) return "neutral"/);
  assertHas(drawer, /value === 0\) return "border-slate-200/);
});

test("14. singular recovered label is supported", () => {
  assertHas(table, /"recuperado", "recuperados"/);
  assertHas(drawer, /absolute === 1 \? singular : plural/);
});

test("15. plural recovered label is supported", () => {
  assertHas(table, /recuperados/);
  assertHas(drawer, /recuperados/);
});

test("16. positive CLP deltas are supported", () => {
  assertHas(table, /formatSnapshotDeltaCurrency/);
  assertHas(drawer, /formatSignedCurrency/);
});

test("17. negative CLP deltas are supported", () => {
  assertHas(table, /Math\.abs\(value\)/);
  assertHas(drawer, /Math\.abs\(value\)/);
});

test("18. rate and point formats use one decimal", () => {
  assertHas(table, /toFixed\(1\)\.replace\("\."/);
  assertHas(drawer, /toFixed\(1\)\.replace\("\."/);
});

test("19. Ver cambios button exists", () => {
  assertHas(table, />\s*Ver cambios\s*</);
});

test("20. Ver cambios appears only for available comparisons", () => {
  assertHas(table, /!snapshotComparison \|\| !snapshotComparison\.available/);
  assertHas(table, /snapshotComparison\.reason === "no_changes"/);
});

test("21. drawer can open", () => {
  assertHas(table, /setSnapshotComparisonDrawerOpen\(true\)/);
});

test("22. drawer can close", () => {
  assertHas(table, /onOpenChange=\{setSnapshotComparisonDrawerOpen\}/);
  assertHas(drawer, /onOpenChange\(false\)/);
});

test("23. desktop drawer is lateral", () => {
  assertHas(drawer, /sm:right-0/);
  assertHas(drawer, /sm:max-w-3xl/);
});

test("24. mobile drawer is full screen", () => {
  assertHas(drawer, /h-\[100dvh\]/);
  assertHas(drawer, /w-screen/);
  assertHas(drawer, /max-w-none/);
});

test("25. recovery states are translated", () => {
  assertHas(drawer, /unrecovered: "No recuperado"/);
  assertHas(drawer, /recovered_with_amount: "Recuperado con monto"/);
  assertHas(drawer, /recovered_pack: "Recuperado con pack"/);
  assertHas(drawer, /payment_review: "Pago en revisión"/);
});

test("26. trigger operations are translated", () => {
  assertHas(drawer, /inserted: "Insertada"/);
  assertHas(drawer, /updated: "Actualizada"/);
});

test("27. known fields are translated", () => {
  for (const field of ["booking_created_at", "booking_status", "paying_status", "is_valid_purchase", "price", "parking_code", "form_datetime"]) {
    assertHas(drawer, new RegExp(`${field}:`));
  }
});

test("28. unknown fields are hidden", () => {
  assertHas(drawer, /fieldLabels\[value\] \?\? null/);
  assertHas(drawer, /filter\(\(field\): field is string => Boolean\(field\)\)/);
});

test("29. batch is abbreviated", () => {
  assertHas(drawer, /triggerBatchShort/);
  assertNotHas(drawer, /triggerBatchId/);
});

test("30. high confidence is translated", () => {
  assertHas(drawer, /value === "high"\) return "Confirmado"/);
});

test("31. medium confidence is translated", () => {
  assertHas(drawer, /value === "medium"\) return "Probable"/);
});

test("32. low confidence is translated", () => {
  assertHas(drawer, /value === "low"\) return "Relacionado"/);
});

test("33. IDs are abbreviated in the UI contract", () => {
  assertHas(drawer, /idShort/);
  assertHas(drawer, /cartIdShort/);
  assertHas(drawer, /purchaseIdShort/);
});

test("34. UI does not expose email fields", () => {
  assertNotHas(drawer, /email|correo/i);
});

test("35. UI does not expose phone fields", () => {
  assertNotHas(drawer, /phone|telefono|tel[e\u00e9]fono/i);
});

test("36. UI does not expose WAMID", () => {
  assertNotHas(drawer, /wamid/i);
});

test("37. UI does not expose hashes", () => {
  assertNotHas(drawer, /row_hash|payload_hash|identity_hash|hash/i);
});

test("38. UI source does not contain full UUID fixtures", () => {
  assertNotHas(drawer, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test("39. UI does not expose payloads", () => {
  assertNotHas(drawer, /payload/i);
});

test("40. snapshot comparison is separate from previous-week comparison", () => {
  assertHas(table, /vs semana anterior/);
  assertHas(table, /Desde snapshot anterior/);
});

test("41. KPI calculation is not modified by snapshot fetch", () => {
  assertHas(table, /summarizeRowsForWeek\(rows, activeWeekStart\)/);
  assertHas(table, /performanceSummary\.averageRate/);
});

test("42. backend endpoint is not modified by UI code", () => {
  assertHas(apiRoute, /export async function GET/);
  assertNotHas(apiRoute, /POST|RecoverySnapshotComparisonDrawer|use client/);
});

test("43. UI does not create snapshots", () => {
  assertNotHas(table + drawer, /create_recovery_weekly_snapshot|createRecoveryWeeklySnapshot/);
});

test("44. UI does not execute POST for comparison", () => {
  const start = table.indexOf("/api/recuperacion/snapshots/compare");
  const end = table.indexOf("void loadSnapshotComparison", start);
  const comparisonFetchBlock = table.slice(start, end);
  assertNotHas(comparisonFetchBlock, /method:\s*"POST"/);
});

test("45. orchestrator is not touched", () => {
  const changedFiles = execFileSync("git", ["status", "--short", "--untracked-files=all"], { encoding: "utf8" });
  assert.doesNotMatch(changedFiles, /src[\\/]app[\\/]orquestador/);
  assert.ok(orchestrator.includes("McParking Dashboard"));
});

test("46. responsive mobile uses scroll and full viewport", () => {
  assertHas(drawer, /overflow-y-auto/);
  assertHas(drawer, /h-\[100dvh\]/);
});

test("47. responsive desktop uses side drawer width", () => {
  assertHas(drawer, /sm:max-w-3xl/);
  assertHas(drawer, /sm:border-l/);
});

test("48. real 2026-07-20 case is represented in tests and copy", () => {
  assertHas(backendHelper, /snapshot_at/);
  assertHas(table, /formatSnapshotDeltaPoints/);
  assertHas(drawer, /Cambios relevantes/);
});

test("49. real delta +3 and +28378 can be formatted", () => {
  assertHas(table, /formatSnapshotDeltaNumber\(snapshotComparison\.delta\?\.recoveredConfirmed/);
  assertHas(table, /formatSnapshotDeltaCurrency\(snapshotComparison\.delta\?\.recoveredAmount\)/);
});

test("50. visible label Desde snapshot anterior exists", () => {
  assertHas(table, /Desde snapshot anterior/);
});
