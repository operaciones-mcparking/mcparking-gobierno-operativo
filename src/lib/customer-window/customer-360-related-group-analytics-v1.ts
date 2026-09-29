import {
  normalizeCustomer360Locator,
  type Customer360Locator,
} from "@/lib/customer-window/customer-360-v1";

export type RelatedGroupContactCandidate = {
  bookingCount: number;
  conflictInvolvement: boolean;
  contradictorySignals: boolean | null;
  currentGroupMembership: true;
  displayValue: string;
  eligibility: {
    reasonCodes: string[];
    status: "REVIEW" | "BLOCKED";
  };
  firstSeenAt: string;
  lastSeenAt: string;
  normalizedValue: string;
  policyVersion: "RELATED_CONTACTABILITY_V1";
  profileCount: number | null;
  qualityFlags: string[];
  relation: "observed_in_group";
  sameEmailHistory: boolean | null;
  samePhoneHistory: boolean | null;
  sourceCount: 1;
  sources: ["MCP_EAP"];
  type: "email" | "phone";
};

export type Customer360RelatedGroupAnalytics = {
  activity: {
    boletaBookings: number;
    bookings12m: number;
    bookings24m: number;
    firstActivityAt: string | null;
    lastActivityAt: string | null;
    packBookings: number;
    totalValidBookings: number;
  };
  behavior: {
    arrivals: {
      activeMonths: number;
      monthlyCounts: number[];
      sampleSize: number;
      weekdayCount: number;
      weekendCount: number;
    };
    economicDays: {
      average: number | null;
      median: number | null;
      sampleSize: number;
      total: number | null;
    };
    leadTimeDays: {
      average: number | null;
      median: number | null;
      sampleSize: number;
    };
    scope: "boleta_observed";
  };
  boletaEconomics: {
    averageTicket: number | null;
    discountAmount: number | null;
    discountUsagePct: number | null;
    discountedBookings: number;
    label: "Economía BOLETA observada del grupo";
    listAdr: number | null;
    listAmount: number | null;
    medianTicket: number | null;
    paidAdr: number | null;
    paidAmount: number | null;
    sampleSize: number;
    weightedDiscountPct: number | null;
  };
  contactability: {
    automationEnabled: false;
    candidates: RelatedGroupContactCandidate[];
    historicalEvidence: {
      detailSurface: "identity";
      materialized: false;
    };
    mode: "read_only_review";
    policyVersion: "RELATED_CONTACTABILITY_V1";
    primaryContactCandidate: {
      email: RelatedGroupContactCandidate | null;
      phone: RelatedGroupContactCandidate | null;
    };
  };
  contractVersion: "CUSTOMER_360_RELATED_GROUP_ANALYTICS_V1";
  dataQuality: {
    asOfDate: string;
    calculationVersion: "CUSTOMER_360_RELATED_GROUP_ANALYTICS_V1";
    computedAt: string;
    invalidLeadTimeCount: number;
    missingDurationCount: number;
    missingLeadTimeCount: number;
    missingPaidAmountCount: number;
    missingParkingFamilyCount: number;
  };
  locator: Customer360Locator;
  ok: true;
  origin: {
    brandCounts: Record<string, number>;
    parkingCounts: Record<string, number>;
    parkingFamilyCounts: Record<string, number>;
    sourceCoverage: "MCP_EAP";
  };
  scope: {
    customerUniverse: "MCP_EAP";
    entity: "related_group";
    semantics: "group_observed";
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

function isDistinctStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)
    && new Set(value).size === value.length;
}

function isCountRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isCount);
}

