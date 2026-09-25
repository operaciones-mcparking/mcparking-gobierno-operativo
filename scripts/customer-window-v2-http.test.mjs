import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const route = readFileSync("src/app/api/orquestador/customer-window/customers/route.ts", "utf8");
const admin = readFileSync("src/lib/orquestador/supabase-admin.ts", "utf8");
const contractSource = readFileSync(
  "src/lib/customer-window/customer-representations-v2.ts",
  "utf8",
);
const contractJavaScript = ts.transpileModule(contractSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const contract = await import(
  `data:text/javascript;base64,${Buffer.from(contractJavaScript).toString("base64")}`
);

const confirmed = {
  contactSummary: {
    emailCount: 1,
    phoneCount: 1,
    semantics: "direct",
    singleEmail: "confirmed@example.com",
    singlePhone: "+56911111111",
  },
  customerId: "11111111-1111-4111-8111-111111111111",
  firstPurchaseAt: "2026-01-01T10:00:00",
  lastBookingAtInPeriod: "2026-09-21T10:00:00",
  lastPurchaseAt: "2026-09-21T10:00:00",
  metricScope: "all_confirmed_sources",
  relatedGroupId: null,
  representationId: "11111111-1111-4111-8111-111111111111",
  representationKey: "confirmed_customer:11111111-1111-4111-8111-111111111111",
  representationType: "confirmed_customer",
  reservationsInPeriod: 1,
  totalReservations: 3,
};
const related = {
  contactSummary: {
    emailCount: 1,
    phoneCount: 2,
    semantics: "observed",
    singleEmail: "observed@example.com",
    singlePhone: null,
  },
  customerId: null,
  firstPurchaseAt: "2026-01-02T10:00:00",
  lastBookingAtInPeriod: "2026-09-21T11:00:00",
  lastPurchaseAt: "2026-09-21T11:00:00",
  metricScope: "mcp_eap_active_snapshot",
  relatedGroupId: "a".repeat(64),
  representationId: "a".repeat(64),
  representationKey: `related_review:${"a".repeat(64)}`,
  representationType: "related_review",
  reservationsInPeriod: "1",
  totalReservations: "2",
};
const searchResult = {
  items: [{
    ...related,
    authoritySnapshotId: "33333333-3333-4333-8333-333333333333",
    displayEmail: "observed@example.com",
    displayPhone: "+56922222222",
    firstPurchaseAt: "2026-01-02T10:00:00",
    lastBookingAtInPeriod: null,
    matchSemantics: "historically_related",
    matchType: "historical_email",
    matchValueType: "email",
    reservationsInPeriod: 0,
  }],
  limit: 20,
  total: 1,
};
const relatedGroup = {
  bookingCount: "2",
  candidateCount: 1,
  conflictCount: 1,
  emailCount: 1,
  hasExactEmailPhoneCorroboration: true,
  hasSourceCustomerEmailCorroboration: false,
  phoneCount: 2,
  profileCount: 2,
  sourceCustomerCount: 1,
  v1BookingCount: 1,
  v2BookingCount: 1,
};
const confirmedSummary = {
  contactability: "direct",
  contactSummary: confirmed.contactSummary,
  customerId: confirmed.customerId,
  directEmails: ["confirmed@example.com"],
  directPhones: ["+56911111111"],
  firstPurchaseAt: confirmed.firstPurchaseAt,
  group: null,
  identityStatus: "confirmed",
  lastPurchaseAt: confirmed.lastPurchaseAt,
  metricScope: confirmed.metricScope,
  observedEmails: [],
  observedPhones: [],
  relatedGroupId: null,
  representationId: confirmed.representationId,
  representationKey: confirmed.representationKey,
  representationType: confirmed.representationType,
  totalReservations: confirmed.totalReservations,
};
const relatedSummary = {
  contactability: "review_required",
  contactSummary: related.contactSummary,
  customerId: null,
  directEmails: [],
  directPhones: [],
  firstPurchaseAt: related.firstPurchaseAt,
  group: relatedGroup,
  identityStatus: "related_review",
  lastPurchaseAt: related.lastPurchaseAt,
  metricScope: related.metricScope,
  observedEmails: [{
    bookingCount: 2,
    firstSeenAt: "2026-01-02T10:00:00",
    lastSeenAt: "2026-09-21T11:00:00",
    value: "observed@example.com",
  }],
  observedPhones: [
    { bookingCount: 1, firstSeenAt: "2026-01-02T10:00:00", lastSeenAt: "2026-01-02T10:00:00", value: "+56922222222" },
    { bookingCount: 1, firstSeenAt: "2026-09-21T11:00:00", lastSeenAt: "2026-09-21T11:00:00", value: "+56933333333" },
  ],
  relatedGroupId: related.relatedGroupId,
  representationId: related.representationId,
  representationKey: related.representationKey,
  representationType: related.representationType,
  totalReservations: related.totalReservations,
};
const booking = {
  bookingLinkId: "22222222-2222-4222-8222-222222222222",
  bookingStatus: 1,
  brand: "MCP",
  durationDays: 2,
  email: "observed@example.com",
  isPack: false,
  paidAmount: "37990.00",
  parking: "MCPARKING",
  plannedArrivalAt: "2026-09-22T10:00:00",
  plannedDepartureAt: "2026-09-24T10:00:00",
  phone: "+56922222222",
  promotionCode: null,
  source: "MCP_EAP",
  sourceCreatedAt: "2026-09-21T10:00:00",
  sourceRowId: "9007199254740993",
  websiteSource: 1,
};
const identityResolutionDetail = {
  snapshotId: "33333333-3333-4333-8333-333333333333",
  relatedGroupId: "a".repeat(64),
  relatedContacts: {
    emails: [
      { bookingCode: "MCP100", bookingCount: 2, firstSeenAt: "2026-01-01T10:00:00", lastSeenAt: "2026-02-01T10:00:00", observedAt: "2026-02-01T10:00:00", profileId: null, relation: "observed_in_group", relationReason: null, source: "MCP_EAP", sourceCount: 1, sourceRowId: 101, type: "email", value: "observed@example.com" },
      { bookingCode: "25LJL1009", bookingCount: 1, firstSeenAt: "2025-01-01T10:00:00Z", lastSeenAt: "2025-01-01T10:00:00Z", observedAt: "2025-01-01T10:00:00Z", profileId: null, relation: "historically_related", relationReason: "same_phone_history", source: "OKP", sourceCount: 1, sourceRowId: 202921, type: "email", value: "historical@example.com" },
    ],
    phones: [],
  },
  summary: { bookingCount: 2, candidateCount: 1, conflictCount: 1, emailCount: 1, phoneCount: 2, profileCount: 2, sourceCustomerCount: 1, v1BookingCount: 1, v2BookingCount: 1 },
  profiles: [
    { bookingCount: 1, firstBookingAt: "2026-01-01T10:00:00", lastBookingAt: "2026-01-01T10:00:00", mergedIntoProfileId: null, profileId: "44444444-4444-4444-8444-444444444444", resolverVersions: ["customer_identity_v1"], status: "active" },
    { bookingCount: 1, firstBookingAt: "2026-02-01T10:00:00", lastBookingAt: "2026-02-01T10:00:00", mergedIntoProfileId: "44444444-4444-4444-8444-444444444444", profileId: "55555555-5555-4555-8555-555555555555", resolverVersions: ["customer_identity_v2"], status: "merged" },
  ],
  members: [
    { linkStatus: "conflict", profileId: "44444444-4444-4444-8444-444444444444", reason: "contradictory_phone_email", relationshipType: "EXACT_EMAIL", resolverVersion: "customer_identity_v1", source: "MCP_EAP", sourceRowId: 101 },
    { linkStatus: "candidate", profileId: "55555555-5555-4555-8555-555555555555", reason: null, relationshipType: "EXACT_EMAIL", resolverVersion: "customer_identity_v2", source: "MCP_EAP", sourceRowId: 102 },
  ],
  events: [
    { createdAt: "2026-01-01T10:00:00Z", eventId: "66666666-6666-4666-8666-666666666666", eventType: "conflict", evidence: { contradictorySignals: true, emailsForPhone: 2, phonesForEmail: 1 }, profileId: "44444444-4444-4444-8444-444444444444", reason: "contradictory_phone_email", resolverVersion: "customer_identity_v1", source: "MCP_EAP", sourceRowId: 101 },
    { createdAt: "2026-02-01T10:00:00Z", eventId: "77777777-7777-4777-8777-777777777777", eventType: "candidate", evidence: {}, profileId: "55555555-5555-4555-8555-555555555555", reason: "review_profile_reused_exact", resolverVersion: "customer_identity_v2", source: "MCP_EAP", sourceRowId: 102 },
  ],
};

test("v2 HTTP actions validate dates and bounded pagination before customerId", () => {
  const listStart = route.indexOf('action === "list-by-period-v2"');
  const facetsStart = route.indexOf('action === "period-facets-v2"');
  const customerIdStart = route.indexOf("const customerId =");
  assert.ok(listStart > 0 && facetsStart > 0 && listStart < customerIdStart && facetsStart < customerIdStart);
  const listBlock = route.slice(listStart, facetsStart);
  assert.match(listBlock, /isValidDateValue\(from\)[\s\S]*isValidDateValue\(to\)[\s\S]*from > to/);
  assert.match(listBlock, /boundedInteger\(request\.nextUrl\.searchParams\.get\("page"\), 1, postgresIntegerMaximum\)/);
  assert.match(listBlock, /boundedInteger\(request\.nextUrl\.searchParams\.get\("pageSize"\), 25, 100\)/);
  assert.match(route.slice(facetsStart, route.indexOf('action === "search"')), /isValidDateValue\(from\)[\s\S]*from > to/);
});

test("helpers call only the versioned RPCs with exact parameter names", () => {
  assert.match(admin, /customer_window_v2_list_representations_by_purchase_period[\s\S]*p_from: input\.from[\s\S]*p_page: input\.page[\s\S]*p_page_size: input\.pageSize[\s\S]*p_to: input\.to/);
  assert.match(admin, /customer_window_v2_get_purchase_period_facets[\s\S]*p_from: input\.from[\s\S]*p_to: input\.to/);
  assert.match(admin, /normalizeCustomerWindowRepresentationListV2\(data\)/);
  assert.match(admin, /normalizeCustomerWindowPeriodFacetsV2\(data\)/);
  assert.match(admin, /customer_window_v2_get_representation_summary[\s\S]*p_representation_id: input\.representationId[\s\S]*p_representation_type: input\.representationType/);
  assert.match(admin, /customer_window_v2_list_representation_bookings[\s\S]*p_page: input\.page[\s\S]*p_page_size: input\.pageSize[\s\S]*p_representation_id: input\.representationId[\s\S]*p_representation_type: input\.representationType/);
  assert.match(admin, /customer_window_v2_get_identity_resolution_detail[\s\S]*p_related_group_id: relatedGroupId/);
  assert.match(admin, /customer_window_v2_search_representations_mcp_eap[\s\S]*p_email: input\.email[\s\S]*p_exact_identifier: input\.exactIdentifier[\s\S]*p_limit: input\.limit[\s\S]*p_numeric_identifier: input\.numericIdentifier[\s\S]*p_phone: input\.phone[\s\S]*p_plate: input\.plate/);
  assert.match(admin, /normalizeCustomerWindowRepresentationSearchV2\(data\)/);
});

test("v2 search contract accepts exact historical matches and rejects unsafe shapes", () => {
  assert.deepEqual(contract.normalizeCustomerWindowRepresentationSearchV2(searchResult), searchResult);
  const confirmedSearchResult = {
    ...searchResult,
    items: [{
      ...searchResult.items[0],
      ...confirmed,
      authoritySnapshotId: null,
      matchSemantics: "direct",
      matchType: "exact_email",
    }],
  };
  assert.deepEqual(contract.normalizeCustomerWindowRepresentationSearchV2(confirmedSearchResult), confirmedSearchResult);
  assert.equal(contract.normalizeCustomerWindowRepresentationSearchV2({ ...searchResult, items: [{ ...searchResult.items[0], authoritySnapshotId: null }] }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSearchV2({ ...confirmedSearchResult, items: [{ ...confirmedSearchResult.items[0], authoritySnapshotId: "33333333-3333-4333-8333-333333333333" }] }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSearchV2({ ...searchResult, limit: 21 }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSearchV2({ ...searchResult, items: [{ ...searchResult.items[0], matchSemantics: "direct" }] }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSearchV2({ ...searchResult, items: [searchResult.items[0], searchResult.items[0]] }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSearchV2({ ...searchResult, items: [{ ...searchResult.items[0], matchType: "fuzzy_email" }] }), null);
});

test("identity resolution validator accepts scoped partial evidence and merged profiles", () => {
  assert.deepEqual(contract.normalizeCustomerWindowIdentityResolutionDetailV2(identityResolutionDetail), identityResolutionDetail);
  const partialEvidence = structuredClone(identityResolutionDetail);
  partialEvidence.events[0].evidence = { matchedByEmail: true };
  assert.ok(contract.normalizeCustomerWindowIdentityResolutionDetailV2(partialEvidence));
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, relatedGroupId: "bad" }), null);
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, profiles: identityResolutionDetail.profiles.slice(0, 1) }), null);
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, members: identityResolutionDetail.members.slice(0, 1) }), null);
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, events: [{ ...identityResolutionDetail.events[0], evidence: { emailsForPhone: "bad" } }] }), null);
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, events: [{ ...identityResolutionDetail.events[0], evidence: { unexpectedKey: true } }] }), null);
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, relatedContacts: { emails: [{ ...identityResolutionDetail.relatedContacts.emails[0], relation: "confirmed" }], phones: [] } }), null);
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, relatedContacts: { emails: [{ ...identityResolutionDetail.relatedContacts.emails[0], profileId: "88888888-8888-4888-8888-888888888888" }], phones: [] } }), null);
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, relatedContacts: { emails: [identityResolutionDetail.relatedContacts.emails[0], identityResolutionDetail.relatedContacts.emails[0]], phones: [] } }), null);
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, relatedContacts: { emails: [{ ...identityResolutionDetail.relatedContacts.emails[0], relationReason: "same_phone_history" }], phones: [] } }), null);
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, relatedContacts: { emails: [{ ...identityResolutionDetail.relatedContacts.emails[1], relationReason: null }], phones: [] } }), null);
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, relatedContacts: { emails: [{ ...identityResolutionDetail.relatedContacts.emails[1], source: "OTHER" }], phones: [] } }), null);
  assert.equal(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, relatedContacts: { emails: [{ ...identityResolutionDetail.relatedContacts.emails[1], type: "phone" }], phones: [] } }), null);
  assert.ok(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, relatedContacts: { emails: [], phones: [] } }));
  assert.ok(contract.normalizeCustomerWindowIdentityResolutionDetailV2({ ...identityResolutionDetail, relatedContacts: { emails: [...identityResolutionDetail.relatedContacts.emails, { bookingCode: null, bookingCount: 0, firstSeenAt: null, lastSeenAt: null, observedAt: null, profileId: "55555555-5555-4555-8555-555555555555", relation: "historically_related", relationReason: "same_profile_history", source: null, sourceCount: 1, sourceRowId: null, type: "email", value: "second-historical@example.com" }], phones: [] } }));
});

