export type CustomerWindowSafeCount = number | string;
export type CustomerWindowRepresentationTypeV2 = "confirmed_customer" | "related_review";
export type CustomerWindowMetricScopeV2 = "all_confirmed_sources" | "mcp_eap_active_snapshot";
export type CustomerWindowIdentityStatusV2 = "confirmed" | "related_review";
export type CustomerWindowContactabilityV2 = "direct" | "review_required";
export type CustomerWindowContactSemanticsV2 = "direct" | "observed";

export type CustomerWindowContactSummaryV2 = {
  emailCount: CustomerWindowSafeCount;
  phoneCount: CustomerWindowSafeCount;
  semantics: CustomerWindowContactSemanticsV2;
  singleEmail: string | null;
  singlePhone: string | null;
};

export type CustomerWindowObservedContactV2 = {
  bookingCount: CustomerWindowSafeCount;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  value: string;
};

export type CustomerWindowRepresentationV2 = {
  contactSummary: CustomerWindowContactSummaryV2;
  customerId: string | null;
  firstPurchaseAt: string | null;
  lastBookingAtInPeriod: string | null;
  lastPurchaseAt: string | null;
  metricScope: CustomerWindowMetricScopeV2;
  relatedGroupId: string | null;
  representationId: string;
  representationKey: string;
  representationType: CustomerWindowRepresentationTypeV2;
  reservationsInPeriod: CustomerWindowSafeCount;
  totalReservations: CustomerWindowSafeCount;
};

export type CustomerWindowRepresentationListV2 = {
  items: CustomerWindowRepresentationV2[];
  page: number;
  pageSize: number;
  total: CustomerWindowSafeCount;
};

export type CustomerWindowRepresentationSearchItemV2 = CustomerWindowRepresentationV2 & {
  authoritySnapshotId: string | null;
  displayEmail: string | null;
  displayPhone: string | null;
  matchSemantics: "direct" | "observed_in_group" | "historically_related" | "booking" | "source_customer";
  matchType: "exact_email" | "exact_phone" | "exact_booking" | "exact_source_row" | "exact_source_customer" | "exact_plate" | "historical_email" | "historical_phone";
  matchValueType: "email" | "phone" | "booking_code" | "source_row_id" | "source_customer_id" | "plate";
};

export type CustomerWindowRepresentationSearchV2 = {
  items: CustomerWindowRepresentationSearchItemV2[];
  limit: number;
  total: CustomerWindowSafeCount;
};

export type CustomerWindowPeriodFacetsV2 = {
  confirmedBookingsInPeriod: CustomerWindowSafeCount;
  confirmedRepresentations: CustomerWindowSafeCount;
  relatedReviewBookingsInPeriod: CustomerWindowSafeCount;
  relatedReviewRepresentations: CustomerWindowSafeCount;
  totalBookingsInPeriod: CustomerWindowSafeCount;
  totalRepresentations: CustomerWindowSafeCount;
};

export type CustomerWindowRelatedReviewGroupV2 = {
  bookingCount: CustomerWindowSafeCount;
  candidateCount: CustomerWindowSafeCount;
  conflictCount: CustomerWindowSafeCount;
  emailCount: CustomerWindowSafeCount;
  hasExactEmailPhoneCorroboration: boolean;
  hasSourceCustomerEmailCorroboration: boolean;
  phoneCount: CustomerWindowSafeCount;
  profileCount: CustomerWindowSafeCount;
  sourceCustomerCount: CustomerWindowSafeCount;
  v1BookingCount: CustomerWindowSafeCount;
  v2BookingCount: CustomerWindowSafeCount;
};

export type CustomerWindowRepresentationSummaryV2 = {
  contactability: CustomerWindowContactabilityV2;
  contactSummary: CustomerWindowContactSummaryV2;
  customerId: string | null;
  directEmails: string[];
  directPhones: string[];
  firstPurchaseAt: string;
  group: CustomerWindowRelatedReviewGroupV2 | null;
  identityStatus: CustomerWindowIdentityStatusV2;
  lastPurchaseAt: string;
  metricScope: CustomerWindowMetricScopeV2;
  observedEmails: CustomerWindowObservedContactV2[];
  observedPhones: CustomerWindowObservedContactV2[];
  relatedGroupId: string | null;
  representationId: string;
  representationKey: string;
  representationType: CustomerWindowRepresentationTypeV2;
  totalReservations: CustomerWindowSafeCount;
};

