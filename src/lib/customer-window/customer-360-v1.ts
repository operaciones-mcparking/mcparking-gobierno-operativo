export type Customer360RepresentationType = "confirmed_customer" | "related_review";
export type Customer360Universe = "GLOBAL" | "MCP_EAP";

export type Customer360Locator = {
  authoritySnapshotId: string | null;
  customerUniverse: Customer360Universe;
  representationId: string;
  representationKey: string;
  representationType: Customer360RepresentationType;
};

export type Customer360Overview = {
  contractVersion: "CUSTOMER_360_V1";
  identity: {
    contactability: "direct" | "observed_only";
    contacts: {
      emailCount: number;
      phoneCount: number;
      semantics: "direct";
      singleEmail: string | null;
      singlePhone: string | null;
    } | {
      emailCount: number;
      emailPreview: string[];
      phoneCount: number;
      phonePreview: string[];
      semantics: "observed";
      singleEmail: string | null;
      singlePhone: string | null;
    };
    customerId: string | null;
    relatedGroupId: string | null;
    relatedReviewSummary: {
      candidateCount: number;
      conflictCount: number;
      profileCount: number;
      v1BookingCount: number;
      v2BookingCount: number;
    } | null;
    status: "confirmed" | "related_review";
  };
  locator: Customer360Locator;
  moduleAvailability: Record<
    "advancedMetrics" | "attribution" | "bookings" | "commercialEvents" | "communications",
    { reason?: string; status: "available" | "unavailable" }
  >;
  ok: true;
  representation: {
    authorityStatus: "global" | "active_snapshot";
    readOnly: boolean;
  };
  sourceCoverage: Array<{
    bookingCount: number;
    source: "MCP_EAP" | "OKP";
  }>;
  summary: {
    firstBookingAt: string | null;
    lastBookingAt: string | null;
    totalBookings: number;
  };
};

export type Customer360ObservedContacts = {
  contactType: "email" | "phone";
  contractVersion: "CUSTOMER_360_V1";
  items: string[];
  locator: Customer360Locator;
  ok: true;
  pagination: {
    hasNextPage: boolean;
    page: number;
    pageSize: number;
    total: number;
  };
  semantics: "observed";
};

export type Customer360Booking = {
  actualCheckInAt: string | null;
  actualCheckOutAt: string | null;
  amount: string | null;
  amountKind: "paid_amount" | null;
  bookingId: string | null;
  brand: string | null;
  createdAt: string | null;
  durationDays: number | null;
  isPack: boolean | null;
  observedEmail: string | null;
  observedPhone: string | null;
  parking: string | null;
  plannedCheckInAt: string | null;
  plannedCheckOutAt: string | null;
  promoCode: string | null;
  source: "MCP_EAP" | "OKP";
  sourceRowId: string;
  status: string | null;
};

export type Customer360Bookings = {
  contractVersion: "CUSTOMER_360_V1";
  items: Customer360Booking[];
  locator: Customer360Locator;
  ok: true;
  pagination: {
    hasNextPage: boolean;
    page: number;
    pageSize: number;
    total: number;
  };
};

export type Customer360ErrorCode =
  | "authority_not_found"
  | "invalid_locator_contract"
  | "representation_authority_unavailable"
  | "representation_contract_unavailable"
  | "representation_not_found"
  | "stale_representation";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const groupPattern = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

function isDistinctStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)
    && new Set(value).size === value.length;
}

export function normalizeCustomer360Locator(value: unknown): Customer360Locator | null {
  if (!isRecord(value)) return null;
  const { authoritySnapshotId, customerUniverse, representationId, representationKey, representationType } = value;
  if (representationType !== "confirmed_customer" && representationType !== "related_review") return null;
  if (typeof representationId !== "string" || representationKey !== `${representationType}:${representationId}`) return null;
  if (representationType === "confirmed_customer") {
    if (!uuidPattern.test(representationId) || customerUniverse !== "GLOBAL" || authoritySnapshotId !== null) return null;
  } else if (!groupPattern.test(representationId) || customerUniverse !== "MCP_EAP"
    || typeof authoritySnapshotId !== "string" || !uuidPattern.test(authoritySnapshotId)) return null;
  return value as Customer360Locator;
}

