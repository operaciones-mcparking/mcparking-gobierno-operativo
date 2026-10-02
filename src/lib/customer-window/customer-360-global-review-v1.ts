import {
  normalizeCustomer360Locator,
  type Customer360Locator,
} from "@/lib/customer-window/customer-360-v1";
import type { CustomerWindowRelatedContactV2 } from "@/lib/customer-window/customer-representations-v2";

export type GlobalReviewContactCandidate = {
  bookingCount: number;
  conflictInvolvement: boolean;
  contradictorySignals: boolean;
  currentGroupMembership: true;
  displayValue: string;
  eligibility: { reasonCodes: string[]; status: "BLOCKED" | "REVIEW" };
  firstSeenAt: string;
  lastSeenAt: string;
  normalizedValue: string;
  policyVersion: "RELATED_CONTACTABILITY_V1";
  profileCount: 1;
  qualityFlags: string[];
  relation: "observed_in_review_profile";
  sameEmailHistory: null;
  samePhoneHistory: null;
  sourceCount: number;
  sources: Array<"MCP_EAP" | "OKP">;
  type: "email" | "phone";
};

export type GlobalReviewRelatedEvidence = {
  contactType?: "email" | "phone";
  displayValue?: string;
  evidenceSource: "contact_match" | "profile_membership";
  groupId: string;
  normalizedValue?: string;
  relationReason: "profile_membership" | "same_email_history" | "same_phone_history";
  snapshotId: string;
};

export type Customer360GlobalReviewAnalytics = {
  activity: {
    boletaBookings: number;
    firstActivityAt: string | null;
    lastActivityAt: string | null;
    packBookings: number;
    totalValidBookings: number;
  };
  contactability: {
    automationEnabled: false;
    candidates: GlobalReviewContactCandidate[];
    historicalEvidence: { detailSurface: "identity"; materialized: false };
    mode: "read_only_review";
    policyVersion: "RELATED_CONTACTABILITY_V1";
    primaryContactCandidate: {
      email: GlobalReviewContactCandidate | null;
      phone: GlobalReviewContactCandidate | null;
    };
  };
  contractVersion: "CUSTOMER_360_GLOBAL_REVIEW_ANALYTICS_V1";
  dataQuality: {
    calculationVersion: "CUSTOMER_360_GLOBAL_REVIEW_ANALYTICS_V1";
    computedAt: string;
  };
  locator: Customer360Locator;
  ok: true;
  origin: {
    counts: { MCP_EAP: number; OKP: number };
    sourceCoverage: "CROSS_SOURCE" | "MCP_EAP" | "OKP";
  };
  relatedMcpEapEvidence: GlobalReviewRelatedEvidence[];
  scope: {
    customerUniverse: "GLOBAL_REVIEW";
    entity: "review_profile";
    semantics: "group_observed";
  };
};

export type Customer360GlobalReviewIdentity = {
  contractVersion: "CUSTOMER_360_GLOBAL_REVIEW_IDENTITY_V1";
  events: Array<{
    createdAt: string;
    eventId: string;
    eventType: string;
    evidence: Record<string, unknown>;
    reason: string;
    resolverVersion: string;
    source: "MCP_EAP" | "OKP" | null;
    sourceRowId: number | null;
  }>;
  links: Array<{
    bookingLinkId: string;
    confidence: string;
    evidence: Record<string, unknown>;
    resolverVersion: string;
    source: "MCP_EAP" | "OKP";
    sourceRowId: number;
    status: "candidate" | "conflict";
  }>;
  locator: Customer360Locator;
  ok: true;
  profile: {
    mergedIntoProfileId: null;
    needsReview: true;
    profileId: string;
    resolverVersion: string;
    status: "active";
  };
  relatedContacts: {
    emails: CustomerWindowRelatedContactV2[];
    phones: CustomerWindowRelatedContactV2[];
  };
  relatedMcpEapEvidence: GlobalReviewRelatedEvidence[];
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const groupPattern = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

function isDistinctStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)
    && new Set(value).size === value.length;
}

function normalizeEvidence(value: unknown): GlobalReviewRelatedEvidence | null {
  if (!isRecord(value) || !groupPattern.test(String(value.groupId))
    || !uuidPattern.test(String(value.snapshotId))
    || (value.evidenceSource !== "contact_match" && value.evidenceSource !== "profile_membership")
    || !["profile_membership", "same_email_history", "same_phone_history"].includes(String(value.relationReason))) return null;
  const hasContactFields = value.contactType !== undefined
    || value.displayValue !== undefined || value.normalizedValue !== undefined;
  if (!hasContactFields) return value as GlobalReviewRelatedEvidence;
  if (value.evidenceSource !== "contact_match"
    || (value.contactType !== "email" && value.contactType !== "phone")
    || typeof value.displayValue !== "string" || value.displayValue.length === 0
    || typeof value.normalizedValue !== "string" || value.normalizedValue.length === 0) return null;
  if ((value.relationReason === "same_email_history" && value.contactType !== "email")
    || (value.relationReason === "same_phone_history" && value.contactType !== "phone")
    || value.relationReason === "profile_membership") return null;
  return value as GlobalReviewRelatedEvidence;
}