export type CustomerWindowRepresentationBookingV2 = {
  bookingLinkId: string;
  bookingStatus: number;
  brand: string;
  durationDays: number | null;
  email: string | null;
  isPack: boolean;
  paidAmount: number | string | null;
  parking: string;
  plannedArrivalAt: string | null;
  plannedDepartureAt: string | null;
  phone: string | null;
  promotionCode: string | null;
  source: "MCP_EAP";
  sourceCreatedAt: string;
  sourceRowId: CustomerWindowSafeCount;
  websiteSource: number;
};

export type CustomerWindowRepresentationBookingsResponseV2 = {
  items: CustomerWindowRepresentationBookingV2[];
  page: number;
  pageSize: number;
  total: CustomerWindowSafeCount;
};

export type CustomerWindowIdentityResolutionEvidenceV2 = {
  contradictorySignals?: boolean;
  emailBookingCount?: CustomerWindowSafeCount;
  emailsForPhone?: CustomerWindowSafeCount;
  matchedByEmail?: boolean;
  matchedBySourceCustomerId?: boolean;
  phoneBookingCount?: CustomerWindowSafeCount;
  phonesForEmail?: CustomerWindowSafeCount;
  reusedReviewProfile?: boolean;
};

export type CustomerWindowRelatedContactV2 = {
  bookingCount: CustomerWindowSafeCount;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  profileId: string | null;
  relation: "observed_in_group" | "historically_related";
  relationReason: "same_email_history" | "same_phone_history" | "same_profile_history" | null;
  sourceCount: CustomerWindowSafeCount;
  value: string;
};

export type CustomerWindowIdentityResolutionDetailV2 = {
  events: Array<{
    createdAt: string;
    eventId: string;
    eventType: "candidate" | "conflict";
    evidence: CustomerWindowIdentityResolutionEvidenceV2;
    profileId: string | null;
    reason: string;
    resolverVersion: string;
    source: "MCP_EAP";
    sourceRowId: CustomerWindowSafeCount;
  }>;
  members: Array<{
    linkStatus: "candidate" | "conflict";
    profileId: string;
    reason: string | null;
    relationshipType: "EXACT_EMAIL" | "NO_EMAIL_SOURCE_ROW";
    resolverVersion: string;
    source: "MCP_EAP";
    sourceRowId: CustomerWindowSafeCount;
  }>;
  profiles: Array<{
    bookingCount: CustomerWindowSafeCount;
    firstBookingAt: string;
    lastBookingAt: string;
    mergedIntoProfileId: string | null;
    profileId: string;
    resolverVersions: string[];
    status: "active" | "blocked" | "merged";
  }>;
  relatedContacts: {
    emails: CustomerWindowRelatedContactV2[];
    phones: CustomerWindowRelatedContactV2[];
  };
  relatedGroupId: string;
  snapshotId: string;
  summary: {
    bookingCount: CustomerWindowSafeCount;
    candidateCount: CustomerWindowSafeCount;
    conflictCount: CustomerWindowSafeCount;
    emailCount: CustomerWindowSafeCount;
    phoneCount: CustomerWindowSafeCount;
    profileCount: CustomerWindowSafeCount;
    sourceCustomerCount: CustomerWindowSafeCount;
    v1BookingCount: CustomerWindowSafeCount;
    v2BookingCount: CustomerWindowSafeCount;
  };
};