function normalizeContacts(value: unknown, semantics: "direct" | "observed") {
  if (!isRecord(value) || value.semantics !== semantics || !isCount(value.emailCount) || !isCount(value.phoneCount)
    || !isNullableString(value.singleEmail) || !isNullableString(value.singlePhone)) return null;
  if ((value.emailCount === 1) !== Boolean(value.singleEmail) || (value.phoneCount === 1) !== Boolean(value.singlePhone)) return null;
  if (semantics === "direct") {
    if ("emailPreview" in value || "phonePreview" in value) return null;
  } else {
    if (!isDistinctStringArray(value.emailPreview) || !isDistinctStringArray(value.phonePreview)) return null;
    const expectedEmailPreview = Math.min(value.emailCount as number, 5);
    const expectedPhonePreview = Math.min(value.phoneCount as number, 5);
    if (value.emailPreview.length !== expectedEmailPreview || value.phonePreview.length !== expectedPhonePreview) return null;
    if ((value.emailCount === 1 && value.emailPreview[0] !== value.singleEmail)
      || (value.phoneCount === 1 && value.phonePreview[0] !== value.singlePhone)) return null;
  }
  return value;
}

export function normalizeCustomer360Overview(value: unknown): Customer360Overview | null {
  if (!isRecord(value) || value.ok !== true || value.contractVersion !== "CUSTOMER_360_V1") return null;
  const locator = normalizeCustomer360Locator(value.locator);
  if (!locator || !isRecord(value.representation) || !isRecord(value.identity)
    || !isRecord(value.summary) || !Array.isArray(value.sourceCoverage) || !isRecord(value.moduleAvailability)) return null;
  const related = locator.representationType === "related_review";
  const contacts = normalizeContacts(value.identity.contacts, related ? "observed" : "direct");
  if (!contacts || value.representation.readOnly !== related
    || value.representation.authorityStatus !== (related ? "active_snapshot" : "global")
    || value.identity.status !== (related ? "related_review" : "confirmed")
    || value.identity.contactability !== (related ? "observed_only" : "direct")) return null;
  if (related) {
    if (value.identity.customerId !== null || value.identity.relatedGroupId !== locator.representationId
      || !isRecord(value.identity.relatedReviewSummary)) return null;
    const group = value.identity.relatedReviewSummary;
    if (![group.profileCount, group.conflictCount, group.candidateCount, group.v1BookingCount, group.v2BookingCount].every(isCount)) return null;
  } else if (value.identity.customerId !== locator.representationId
    || value.identity.relatedGroupId !== null || value.identity.relatedReviewSummary !== null) return null;
  if (!isCount(value.summary.totalBookings) || !isTimestamp(value.summary.firstBookingAt)
    || !isTimestamp(value.summary.lastBookingAt)) return null;
  const coverageValid = value.sourceCoverage.every((item) => isRecord(item)
    && (item.source === "MCP_EAP" || item.source === "OKP") && isCount(item.bookingCount) && item.bookingCount > 0);
  if (!coverageValid || new Set(value.sourceCoverage.map((item) => (item as { source: string }).source)).size !== value.sourceCoverage.length) return null;
  const modules = value.moduleAvailability;
  for (const key of ["bookings", "commercialEvents", "communications", "advancedMetrics", "attribution"]) {
    if (!isRecord(modules[key]) || (modules[key] as Record<string, unknown>).status !== (key === "bookings" ? "available" : "unavailable")) return null;
  }
  return value as Customer360Overview;
}