function normalizeRelatedContact(value: unknown, type: "email" | "phone"): CustomerWindowRelatedContactV2 | null {
  if (!isRecord(value) || value.type !== type
    || typeof value.value !== "string" || value.value.length === 0
    || (value.relation !== "observed_in_group" && value.relation !== "historically_related")
    || (value.relationReason !== null && value.relationReason !== "same_email_history"
      && value.relationReason !== "same_phone_history" && value.relationReason !== "same_profile_history")
    || (value.relation === "observed_in_group" ? value.relationReason !== null : value.relationReason === null)
    || (value.source !== null && value.source !== "MCP_EAP" && value.source !== "OKP")
    || (value.sourceRowId !== null && !isCount(value.sourceRowId))
    || (value.profileId !== null && (typeof value.profileId !== "string" || !uuidPattern.test(value.profileId)))
    || (value.bookingCode !== null && typeof value.bookingCode !== "string")
    || !isTimestamp(value.observedAt) || !isTimestamp(value.firstSeenAt) || !isTimestamp(value.lastSeenAt)
    || !isCount(value.sourceCount) || !isCount(value.bookingCount)) return null;
  return value as CustomerWindowRelatedContactV2;
}

function normalizeRelatedContacts(value: unknown): Customer360GlobalReviewIdentity["relatedContacts"] | null {
  if (!isRecord(value) || !Array.isArray(value.emails) || !Array.isArray(value.phones)) return null;
  const emails = value.emails.map((contact) => normalizeRelatedContact(contact, "email"));
  const phones = value.phones.map((contact) => normalizeRelatedContact(contact, "phone"));
  if (emails.some((contact) => contact === null) || phones.some((contact) => contact === null)) return null;
  const unique = (contacts: CustomerWindowRelatedContactV2[]) => new Set(contacts.map((contact) => contact.value.trim().toLowerCase())).size === contacts.length;
  if (!unique(emails as CustomerWindowRelatedContactV2[]) || !unique(phones as CustomerWindowRelatedContactV2[])) return null;
  return { emails, phones } as Customer360GlobalReviewIdentity["relatedContacts"];
}

function normalizeCandidate(value: unknown): GlobalReviewContactCandidate | null {
  if (!isRecord(value) || (value.type !== "email" && value.type !== "phone")
    || typeof value.normalizedValue !== "string" || value.normalizedValue.length === 0
    || value.displayValue !== value.normalizedValue || value.relation !== "observed_in_review_profile"
    || !Array.isArray(value.sources) || value.sources.length < 1
    || value.sources.some((source) => source !== "MCP_EAP" && source !== "OKP")
    || new Set(value.sources).size !== value.sources.length || value.sourceCount !== value.sources.length
    || !isTimestamp(value.firstSeenAt) || value.firstSeenAt === null
    || !isTimestamp(value.lastSeenAt) || value.lastSeenAt === null
    || !isCount(value.bookingCount) || value.bookingCount < 1 || value.profileCount !== 1
    || value.currentGroupMembership !== true || typeof value.conflictInvolvement !== "boolean"
    || value.contradictorySignals !== value.conflictInvolvement
    || value.samePhoneHistory !== null || value.sameEmailHistory !== null
    || !isDistinctStrings(value.qualityFlags) || !isRecord(value.eligibility)
    || (value.eligibility.status !== "REVIEW" && value.eligibility.status !== "BLOCKED")
    || !isDistinctStrings(value.eligibility.reasonCodes)
    || !value.eligibility.reasonCodes.includes("AUTOMATION_NOT_AUTHORIZED_V1")
    || value.policyVersion !== "RELATED_CONTACTABILITY_V1") return null;
  return value as GlobalReviewContactCandidate;
}