function normalizeCandidate(value: unknown): RelatedGroupContactCandidate | null {
  if (!isRecord(value) || (value.type !== "email" && value.type !== "phone")
    || typeof value.normalizedValue !== "string" || value.normalizedValue.length === 0
    || value.displayValue !== value.normalizedValue || value.relation !== "observed_in_group"
    || !Array.isArray(value.sources) || value.sources.length !== 1 || value.sources[0] !== "MCP_EAP"
    || value.sourceCount !== 1 || !isTimestamp(value.firstSeenAt) || value.firstSeenAt === null
    || !isTimestamp(value.lastSeenAt) || value.lastSeenAt === null
    || Date.parse(value.firstSeenAt) > Date.parse(value.lastSeenAt)
    || !isCount(value.bookingCount) || value.bookingCount < 1
    || (value.profileCount !== null && (!isCount(value.profileCount) || value.profileCount < 1))
    || value.currentGroupMembership !== true || typeof value.conflictInvolvement !== "boolean"
    || (value.contradictorySignals !== null && typeof value.contradictorySignals !== "boolean")
    || (value.samePhoneHistory !== null && typeof value.samePhoneHistory !== "boolean")
    || (value.sameEmailHistory !== null && typeof value.sameEmailHistory !== "boolean")
    || !isDistinctStringArray(value.qualityFlags) || !isRecord(value.eligibility)
    || (value.eligibility.status !== "REVIEW" && value.eligibility.status !== "BLOCKED")
    || !isDistinctStringArray(value.eligibility.reasonCodes)
    || !value.eligibility.reasonCodes.includes("AUTOMATION_NOT_AUTHORIZED_V1")
    || value.policyVersion !== "RELATED_CONTACTABILITY_V1") return null;
  return value as RelatedGroupContactCandidate;
}

function sameCandidate(
  candidate: RelatedGroupContactCandidate | null,
  expected: RelatedGroupContactCandidate | undefined,
) {
  return candidate === null ? expected === undefined
    : expected?.normalizedValue === candidate.normalizedValue && expected.type === candidate.type
      && expected.eligibility.status === "REVIEW";
}

