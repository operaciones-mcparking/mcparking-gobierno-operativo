import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { normalizeCustomer360BoletaAnalytics } = await import("../src/lib/customer-window/customer-360-boleta-analytics-v1.ts");

const view = readFileSync(new URL("../src/app/orquestador/customer-window-view.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/orquestador/customer-window/360/analytics/route.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/lib/orquestador/supabase-admin.ts", import.meta.url), "utf8");

const locator = {
  authoritySnapshotId: null,
  customerUniverse: "GLOBAL",
  representationId: "11111111-1111-4111-8111-111111111111",
  representationKey: "confirmed_customer:11111111-1111-4111-8111-111111111111",
  representationType: "confirmed_customer",
};

function fixture() {
  return {
    activity: {
      boletaRepurchaseCount: 1, boletaReservationCount: 2, boletaReservations12m: 0, boletaReservations24m: 2,
      daysSinceLastBoletaPurchase: 0, firstBoletaPurchaseAt: "2026-09-27T12:00:00Z", gapIntervalCount: 0,
      lastBoletaPurchaseAt: "2026-09-27T12:00:00Z", medianBoletaGapDays: null, previousBoletaPurchaseAt: null,
      purchaseSpanDays: 0, repeatBoletaCustomer: false,
    },
    asOfDate: "2026-09-28", calculationVersion: "CUSTOMER_360_BOLETA_ANALYTICS_V1",
    computedAt: "2026-09-28T12:00:00Z", contractVersion: "CUSTOMER360_ANALYTICS_V1",
    dataQuality: {
      economicEligibleBoletaCount: 2, eligibleBoletaBookingCount: 2, excludedPackBookingCount: 14,
      invalidLeadTimeCount: 0, missingAmountCount: 0, missingDurationCount: 0, missingLeadTimeCount: 0,
      totalValidBookingCount: 16, warnings: ["LOW_SAMPLE_SIZE", "SEASONALITY_LOW_SAMPLE", "GAP_LOW_SAMPLE"],
    },
    locator, ok: true,
    pricing: {
      discountCodes: [], discountedBoletaCount: 0, discountUsagePct: 0, listAdr: null, listAdr12m: null,
      listAdr24m: null, paidAdr: null, paidAdr12m: null, paidAdr24m: null, totalDiscountAmount: 0,
      weightedDiscountPct: 0,
    },
    scope: "confirmed_customer_boleta",
    sources: {
      brandCounts: { MCP: 1 }, brandShares: { MCP: 1 }, counts: { MCP_EAP: 1, OKP: 0 },
      parkingCounts: { MCP: 1 }, parkingFamilyCounts: { MCP: 1 }, parkingShares: { MCP: 1 },
      preferredBrand: "MCP", preferredParking: "MCP", shares: { MCP_EAP: 1, OKP: 0 },
      topBrands: ["MCP"], topParkings: ["MCP"],
    },
    travelBehavior: {
      arrivalDayPattern: { sampleSize: 1, weekdayCount: 0, weekendCount: 1, weekendSharePct: 1 },
      arrivalMonthPattern: { activeMonthCount: 1, counts: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], distinctArrivalYears: 1, sampleSize: 1, shares: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], topMonths: [9] },
      bookingLeadDays: { average: 0, max: 0, median: 0, min: 0, sampleSize: 1 },
      stayDays: { average: null, max: null, median: null, min: null, sampleSize: 0, total: null },
    },
    value: { averageTicket: null, currency: null, listAmount: null, maxTicket: null, medianTicket: null, minTicket: null, paidAmount: null },
  };
}

test("normalizer preserves real zeroes and unavailable nulls", () => {
  const normalized = normalizeCustomer360BoletaAnalytics(fixture());
  assert.ok(normalized);
  assert.equal(normalized.activity.daysSinceLastBoletaPurchase, 0);
  assert.equal(normalized.pricing.discountUsagePct, 0);
  assert.equal(normalized.value.averageTicket, null);
  assert.equal(normalized.travelBehavior.stayDays.total, null);
});

