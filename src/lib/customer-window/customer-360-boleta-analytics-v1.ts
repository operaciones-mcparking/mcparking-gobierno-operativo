import type { Customer360Locator } from "./customer-360-v1";

export type Customer360BoletaAnalyticsWarning =
  | "LOW_SAMPLE_SIZE"
  | "ECONOMICS_PARTIAL"
  | "LEAD_TIME_PARTIAL"
  | "SEASONALITY_LOW_SAMPLE"
  | "GAP_LOW_SAMPLE";

type NullableNumber = number | null;

export type Customer360BoletaAnalytics = {
  activity: {
    boletaRepurchaseCount: number;
    boletaReservationCount: number;
    boletaReservations12m: number;
    boletaReservations24m: number;
    daysSinceLastBoletaPurchase: NullableNumber;
    firstBoletaPurchaseAt: string | null;
    gapIntervalCount: number;
    lastBoletaPurchaseAt: string | null;
    medianBoletaGapDays: NullableNumber;
    previousBoletaPurchaseAt: string | null;
    purchaseSpanDays: NullableNumber;
    repeatBoletaCustomer: boolean;
  };
  asOfDate: string;
  calculationVersion: "CUSTOMER_360_BOLETA_ANALYTICS_V1";
  computedAt: string;
  contractVersion: "CUSTOMER360_ANALYTICS_V1";
  dataQuality: {
    economicEligibleBoletaCount: number;
    eligibleBoletaBookingCount: number;
    excludedPackBookingCount: number;
    invalidLeadTimeCount: number;
    missingAmountCount: number;
    missingDurationCount: number;
    missingLeadTimeCount: number;
    totalValidBookingCount: number;
    warnings: Customer360BoletaAnalyticsWarning[];
  };
  locator: Customer360Locator;
  ok: true;
  pricing: {
    discountCodes: Array<{ code: string; lastUsedAt: string | null; source: string; type: string; uses: number }>;
    discountedBoletaCount: number;
    discountUsagePct: NullableNumber;
    listAdr: NullableNumber;
    listAdr12m: NullableNumber;
    listAdr24m: NullableNumber;
    paidAdr: NullableNumber;
    paidAdr12m: NullableNumber;
    paidAdr24m: NullableNumber;
    totalDiscountAmount: NullableNumber;
    weightedDiscountPct: NullableNumber;
  };
  scope: "confirmed_customer_boleta";
  sources: {
    brandCounts: Record<string, number>;
    brandShares: Record<string, number>;
    counts: Record<string, number>;
    parkingCounts: Record<string, number>;
    parkingFamilyCounts: Record<string, number>;
    parkingShares: Record<string, number>;
    preferredBrand: string | null;
    preferredParking: string | null;
    shares: Record<string, number>;
    topBrands: string[];
    topParkings: string[];
  };
  travelBehavior: {
    arrivalDayPattern: { sampleSize: number; weekdayCount: number; weekendCount: number; weekendSharePct: NullableNumber };
    arrivalMonthPattern: {
      activeMonthCount: number;
      counts: number[];
      distinctArrivalYears: number;
      sampleSize: number;
      shares: Array<number | null>;
      topMonths: number[];
    };
    bookingLeadDays: { average: NullableNumber; max: NullableNumber; median: NullableNumber; min: NullableNumber; sampleSize: number };
    stayDays: { average: NullableNumber; max: NullableNumber; median: NullableNumber; min: NullableNumber; sampleSize: number; total: NullableNumber };
  };
  value: {
    averageTicket: NullableNumber;
    currency: "CLP" | null;
    listAmount: NullableNumber;
    maxTicket: NullableNumber;
    medianTicket: NullableNumber;
    minTicket: NullableNumber;
    paidAmount: NullableNumber;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeConfirmedLocator(value: unknown): Customer360Locator | null {
  if (!isRecord(value) || value.representationType !== "confirmed_customer"
    || value.customerUniverse !== "GLOBAL" || value.authoritySnapshotId !== null
    || typeof value.representationId !== "string" || !uuidPattern.test(value.representationId)
    || value.representationKey !== `confirmed_customer:${value.representationId}`) return null;
  return value as Customer360Locator;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNullableNumber(value: unknown): value is NullableNumber {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

function isNumberRecord(value: unknown) {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0);
}

function hasNullableMetrics(value: Record<string, unknown>, keys: string[]) {
  return keys.every((key) => isNullableNumber(value[key]));
}

export function normalizeCustomer360BoletaAnalytics(value: unknown): Customer360BoletaAnalytics | null {
  if (!isRecord(value) || value.ok !== true || value.contractVersion !== "CUSTOMER360_ANALYTICS_V1"
    || value.scope !== "confirmed_customer_boleta" || value.calculationVersion !== "CUSTOMER_360_BOLETA_ANALYTICS_V1") return null;
  const locator = normalizeConfirmedLocator(value.locator);
  if (!locator || typeof value.asOfDate !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOfDate) || typeof value.computedAt !== "string"
    || !isTimestamp(value.computedAt)) return null;
  const activity = value.activity;
  const analyticsValue = value.value;
  const pricing = value.pricing;
  const travel = value.travelBehavior;
  const sources = value.sources;
  const quality = value.dataQuality;
  if (!isRecord(activity) || !isRecord(analyticsValue) || !isRecord(pricing)
    || !isRecord(travel) || !isRecord(sources) || !isRecord(quality)) return null;
  if (![activity.boletaReservationCount, activity.boletaReservations12m, activity.boletaReservations24m,
    activity.gapIntervalCount, activity.boletaRepurchaseCount].every(isCount)
    || ![activity.firstBoletaPurchaseAt, activity.lastBoletaPurchaseAt, activity.previousBoletaPurchaseAt].every(isTimestamp)
    || !hasNullableMetrics(activity, ["daysSinceLastBoletaPurchase", "medianBoletaGapDays", "purchaseSpanDays"])
    || typeof activity.repeatBoletaCustomer !== "boolean") return null;
  if ((analyticsValue.currency !== "CLP" && analyticsValue.currency !== null)
    || !hasNullableMetrics(analyticsValue, ["paidAmount", "listAmount", "averageTicket", "medianTicket", "minTicket", "maxTicket"])) return null;
  if (![pricing.discountedBoletaCount].every(isCount)
    || !hasNullableMetrics(pricing, ["paidAdr", "listAdr", "paidAdr12m", "listAdr12m", "paidAdr24m", "listAdr24m", "discountUsagePct", "totalDiscountAmount", "weightedDiscountPct"])
    || !Array.isArray(pricing.discountCodes) || !pricing.discountCodes.every((code) => isRecord(code)
      && typeof code.source === "string" && typeof code.type === "string" && typeof code.code === "string"
      && isCount(code.uses) && isTimestamp(code.lastUsedAt))) return null;
  if (!isRecord(travel.stayDays) || !isRecord(travel.bookingLeadDays) || !isRecord(travel.arrivalDayPattern)
    || !isRecord(travel.arrivalMonthPattern)) return null;
  if (!isCount(travel.stayDays.sampleSize) || !hasNullableMetrics(travel.stayDays, ["total", "average", "median", "min", "max"])
    || !isCount(travel.bookingLeadDays.sampleSize) || !hasNullableMetrics(travel.bookingLeadDays, ["average", "median", "min", "max"])
    || ![travel.arrivalDayPattern.weekdayCount, travel.arrivalDayPattern.weekendCount, travel.arrivalDayPattern.sampleSize].every(isCount)
    || !isNullableNumber(travel.arrivalDayPattern.weekendSharePct)) return null;
  const months = travel.arrivalMonthPattern;
  if (![months.activeMonthCount, months.sampleSize, months.distinctArrivalYears].every(isCount)
    || !Array.isArray(months.counts) || months.counts.length !== 12 || !months.counts.every(isCount)
    || !Array.isArray(months.shares) || months.shares.length !== 12 || !months.shares.every(isNullableNumber)
    || !Array.isArray(months.topMonths) || !months.topMonths.every((month) => isCount(month) && month >= 1 && month <= 12)) return null;
  if (![sources.counts, sources.shares, sources.brandCounts, sources.brandShares, sources.parkingCounts,
    sources.parkingShares, sources.parkingFamilyCounts].every(isNumberRecord)
    || !Array.isArray(sources.topBrands) || !sources.topBrands.every((item) => typeof item === "string")
    || !Array.isArray(sources.topParkings) || !sources.topParkings.every((item) => typeof item === "string")
    || (sources.preferredBrand !== null && typeof sources.preferredBrand !== "string")
    || (sources.preferredParking !== null && typeof sources.preferredParking !== "string")) return null;
  if (![quality.totalValidBookingCount, quality.eligibleBoletaBookingCount, quality.excludedPackBookingCount,
    quality.economicEligibleBoletaCount, quality.missingAmountCount, quality.missingDurationCount,
    quality.missingLeadTimeCount, quality.invalidLeadTimeCount].every(isCount) || !Array.isArray(quality.warnings)
    || !quality.warnings.every((warning) => ["LOW_SAMPLE_SIZE", "ECONOMICS_PARTIAL", "LEAD_TIME_PARTIAL", "SEASONALITY_LOW_SAMPLE", "GAP_LOW_SAMPLE"].includes(String(warning)))) return null;
  return value as Customer360BoletaAnalytics;
}