function normalizeBooking(value: unknown): Customer360Booking | null {
  if (!isRecord(value) || (value.source !== "MCP_EAP" && value.source !== "OKP")
    || typeof value.sourceRowId !== "string" || !/^(0|[1-9]\d*)$/.test(value.sourceRowId)
    || !isNullableString(value.bookingId) || !isTimestamp(value.createdAt)
    || !isTimestamp(value.plannedCheckInAt) || !isTimestamp(value.plannedCheckOutAt)
    || !isTimestamp(value.actualCheckInAt) || !isTimestamp(value.actualCheckOutAt)
    || !isNullableString(value.brand) || !isNullableString(value.parking)
    || !isNullableString(value.amount) || (value.amountKind !== null && value.amountKind !== "paid_amount")
    || !isNullableString(value.status) || (value.durationDays !== null && !isCount(value.durationDays))
    || (value.isPack !== null && typeof value.isPack !== "boolean") || !isNullableString(value.promoCode)
    || !isNullableString(value.observedEmail) || !isNullableString(value.observedPhone)) return null;
  if ((value.amount === null) !== (value.amountKind === null)) return null;
  return value as Customer360Booking;
}

export function normalizeCustomer360Bookings(value: unknown): Customer360Bookings | null {
  if (!isRecord(value) || value.ok !== true || value.contractVersion !== "CUSTOMER_360_V1"
    || !Array.isArray(value.items) || !isRecord(value.pagination)) return null;
  const locator = normalizeCustomer360Locator(value.locator);
  const items = value.items.map(normalizeBooking);
  if (!locator || items.some((item) => item === null) || !isCount(value.pagination.total)
    || !isCount(value.pagination.page) || value.pagination.page < 1
    || !isCount(value.pagination.pageSize) || value.pagination.pageSize < 1 || value.pagination.pageSize > 100
    || typeof value.pagination.hasNextPage !== "boolean") return null;
  if (locator.representationType === "confirmed_customer"
    && items.some((item) => item?.observedEmail !== null || item?.observedPhone !== null)) return null;
  return { ...value, items } as Customer360Bookings;
}

export function normalizeCustomer360ObservedContacts(value: unknown): Customer360ObservedContacts | null {
  if (!isRecord(value) || value.ok !== true || value.contractVersion !== "CUSTOMER_360_V1"
    || value.semantics !== "observed" || (value.contactType !== "email" && value.contactType !== "phone")
    || !isDistinctStringArray(value.items) || !isRecord(value.pagination)) return null;
  const locator = normalizeCustomer360Locator(value.locator);
  const expectedItems = Math.min(
    value.pagination.pageSize as number,
    Math.max(0, (value.pagination.total as number) - ((value.pagination.page as number) - 1) * (value.pagination.pageSize as number)),
  );
  if (!locator || locator.representationType !== "related_review"
    || !isCount(value.pagination.total) || !isCount(value.pagination.page) || value.pagination.page < 1
    || !isCount(value.pagination.pageSize) || value.pagination.pageSize < 1 || value.pagination.pageSize > 100
    || value.items.length !== expectedItems || typeof value.pagination.hasNextPage !== "boolean"
    || value.pagination.hasNextPage !== value.pagination.page * value.pagination.pageSize < value.pagination.total) return null;
  return value as Customer360ObservedContacts;
}

export function customer360LocatorFromRepresentation(input: {
  activeSnapshotId: string | null;
  representationId: string;
  representationKey: string;
  representationType: Customer360RepresentationType;
}): Customer360Locator | null {
  const locator: Customer360Locator = input.representationType === "confirmed_customer" ? {
    authoritySnapshotId: null,
    customerUniverse: "GLOBAL",
    representationId: input.representationId,
    representationKey: input.representationKey,
    representationType: input.representationType,
  } : {
    authoritySnapshotId: input.activeSnapshotId,
    customerUniverse: "MCP_EAP",
    representationId: input.representationId,
    representationKey: input.representationKey,
    representationType: input.representationType,
  };
  return normalizeCustomer360Locator(locator);
}