export function isCustomerWindowRepresentationTypeV2(
  value: string | null,
): value is CustomerWindowRepresentationTypeV2 {
  return value === "confirmed_customer" || value === "related_review";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isSafeCount(value: unknown): value is CustomerWindowSafeCount {
  return typeof value === "number"
    ? Number.isSafeInteger(value) && value >= 0
    : typeof value === "string" && /^(0|[1-9]\d*)$/.test(value);
}

function countAsBigInt(value: CustomerWindowSafeCount) {
  return BigInt(value);
}

function hasUniqueStrings(values: string[]) {
  return new Set(values).size === values.length;
}

function normalizeContactSummary(value: unknown): CustomerWindowContactSummaryV2 | null {
  if (!isRecord(value) || !isSafeCount(value.emailCount) || !isSafeCount(value.phoneCount)) return null;
  if (value.semantics !== "direct" && value.semantics !== "observed") return null;
  if (!isNullableString(value.singleEmail) || !isNullableString(value.singlePhone)) return null;
  const emailCount = countAsBigInt(value.emailCount);
  const phoneCount = countAsBigInt(value.phoneCount);
  if ((emailCount === BigInt(1)) !== isNonEmptyString(value.singleEmail)) return null;
  if ((phoneCount === BigInt(1)) !== isNonEmptyString(value.singlePhone)) return null;
  return value as CustomerWindowContactSummaryV2;
}

function normalizeObservedContacts(value: unknown): CustomerWindowObservedContactV2[] | null {
  if (!Array.isArray(value)) return null;
  const contacts = value.map((contact): CustomerWindowObservedContactV2 | null => {
    if (
      !isRecord(contact)
      || !isNonEmptyString(contact.value)
      || !isSafeCount(contact.bookingCount)
      || countAsBigInt(contact.bookingCount) < BigInt(1)
      || !isNullableString(contact.firstSeenAt)
      || !isNullableString(contact.lastSeenAt)
    ) return null;
    return contact as CustomerWindowObservedContactV2;
  });
  return contacts.some((contact) => contact === null)
    ? null
    : contacts as CustomerWindowObservedContactV2[];
}

function isSafeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function isSafeNumeric(value: unknown): value is number | string {
  return typeof value === "number"
    ? Number.isFinite(value)
    : typeof value === "string" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value);
}

function normalizeRepresentation(value: unknown): CustomerWindowRepresentationV2 | null {
  if (!isRecord(value)) return null;
  const {
    customerId,
    contactSummary,
    firstPurchaseAt,
    lastBookingAtInPeriod,
    lastPurchaseAt,
    metricScope,
    relatedGroupId,
    representationId,
    representationKey,
    representationType,
    reservationsInPeriod,
    totalReservations,
  } = value;
  if (
    !isNonEmptyString(representationId)
    || !isNonEmptyString(representationKey)
    || !isNullableString(customerId)
    || !isNullableString(relatedGroupId)
    || !isNullableString(firstPurchaseAt)
    || !isNullableString(lastPurchaseAt)
    || !isNullableString(lastBookingAtInPeriod)
    || !isSafeCount(totalReservations)
    || !isSafeCount(reservationsInPeriod)
  ) return null;
  const normalizedContactSummary = normalizeContactSummary(contactSummary);
  if (!normalizedContactSummary) return null;

  if (representationKey !== `${representationType}:${representationId}`) return null;
  if (representationType === "confirmed_customer") {
    if (!isNonEmptyString(customerId) || relatedGroupId !== null || representationId !== customerId) return null;
    if (metricScope !== "all_confirmed_sources") return null;
    if (normalizedContactSummary.semantics !== "direct") return null;
  } else if (representationType === "related_review") {
    if (customerId !== null || !isNonEmptyString(relatedGroupId) || representationId !== relatedGroupId) return null;
    if (metricScope !== "mcp_eap_active_snapshot") return null;
    if (normalizedContactSummary.semantics !== "observed") return null;
  } else {
    return null;
  }

  return value as CustomerWindowRepresentationV2;
}

export function normalizeCustomerWindowRepresentationListV2(
  value: unknown,
): CustomerWindowRepresentationListV2 | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !isSafeCount(value.total)) return null;
  if (!Number.isSafeInteger(value.page) || (value.page as number) < 1) return null;
  if (!Number.isSafeInteger(value.pageSize) || (value.pageSize as number) < 1 || (value.pageSize as number) > 100) return null;
  const items = value.items.map(normalizeRepresentation);
  if (items.some((item) => item === null)) return null;
  return { ...value, items } as CustomerWindowRepresentationListV2;
}