test("list validator accepts confirmed and related representations and preserves bigint strings", () => {
  const result = contract.normalizeCustomerWindowRepresentationListV2({
    items: [confirmed, related], page: 1, pageSize: 25, total: "9007199254740993",
  });
  assert.ok(result);
  assert.equal(result.total, "9007199254740993");
  assert.equal(result.items[1].totalReservations, "2");
});

test("list validator rejects invalid XOR type scope key and payload structure", () => {
  const valid = { items: [confirmed], page: 1, pageSize: 25, total: 1 };
  assert.ok(contract.normalizeCustomerWindowRepresentationListV2(valid));
  assert.equal(contract.normalizeCustomerWindowRepresentationListV2({ ...valid, items: [{ ...confirmed, relatedGroupId: "x" }] }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationListV2({ ...valid, items: [{ ...confirmed, representationType: "other" }] }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationListV2({ ...valid, items: [{ ...confirmed, metricScope: "mcp_eap_active_snapshot" }] }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationListV2({ ...valid, items: [{ ...confirmed, representationKey: "bad" }] }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationListV2({ items: {}, page: 1, pageSize: 25, total: 1 }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationListV2({ ...valid, page: 0 }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationListV2({ ...valid, pageSize: 101 }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationListV2({ ...valid, total: Number.MAX_SAFE_INTEGER + 1 }), null);
});

test("facet validator requires every count and exact partitions without number coercion", () => {
  const valid = {
    confirmedBookingsInPeriod: "56",
    confirmedRepresentations: "56",
    relatedReviewBookingsInPeriod: "42",
    relatedReviewRepresentations: "42",
    totalBookingsInPeriod: "98",
    totalRepresentations: "98",
  };
  assert.deepEqual(contract.normalizeCustomerWindowPeriodFacetsV2(valid), valid);
  assert.equal(contract.normalizeCustomerWindowPeriodFacetsV2({ ...valid, totalRepresentations: "99" }), null);
  const { totalBookingsInPeriod, ...missing } = valid;
  assert.equal(contract.normalizeCustomerWindowPeriodFacetsV2(missing), null);
});

test("summary validator preserves confirmed and related semantics", () => {
  assert.deepEqual(contract.normalizeCustomerWindowRepresentationSummaryV2(confirmedSummary), confirmedSummary);
  assert.deepEqual(contract.normalizeCustomerWindowRepresentationSummaryV2(relatedSummary), relatedSummary);
  assert.equal(contract.normalizeCustomerWindowRepresentationSummaryV2({ ...confirmedSummary, relatedGroupId: "x" }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSummaryV2({ ...relatedSummary, contactability: "direct" }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSummaryV2({ ...relatedSummary, metricScope: "all_confirmed_sources" }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSummaryV2({
    ...relatedSummary,
    group: { ...relatedGroup, v2BookingCount: 0 },
  }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSummaryV2({
    ...confirmedSummary,
    contactSummary: { ...confirmedSummary.contactSummary, singleEmail: "other@example.com" },
  }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSummaryV2({
    ...relatedSummary,
    contactSummary: { ...relatedSummary.contactSummary, singleEmail: "other@example.com" },
  }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSummaryV2({
    ...confirmedSummary,
    contactSummary: { ...confirmedSummary.contactSummary, emailCount: 2, singleEmail: null },
    directEmails: ["confirmed@example.com", "confirmed@example.com"],
  }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationSummaryV2({
    ...relatedSummary,
    contactSummary: { ...relatedSummary.contactSummary, emailCount: 2, singleEmail: null },
    observedEmails: [relatedSummary.observedEmails[0], relatedSummary.observedEmails[0]],
  }), null);
});

test("bookings validator accepts safe operational rows and rejects broken payloads", () => {
  const valid = { items: [booking], page: 1, pageSize: 25, total: "9007199254740993" };
  assert.deepEqual(contract.normalizeCustomerWindowRepresentationBookingsResponseV2(valid), valid);
  assert.equal(contract.normalizeCustomerWindowRepresentationBookingsResponseV2({ ...valid, pageSize: 101 }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationBookingsResponseV2({ ...valid, items: [{ ...booking, source: "OKP" }] }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationBookingsResponseV2({ ...valid, items: [{ ...booking, paidAmount: {} }] }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationBookingsResponseV2({ ...valid, items: [{ ...booking, bookingStatus: "1" }] }), null);
  assert.equal(contract.normalizeCustomerWindowRepresentationBookingsResponseV2({ ...valid, items: [{ ...booking, email: 1 }] }), null);
});

test("v2 detail actions validate representation inputs before legacy customerId", () => {
  const summaryStart = route.indexOf('action === "summary-v2"');
  const identityStart = route.indexOf('action === "identity-resolution-detail-v2"');
  const bookingsStart = route.indexOf('action === "bookings-v2"');
  const searchV2Start = route.indexOf('action === "search-v2"');
  const searchStart = route.indexOf('action === "search"');
  const customerIdStart = route.indexOf("const customerId =");
  assert.ok(summaryStart > 0 && identityStart > summaryStart && bookingsStart > identityStart && searchV2Start > bookingsStart && searchStart > searchV2Start);
  assert.ok(summaryStart < customerIdStart && identityStart < customerIdStart && bookingsStart < customerIdStart);
  const summaryBlock = route.slice(summaryStart, identityStart);
  const identityBlock = route.slice(identityStart, bookingsStart);
  const bookingsBlock = route.slice(bookingsStart, searchStart);
  assert.match(summaryBlock, /isCustomerWindowRepresentationTypeV2\(representationType\)/);
  assert.match(summaryBlock, /!representationId/);
  assert.match(identityBlock, /representationType !== "related_review"/);
  assert.match(identityBlock, /\^\[0-9a-f\]\{64\}\$/);
  assert.match(bookingsBlock, /boundedInteger[\s\S]*pageSize[\s\S]*100/);
  assert.match(bookingsBlock, /isCustomerWindowRepresentationTypeV2\(representationType\)/);
  const searchV2Block = route.slice(searchV2Start, searchStart);
  assert.match(searchV2Block, /buildCustomerWindowSearchTermsV2\(query\)/);
  assert.match(searchV2Block, /boundedInteger[\s\S]*limit[\s\S]*20/);
  assert.match(searchV2Block, /searchCustomerWindowV2Representations/);
});

test("route keeps legacy actions and emits only generic safe v2 errors", () => {
  for (const action of ["criteria", "period-metrics", "list-by-period", "search-v2", "search", "summary", "economics", "signals", "identities", "bookings"]) {
    assert.match(route, new RegExp(`action === "${action}"`));
  }
  assert.match(route, /No fue posible consultar representaciones por periodo\./);
  assert.match(route, /No fue posible consultar las facetas del periodo\./);
  assert.match(route, /No fue posible consultar la representacion\./);
  assert.match(route, /No fue posible consultar el historial de la representacion\./);
  assert.match(route, /No fue posible consultar el detalle de resolucion de identidad\./);
  assert.match(route, /No fue posible buscar representaciones\./);
  const v2Errors = [
    "Listado de representaciones por periodo invalido.",
    "No fue posible consultar representaciones por periodo.",
    "Facetas de representaciones por periodo invalidas.",
    "No fue posible consultar las facetas del periodo.",
    "Representacion invalida.",
    "No fue posible consultar la representacion.",
    "Historial de representacion invalido.",
    "No fue posible consultar el historial de la representacion.",
    "Detalle de resolucion de identidad invalido.",
    "No fue posible consultar el detalle de resolucion de identidad.",
  ].join(" ");
  assert.doesNotMatch(v2Errors, /snapshot UUID|SECURITY DEFINER|Supabase|SQLSTATE|stack/i);
});