export function normalizeCustomer360RelatedGroupAnalytics(
  value: unknown,
): Customer360RelatedGroupAnalytics | null {
  if (!isRecord(value) || value.ok !== true
    || value.contractVersion !== "CUSTOMER_360_RELATED_GROUP_ANALYTICS_V1") return null;
  const locator = normalizeCustomer360Locator(value.locator);
  if (!locator || locator.representationType !== "related_review" || !isRecord(value.scope)
    || value.scope.entity !== "related_group" || value.scope.semantics !== "group_observed"
    || value.scope.customerUniverse !== "MCP_EAP" || !isRecord(value.activity)
    || !isRecord(value.behavior) || !isRecord(value.origin) || !isRecord(value.boletaEconomics)
    || !isRecord(value.contactability) || !isRecord(value.dataQuality)) return null;

  const activity = value.activity;
  if (![activity.totalValidBookings, activity.boletaBookings, activity.packBookings,
    activity.bookings12m, activity.bookings24m].every(isCount)
    || !isTimestamp(activity.firstActivityAt) || !isTimestamp(activity.lastActivityAt)) return null;
  const totalValidBookings = activity.totalValidBookings as number;
  const boletaBookings = activity.boletaBookings as number;
  const packBookings = activity.packBookings as number;
  const bookings12m = activity.bookings12m as number;
  const bookings24m = activity.bookings24m as number;
  if (boletaBookings + packBookings !== totalValidBookings || bookings12m > bookings24m
    || bookings24m > totalValidBookings) return null;

  const behavior = value.behavior;
  if (behavior.scope !== "boleta_observed" || !isRecord(behavior.economicDays)
    || !isRecord(behavior.leadTimeDays) || !isRecord(behavior.arrivals)) return null;
  const economicDays = behavior.economicDays;
  const leadTimeDays = behavior.leadTimeDays;
  const arrivals = behavior.arrivals;
  if (!isCount(economicDays.sampleSize) || !isNullableNumber(economicDays.total)
    || !isNullableNumber(economicDays.average) || !isNullableNumber(economicDays.median)
    || ((economicDays.sampleSize === 0) !== (economicDays.total === null))
    || !isCount(leadTimeDays.sampleSize) || !isNullableNumber(leadTimeDays.average)
    || !isNullableNumber(leadTimeDays.median)
    || ((leadTimeDays.sampleSize === 0) !== (leadTimeDays.average === null))
    || !isCount(arrivals.weekdayCount) || !isCount(arrivals.weekendCount)
    || !isCount(arrivals.sampleSize) || arrivals.sampleSize !== arrivals.weekdayCount + arrivals.weekendCount
    || !Array.isArray(arrivals.monthlyCounts) || arrivals.monthlyCounts.length !== 12
    || !arrivals.monthlyCounts.every(isCount) || !isCount(arrivals.activeMonths)
    || arrivals.activeMonths > 12) return null;

  if (value.origin.sourceCoverage !== "MCP_EAP" || !isCountRecord(value.origin.brandCounts)
    || !isCountRecord(value.origin.parkingCounts) || !isCountRecord(value.origin.parkingFamilyCounts)) return null;

  const economics = value.boletaEconomics;
  if (economics.label !== "Economía BOLETA observada del grupo" || !isCount(economics.sampleSize)
    || !isNullableNumber(economics.paidAmount) || !isNullableNumber(economics.listAmount)
    || !isNullableNumber(economics.discountAmount) || !isNullableNumber(economics.averageTicket)
    || !isNullableNumber(economics.medianTicket) || !isNullableNumber(economics.paidAdr)
    || !isNullableNumber(economics.listAdr) || !isCount(economics.discountedBookings)
    || !isNullableNumber(economics.discountUsagePct) || !isNullableNumber(economics.weightedDiscountPct)
    || economics.discountedBookings > economics.sampleSize
    || ((economics.sampleSize === 0) !== (economics.paidAmount === null))) return null;

  const contactability = value.contactability;
  if (contactability.mode !== "read_only_review" || contactability.automationEnabled !== false
    || contactability.policyVersion !== "RELATED_CONTACTABILITY_V1"
    || !Array.isArray(contactability.candidates) || !isRecord(contactability.primaryContactCandidate)
    || !isRecord(contactability.historicalEvidence)
    || contactability.historicalEvidence.materialized !== false
    || contactability.historicalEvidence.detailSurface !== "identity") return null;
  const candidates = contactability.candidates.map(normalizeCandidate);
  if (candidates.some((candidate) => candidate === null)) return null;
  const normalizedCandidates = candidates as RelatedGroupContactCandidate[];
  if (new Set(normalizedCandidates.map((candidate) => `${candidate.type}:${candidate.normalizedValue}`)).size
    !== normalizedCandidates.length) return null;
  const primaryEmail = contactability.primaryContactCandidate.email === null
    ? null : normalizeCandidate(contactability.primaryContactCandidate.email);
  const primaryPhone = contactability.primaryContactCandidate.phone === null
    ? null : normalizeCandidate(contactability.primaryContactCandidate.phone);
  if ((contactability.primaryContactCandidate.email !== null && !primaryEmail)
    || (contactability.primaryContactCandidate.phone !== null && !primaryPhone)) return null;
  const reviewEmails = normalizedCandidates.filter((candidate) => candidate.type === "email");
  const reviewPhones = normalizedCandidates.filter((candidate) => candidate.type === "phone");
  const expectedEmail = reviewEmails.length === 1 && reviewEmails[0].eligibility.status === "REVIEW"
    ? reviewEmails[0] : undefined;
  const expectedPhone = reviewPhones.length === 1 && reviewPhones[0].eligibility.status === "REVIEW"
    ? reviewPhones[0] : undefined;
  if (!sameCandidate(primaryEmail, expectedEmail) || !sameCandidate(primaryPhone, expectedPhone)) return null;

  const quality = value.dataQuality;
  if (![quality.missingPaidAmountCount, quality.missingDurationCount,
    quality.missingLeadTimeCount, quality.invalidLeadTimeCount,
    quality.missingParkingFamilyCount].every(isCount)
    || typeof quality.asOfDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(quality.asOfDate)
    || quality.calculationVersion !== "CUSTOMER_360_RELATED_GROUP_ANALYTICS_V1"
    || !isTimestamp(quality.computedAt) || quality.computedAt === null) return null;

  return value as Customer360RelatedGroupAnalytics;
}