export function normalizeCustomerWindowRepresentationSearchV2(
  value: unknown,
): CustomerWindowRepresentationSearchV2 | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !isSafeCount(value.total)) return null;
  if (!isSafeInteger(value.limit, 1) || value.limit > 20 || value.items.length > value.limit) return null;
  const allowedMatchTypes = new Set(["exact_email", "exact_phone", "exact_booking", "exact_source_row", "exact_source_customer", "exact_plate", "historical_email", "historical_phone"]);
  const allowedValueTypes = new Set(["email", "phone", "booking_code", "source_row_id", "source_customer_id", "plate"]);
  const allowedSemantics = new Set(["direct", "observed_in_group", "historically_related", "booking", "source_customer"]);
  const items = value.items.map((item) => {
    const representation = normalizeRepresentation(item);
    if (!representation || !isRecord(item)
      || !allowedMatchTypes.has(String(item.matchType))
      || !allowedValueTypes.has(String(item.matchValueType))
      || !allowedSemantics.has(String(item.matchSemantics))
      || !isNullableString(item.displayEmail)
      || !isNullableString(item.displayPhone)) return null;
    const historicalType = item.matchType === "historical_email" || item.matchType === "historical_phone";
    if (historicalType !== (item.matchSemantics === "historically_related")) return null;
    if (historicalType && representation.representationType !== "related_review") return null;
    if (representation.representationType === "confirmed_customer" && item.authoritySnapshotId !== null) return null;
    if (representation.representationType === "related_review" && !isUuid(item.authoritySnapshotId)) return null;
    return item as CustomerWindowRepresentationSearchItemV2;
  });
  if (items.some((item) => item === null)) return null;
  if (new Set(items.map((item) => item?.representationKey)).size !== items.length) return null;
  return { ...value, items } as CustomerWindowRepresentationSearchV2;
}

export function normalizeCustomerWindowIdentityResolutionDetailV2(
  value: unknown,
): CustomerWindowIdentityResolutionDetailV2 | null {
  if (!isRecord(value) || !isUuid(value.snapshotId) || !isNonEmptyString(value.relatedGroupId)) return null;
  if (!/^[0-9a-f]{64}$/.test(value.relatedGroupId) || !isRecord(value.summary)) return null;
  const summary = value.summary;
  const summaryFields = ["bookingCount", "profileCount", "emailCount", "phoneCount", "sourceCustomerCount", "conflictCount", "candidateCount", "v1BookingCount", "v2BookingCount"] as const;
  if (summaryFields.some((field) => !isSafeCount(summary[field]))) return null;
  if (!Array.isArray(value.profiles) || !Array.isArray(value.members) || !Array.isArray(value.events)
    || !isRecord(value.relatedContacts) || !Array.isArray(value.relatedContacts.emails)
    || !Array.isArray(value.relatedContacts.phones)) return null;

  const profilesValid = value.profiles.every((profile) => isRecord(profile)
    && isUuid(profile.profileId)
    && (profile.mergedIntoProfileId === null || isUuid(profile.mergedIntoProfileId))
    && ["active", "blocked", "merged"].includes(String(profile.status))
    && isSafeCount(profile.bookingCount)
    && isNonEmptyString(profile.firstBookingAt)
    && isNonEmptyString(profile.lastBookingAt)
    && Array.isArray(profile.resolverVersions)
    && profile.resolverVersions.every(isNonEmptyString));
  const membersValid = value.members.every((member) => isRecord(member)
    && member.source === "MCP_EAP"
    && isSafeCount(member.sourceRowId)
    && isUuid(member.profileId)
    && (member.linkStatus === "candidate" || member.linkStatus === "conflict")
    && isNonEmptyString(member.resolverVersion)
    && (member.relationshipType === "EXACT_EMAIL" || member.relationshipType === "NO_EMAIL_SOURCE_ROW")
    && (member.reason === null || isNonEmptyString(member.reason)));
  const evidenceKeys = ["emailsForPhone", "phonesForEmail", "emailBookingCount", "phoneBookingCount"] as const;
  const evidenceFlags = ["matchedByEmail", "matchedBySourceCustomerId", "contradictorySignals", "reusedReviewProfile"] as const;
  const allowedEvidenceKeys = new Set<string>([...evidenceKeys, ...evidenceFlags]);
  const eventsValid = value.events.every((event) => {
    if (!isRecord(event) || !isRecord(event.evidence)) return false;
    const evidence = event.evidence;
    return isUuid(event.eventId)
      && event.source === "MCP_EAP"
      && isSafeCount(event.sourceRowId)
      && (event.profileId === null || isUuid(event.profileId))
      && (event.eventType === "candidate" || event.eventType === "conflict")
      && isNonEmptyString(event.resolverVersion)
      && isNonEmptyString(event.reason)
      && isNonEmptyString(event.createdAt)
      && Object.keys(evidence).every((key) => allowedEvidenceKeys.has(key))
      && evidenceKeys.every((key) => evidence[key] === undefined || isSafeCount(evidence[key]))
      && evidenceFlags.every((key) => evidence[key] === undefined || typeof evidence[key] === "boolean");
  });
  const contactValues = [...value.relatedContacts.emails, ...value.relatedContacts.phones];
  const scopedProfileIds = new Set(value.profiles
    .filter(isRecord)
    .map((profile) => profile.profileId)
    .filter(isNonEmptyString));
  const contactsValid = contactValues.every((contact) => isRecord(contact)
    && isNonEmptyString(contact.value)
    && (contact.relation === "observed_in_group" || contact.relation === "historically_related")
    && (contact.relationReason === null || contact.relationReason === "same_email_history"
      || contact.relationReason === "same_phone_history" || contact.relationReason === "same_profile_history")
    && (contact.relation === "observed_in_group"
      ? contact.relationReason === null
      : contact.relationReason !== null)
    && (contact.profileId === null || (isUuid(contact.profileId) && scopedProfileIds.has(contact.profileId)))
    && isNullableString(contact.firstSeenAt)
    && isNullableString(contact.lastSeenAt)
    && isSafeCount(contact.sourceCount)
    && countAsBigInt(contact.sourceCount) >= BigInt(1)
    && isSafeCount(contact.bookingCount));
  const contactsUnique = (contacts: unknown[]) => {
    const values = contacts.map((contact) => isRecord(contact) ? contact.value : null);
    return values.every(isNonEmptyString) && hasUniqueStrings(values as string[]);
  };
  if (!profilesValid || !membersValid || !eventsValid || !contactsValid
    || !contactsUnique(value.relatedContacts.emails)
    || !contactsUnique(value.relatedContacts.phones)) return null;
  if (countAsBigInt(summary.bookingCount as CustomerWindowSafeCount) !== BigInt(value.members.length)) return null;
  if (countAsBigInt(summary.profileCount as CustomerWindowSafeCount) !== BigInt(value.profiles.length)) return null;
  return value as CustomerWindowIdentityResolutionDetailV2;
}