export function normalizeCustomer360GlobalReviewAnalytics(
  value: unknown,
): Customer360GlobalReviewAnalytics | null {
  if (!isRecord(value) || value.ok !== true
    || value.contractVersion !== "CUSTOMER_360_GLOBAL_REVIEW_ANALYTICS_V1") return null;
  const locator = normalizeCustomer360Locator(value.locator);
  if (!locator || locator.representationType !== "global_review" || !isRecord(value.scope)
    || value.scope.entity !== "review_profile" || value.scope.semantics !== "group_observed"
    || value.scope.customerUniverse !== "GLOBAL_REVIEW" || !isRecord(value.activity)
    || !isRecord(value.origin) || !isRecord(value.contactability) || !isRecord(value.dataQuality)
    || !Array.isArray(value.relatedMcpEapEvidence)) return null;
  const activity = value.activity;
  if (![activity.totalValidBookings, activity.boletaBookings, activity.packBookings].every(isCount)
    || (activity.totalValidBookings as number) !== (activity.boletaBookings as number) + (activity.packBookings as number)
    || !isTimestamp(activity.firstActivityAt) || !isTimestamp(activity.lastActivityAt)) return null;
  if (!isRecord(value.origin.counts) || !isCount(value.origin.counts.MCP_EAP)
    || !isCount(value.origin.counts.OKP)
    || value.origin.counts.MCP_EAP + value.origin.counts.OKP !== activity.totalValidBookings
    || !["CROSS_SOURCE", "MCP_EAP", "OKP"].includes(String(value.origin.sourceCoverage))) return null;
  const candidates = Array.isArray(value.contactability.candidates)
    ? value.contactability.candidates.map(normalizeCandidate) : [];
  if (!Array.isArray(value.contactability.candidates) || candidates.some((candidate) => candidate === null)
    || value.contactability.mode !== "read_only_review" || value.contactability.automationEnabled !== false
    || value.contactability.policyVersion !== "RELATED_CONTACTABILITY_V1"
    || !isRecord(value.contactability.primaryContactCandidate)
    || !isRecord(value.contactability.historicalEvidence)
    || value.contactability.historicalEvidence.materialized !== false
    || value.contactability.historicalEvidence.detailSurface !== "identity") return null;
  const normalizedCandidates = candidates as GlobalReviewContactCandidate[];
  const primary = value.contactability.primaryContactCandidate;
  for (const type of ["email", "phone"] as const) {
    const expected = normalizedCandidates.filter((candidate) => candidate.type === type);
    const expectedPrimary = expected.length === 1 && expected[0].eligibility.status === "REVIEW" ? expected[0] : null;
    const actual = primary[type] === null ? null : normalizeCandidate(primary[type]);
    if ((primary[type] !== null && !actual)
      || actual?.normalizedValue !== expectedPrimary?.normalizedValue) return null;
  }
  if (!value.relatedMcpEapEvidence.every((item) => normalizeEvidence(item) !== null)
    || value.dataQuality.calculationVersion !== "CUSTOMER_360_GLOBAL_REVIEW_ANALYTICS_V1"
    || !isTimestamp(value.dataQuality.computedAt) || value.dataQuality.computedAt === null) return null;
  return value as Customer360GlobalReviewAnalytics;
}

export function normalizeCustomer360GlobalReviewIdentity(
  value: unknown,
): Customer360GlobalReviewIdentity | null {
  if (!isRecord(value) || value.ok !== true
    || value.contractVersion !== "CUSTOMER_360_GLOBAL_REVIEW_IDENTITY_V1") return null;
  const locator = normalizeCustomer360Locator(value.locator);
  if (!locator || locator.representationType !== "global_review" || !isRecord(value.profile)
    || value.profile.profileId !== locator.representationId || value.profile.status !== "active"
    || value.profile.needsReview !== true || value.profile.mergedIntoProfileId !== null
    || typeof value.profile.resolverVersion !== "string" || !Array.isArray(value.links)
    || !Array.isArray(value.events) || !Array.isArray(value.relatedMcpEapEvidence)) return null;
  const relatedContacts = normalizeRelatedContacts(value.relatedContacts ?? { emails: [], phones: [] });
  if (!relatedContacts) return null;
  if (!value.links.every((link) => isRecord(link) && uuidPattern.test(String(link.bookingLinkId))
    && (link.source === "MCP_EAP" || link.source === "OKP") && isCount(link.sourceRowId)
    && (link.status === "candidate" || link.status === "conflict")
    && typeof link.confidence === "string" && typeof link.resolverVersion === "string"
    && isRecord(link.evidence))) return null;
  if (!value.events.every((event) => isRecord(event) && uuidPattern.test(String(event.eventId))
    && typeof event.eventType === "string" && (event.source === null || event.source === "MCP_EAP" || event.source === "OKP")
    && (event.sourceRowId === null || isCount(event.sourceRowId)) && typeof event.resolverVersion === "string"
    && typeof event.reason === "string" && isRecord(event.evidence)
    && isTimestamp(event.createdAt) && event.createdAt !== null)) return null;
  if (!value.relatedMcpEapEvidence.every((item) => normalizeEvidence(item) !== null)) return null;
  return { ...value, relatedContacts } as Customer360GlobalReviewIdentity;
}