test("analytics contract is confirmed-only and validates source shares and warnings", () => {
  assert.equal(normalizeCustomer360BoletaAnalytics({ ...fixture(), locator: { ...locator, representationType: "related_review" } }), null);
  assert.equal(normalizeCustomer360BoletaAnalytics({ ...fixture(), sources: { ...fixture().sources, shares: { MCP_EAP: "1" } } }), null);
  assert.equal(normalizeCustomer360BoletaAnalytics({ ...fixture(), dataQuality: { ...fixture().dataQuality, warnings: ["UNKNOWN"] } }), null);
});

test("analytics contract preserves a real zero PACK count", () => {
  const value = fixture();
  value.dataQuality = {
    ...value.dataQuality,
    totalValidBookingCount: 2,
    excludedPackBookingCount: 0,
  };
  const normalized = normalizeCustomer360BoletaAnalytics(value);
  assert.ok(normalized);
  assert.equal(normalized.dataQuality.totalValidBookingCount, 2);
  assert.equal(normalized.dataQuality.eligibleBoletaBookingCount, 2);
  assert.equal(normalized.dataQuality.excludedPackBookingCount, 0);
});

test("certified Claudia history keeps sixteen valid reservations split into two BOLETA and fourteen PACK", () => {
  const normalized = normalizeCustomer360BoletaAnalytics(fixture());
  assert.ok(normalized);
  assert.equal(normalized.activity.boletaReservationCount, 2);
  assert.equal(normalized.dataQuality.totalValidBookingCount, 16);
  assert.equal(normalized.dataQuality.eligibleBoletaBookingCount, 2);
  assert.equal(normalized.dataQuality.excludedPackBookingCount, 14);
});

test("confirmed tabs lazy-load analytics while related keeps identity", () => {
  const drawer = view.slice(view.indexOf("function Customer360Drawer"), view.indexOf("function RelatedReviewDrawer"));
  assert.match(drawer, /related \? \["summary", "history", "identity"\][\s\S]*\["summary", "history", "analytics"\]/);
  assert.match(drawer, /view === "analytics" \? void openCustomer360Analytics\(\)/);
  assert.match(drawer, /representation\.representationType !== "confirmed_customer"[\s\S]*return/);
  assert.equal((drawer.match(/customer-window\/360\/analytics/g) ?? []).length, 1);
  assert.match(drawer, /analyticsController\.current\?\.abort\(\)/);
  assert.match(drawer, /boleta_analytics_not_materialized/);
  assert.match(drawer, /Cargando analítica BOLETA/);
  assert.match(drawer, /No fue posible cargar la analítica BOLETA/);
});

test("compact panel renders activity value discounts behavior origin and quality", () => {
  const panel = view.slice(view.indexOf("function Customer360BoletaAnalyticsPanel"), view.indexOf("function Customer360Drawer"));
  for (const title of ["Actividad", "Valor", "Descuentos", "Comportamiento", "Origen", "Calidad"]) assert.match(panel, new RegExp(`title="${title}"`));
  for (const warning of ["LOW_SAMPLE_SIZE", "ECONOMICS_PARTIAL", "LEAD_TIME_PARTIAL", "SEASONALITY_LOW_SAMPLE", "GAP_LOW_SAMPLE"]) assert.match(view, new RegExp(warning));
  assert.match(panel, /Historial válido:[\s\S]*totalValidBookingCount[\s\S]*reservas[\s\S]*eligibleBoletaBookingCount[\s\S]*BOLETA[\s\S]*excludedPackBookingCount[\s\S]*PACK/);
  assert.match(panel, /label="Reservas BOLETA"/);
  assert.doesNotMatch(panel, /label="Reservas totales"/);
  assert.match(panel, /analytics\.sources\.shares\[source\] \?\? null/);
  assert.doesNotMatch(panel, /fetch\(|getJson\(|customer-window\/360\/analytics/);
  assert.doesNotMatch(panel, /Trayectoria comercial|migración/);
});

test("analytics endpoint is admin-only, no-store, confirmed-only and server-side", () => {
  assert.match(route, /getActiveAdminUser\(\)/);
  assert.match(route, /Cache-Control": "no-store"/);
  assert.match(route, /locator\.representationType !== "confirmed_customer"/);
  assert.match(admin, /customer_window_360_v1_get_boleta_analytics/);
  assert.doesNotMatch(view + route, /SUPABASE_SERVICE_ROLE_KEY|createClient\(|\.rpc\(/);
});