export function normalizeCustomerWindowPeriodFacetsV2(
  value: unknown,
): CustomerWindowPeriodFacetsV2 | null {
  if (!isRecord(value)) return null;
  const fields = [
    "totalRepresentations",
    "confirmedRepresentations",
    "relatedReviewRepresentations",
    "totalBookingsInPeriod",
    "confirmedBookingsInPeriod",
    "relatedReviewBookingsInPeriod",
  ] as const;
  if (fields.some((field) => !isSafeCount(value[field]))) return null;
  const facets = value as CustomerWindowPeriodFacetsV2;
  if (
    countAsBigInt(facets.totalRepresentations)
      !== countAsBigInt(facets.confirmedRepresentations) + countAsBigInt(facets.relatedReviewRepresentations)
    || countAsBigInt(facets.totalBookingsInPeriod)
      !== countAsBigInt(facets.confirmedBookingsInPeriod) + countAsBigInt(facets.relatedReviewBookingsInPeriod)
  ) return null;
  return facets;
}

function normalizeRelatedReviewGroup(value: unknown): CustomerWindowRelatedReviewGroupV2 | null {
  if (!isRecord(value)) return null;
  const countFields = [
    "bookingCount",
    "profileCount",
    "emailCount",
    "phoneCount",
    "sourceCustomerCount",
    "conflictCount",
    "candidateCount",
    "v1BookingCount",
    "v2BookingCount",
  ] as const;
  if (countFields.some((field) => !isSafeCount(value[field]))) return null;
  if (
    typeof value.hasExactEmailPhoneCorroboration !== "boolean"
    || typeof value.hasSourceCustomerEmailCorroboration !== "boolean"
  ) return null;
  const group = value as CustomerWindowRelatedReviewGroupV2;
  if (
    countAsBigInt(group.bookingCount) !== countAsBigInt(group.conflictCount) + countAsBigInt(group.candidateCount)
    || countAsBigInt(group.bookingCount) !== countAsBigInt(group.v1BookingCount) + countAsBigInt(group.v2BookingCount)
    || countAsBigInt(group.profileCount) > countAsBigInt(group.bookingCount)
  ) return null;
  return group;
}

export function normalizeCustomerWindowRepresentationSummaryV2(
  value: unknown,
): CustomerWindowRepresentationSummaryV2 | null {
  if (!isRecord(value)) return null;
  if (
    !isNonEmptyString(value.representationId)
    || value.representationKey !== `${value.representationType}:${value.representationId}`
    || !isNullableString(value.customerId)
    || !isNullableString(value.relatedGroupId)
    || !isNonEmptyString(value.firstPurchaseAt)
    || !isNonEmptyString(value.lastPurchaseAt)
    || !isSafeCount(value.totalReservations)
  ) return null;
  const contactSummary = normalizeContactSummary(value.contactSummary);
  const observedEmails = normalizeObservedContacts(value.observedEmails);
  const observedPhones = normalizeObservedContacts(value.observedPhones);
  if (
    !contactSummary
    || !Array.isArray(value.directEmails)
    || !value.directEmails.every(isNonEmptyString)
    || !Array.isArray(value.directPhones)
    || !value.directPhones.every(isNonEmptyString)
    || !hasUniqueStrings(value.directEmails)
    || !hasUniqueStrings(value.directPhones)
    || observedEmails === null
    || observedPhones === null
    || !hasUniqueStrings(observedEmails.map((contact) => contact.value))
    || !hasUniqueStrings(observedPhones.map((contact) => contact.value))
  ) return null;

  if (value.representationType === "confirmed_customer") {
    if (
      value.identityStatus !== "confirmed"
      || value.contactability !== "direct"
      || value.metricScope !== "all_confirmed_sources"
      || !isNonEmptyString(value.customerId)
      || value.customerId !== value.representationId
      || value.relatedGroupId !== null
      || value.group !== null
      || contactSummary.semantics !== "direct"
      || countAsBigInt(contactSummary.emailCount) !== BigInt(value.directEmails.length)
      || countAsBigInt(contactSummary.phoneCount) !== BigInt(value.directPhones.length)
      || (value.directEmails.length === 1 && contactSummary.singleEmail !== value.directEmails[0])
      || (value.directPhones.length === 1 && contactSummary.singlePhone !== value.directPhones[0])
      || observedEmails.length !== 0
      || observedPhones.length !== 0
    ) return null;
  } else if (value.representationType === "related_review") {
    const group = normalizeRelatedReviewGroup(value.group);
    if (
      value.identityStatus !== "related_review"
      || value.contactability !== "review_required"
      || value.metricScope !== "mcp_eap_active_snapshot"
      || value.customerId !== null
      || !isNonEmptyString(value.relatedGroupId)
      || value.relatedGroupId !== value.representationId
      || group === null
      || countAsBigInt(group.bookingCount) !== countAsBigInt(value.totalReservations)
      || contactSummary.semantics !== "observed"
      || value.directEmails.length !== 0
      || value.directPhones.length !== 0
      || countAsBigInt(contactSummary.emailCount) !== BigInt(observedEmails.length)
      || countAsBigInt(contactSummary.phoneCount) !== BigInt(observedPhones.length)
      || (observedEmails.length === 1 && contactSummary.singleEmail !== observedEmails[0].value)
      || (observedPhones.length === 1 && contactSummary.singlePhone !== observedPhones[0].value)
    ) return null;
  } else {
    return null;
  }

  return value as CustomerWindowRepresentationSummaryV2;
}

function normalizeRepresentationBooking(value: unknown): CustomerWindowRepresentationBookingV2 | null {
  if (!isRecord(value)) return null;
  if (
    value.source !== "MCP_EAP"
    || !isSafeCount(value.sourceRowId)
    || !isNonEmptyString(value.bookingLinkId)
    || !isNonEmptyString(value.sourceCreatedAt)
    || !isNullableString(value.plannedArrivalAt)
    || !isNullableString(value.plannedDepartureAt)
    || !isSafeInteger(value.bookingStatus, 1)
    || !isSafeInteger(value.websiteSource, 1)
    || !isNonEmptyString(value.brand)
    || !isNonEmptyString(value.parking)
    || (value.paidAmount !== null && !isSafeNumeric(value.paidAmount))
    || (value.durationDays !== null && !isSafeInteger(value.durationDays))
    || typeof value.isPack !== "boolean"
    || !isNullableString(value.promotionCode)
    || !isNullableString(value.email)
    || !isNullableString(value.phone)
  ) return null;
  return value as CustomerWindowRepresentationBookingV2;
}

export function normalizeCustomerWindowRepresentationBookingsResponseV2(
  value: unknown,
): CustomerWindowRepresentationBookingsResponseV2 | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !isSafeCount(value.total)) return null;
  if (!isSafeInteger(value.page, 1) || !isSafeInteger(value.pageSize, 1) || value.pageSize > 100) return null;
  const items = value.items.map(normalizeRepresentationBooking);
  if (items.some((item) => item === null)) return null;
  return { ...value, items } as CustomerWindowRepresentationBookingsResponseV2;
}
