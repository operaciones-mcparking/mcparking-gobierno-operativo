import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  certifiedIncompleteEvent,
  classifyIncomplete,
  classifyRecoveryPurchase,
  customerPurchaseEvent,
  eventEvidence,
  eventKey,
  parseArgs,
  preferredEvent,
  processTransitions,
  recordCandidate,
  recoveryStateEvent,
  run,
  safeSummary,
  validateEvent,
} from "./customer-commercial-events-mcp-eap-v1-materialize.mjs";

const migrationPath = "supabase/migrations/20260924120000_add_customer_commercial_events_mcp_eap_v1.sql";
const harnessPath = "supabase/debug/customer_commercial_events_mcp_eap_v1_reversible_test.sql";
const materializerPath = "scripts/customer-commercial-events-mcp-eap-v1-materialize.mjs";
const migration = readFileSync(migrationPath, "utf8");
const harness = readFileSync(harnessPath, "utf8");
const materializer = readFileSync(materializerPath, "utf8");

function embeddedMigration() {
  const startMarker = "-- BEGIN EMBEDDED MIGRATION";
  const endMarker = "-- END EMBEDDED MIGRATION";
  const start = harness.indexOf(startMarker) + startMarker.length;
  const end = harness.indexOf(endMarker, start);
  assert.ok(start >= startMarker.length && end > start);
  return harness.slice(start, end).trim();
}

test("migration installs the identity-independent V1 fact contract", () => {
  assert.match(migration, /create table public\.customer_commercial_events \(/);
  for (const eventType of [
    "purchase",
    "booking_cancelled",
    "payment_review",
    "checkout_abandoned",
    "checkout_cancelled",
  ]) assert.match(migration, new RegExp(`'${eventType}'`));
  assert.doesNotMatch(migration, /booking_attempt/);
  assert.doesNotMatch(migration, /customer_commercial_event_(?:identity|journey)_links/);
  assert.doesNotMatch(migration, /\b(customer_id|profile_id|related_group_id|email|phone|plate|raw_payload)\b/i);
});

test("natural identity, time authority, and monetary contracts are constrained", () => {
  assert.match(migration, /unique \(event_key\)/);
  assert.match(migration, /unique \(source, source_entity, source_record_key, event_type\)/);
  assert.match(migration, /event_key = source \|\| ':' \|\| source_entity \|\| ':' \|\| source_record_key \|\| ':' \|\| event_type/);
  assert.match(migration, /event_at = source_event_at at time zone 'America\/Santiago'/);
  assert.match(migration, /event_time_authority in \('source_event_at', 'observation_only'\)/);
  assert.match(migration, /amount is null and amount_kind is null and currency is null/);
  assert.match(migration, /amount is not null and amount_kind is not null and currency = 'CLP'/);
  assert.match(migration, /amount is null or amount >= 0/);
});

test("observation-only evidence is limited to certified current states or transitions", () => {
  assert.match(migration, /constraint customer_commercial_events_observation_evidence_check/);
  assert.match(migration, /event_time_authority <> 'observation_only'/);
  assert.match(migration, /source_change_id is not null/);
  assert.match(migration, /event_type = 'booking_cancelled' and source_status = 2/);
  assert.match(migration, /event_type = 'payment_review'[\s\S]*source_status = 9[\s\S]*source_paying_status = '1'/);
  assert.match(migration, /constraint customer_commercial_events_source_change_time_check/);
  assert.match(migration, /source_change_id is null[\s\S]*or event_time_authority = 'observation_only'/);
});

test("bulk RPC is MCP/EAP-only, server-derived, controlled, and least privilege", () => {
  assert.match(migration, /coalesce\(item\.value ->> 'source', ''\) <> 'MCP_EAP'/);
  assert.match(migration, /event_source_not_supported/);
  assert.match(migration, /then source_event_at at time zone 'America\/Santiago'/);
  assert.match(migration, /on conflict \(source, source_entity, source_record_key, event_type\) do update/);
  assert.match(migration, /excluded\.event_time_authority = 'source_event_at'[\s\S]*target\.event_time_authority = 'observation_only'/);
  assert.match(migration, /excluded\.event_time_authority = target\.event_time_authority[\s\S]*excluded\.observed_at > target\.observed_at/);
  assert.match(migration, /excluded\.observed_at = target\.observed_at[\s\S]*row\([\s\S]*\) is distinct from row\(/);
  assert.doesNotMatch(migration, /excluded\.observed_at >= target\.observed_at/);
  assert.match(migration, /source_change_id = case[\s\S]*excluded\.event_time_authority[\s\S]*target\.event_time_authority[\s\S]*= 'source_event_at' then null/);
  assert.match(migration, /promotes canonical source time, then refreshes newer or effectively changed same-authority evidence/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /revoke all on table public\.customer_commercial_events[\s\S]*public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.customer_commercial_events_upsert_v1_m2m\(jsonb\)[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete).*customer_commercial_events/i);
});

test("reversible harness embeds the exact migration and rolls it back", () => {
  assert.equal(embeddedMigration(), migration.trim());
  assert.match(harness, /^begin;/m);
  assert.match(harness, /rollback;[\s\S]*reversible_cleanup_ok/);
  assert.doesNotMatch(harness, /\bcommit\s*;/i);
  for (const eventType of ["purchase", "booking_cancelled", "payment_review", "checkout_abandoned", "checkout_cancelled"]) {
    assert.match(harness, new RegExp(`'event_type', '${eventType}'`));
  }
  assert.match(harness, /same source record with distinct event types did not coexist/);
  assert.match(harness, /same-class refresh or row-change replay failed/);
  assert.match(harness, /purchase observation_only without source_change_id unexpectedly accepted/);
  assert.match(harness, /source_change_id with source_event_at unexpectedly accepted/);
  assert.match(harness, /identical same-time replay performed an update/);
  assert.match(harness, /same-time effective enrichment was not applied/);
  assert.match(harness, /newer observation was not applied/);
  assert.match(harness, /older observation overwrote newer state/);
  assert.match(harness, /observation-only purchase was not promoted to certified source time/);
  assert.match(harness, /newer observation-only evidence degraded certified source time/);
  assert.match(harness, /same-time certified promotion was not applied/);
  assert.match(harness, /negative amount unexpectedly accepted/);
  assert.match(harness, /null amount mismatch unexpectedly accepted/);
});

test("source classifiers retain exact event semantics", () => {
  assert.equal(classifyRecoveryPurchase({ booking_status: 1 }), "purchase");
  assert.equal(classifyRecoveryPurchase({ booking_status: 8 }), "purchase");
  assert.equal(classifyRecoveryPurchase({ booking_status: 2 }), "booking_cancelled");
  assert.equal(classifyRecoveryPurchase({ booking_status: 9, paying_status: "1" }), "payment_review");
  assert.equal(classifyRecoveryPurchase({ booking_status: 9, paying_status: "0" }), null);
  assert.equal(classifyIncomplete({ type: "abandoned" }), "checkout_abandoned");
  assert.equal(classifyIncomplete({ type: "canceled" }), "checkout_cancelled");
});

test("purchase authority and amounts come from the certified source fields", () => {
  const event = customerPurchaseEvent({
    source_row_id: 42,
    source_created_at: "2026-09-24 10:00:00",
    booking_paid: "0",
    source_total_amount: "1000",
    booking_status: 1,
    paying_status: 1,
    source_synced_at: "2026-09-24T13:00:00Z",
  });
  assert.equal(eventKey(event), "MCP_EAP:mcp_Buchungen:42:purchase");
  assert.equal(event.amount, 0);
  assert.equal(event.amount_kind, "paid_amount");
  assert.equal(event.currency, "CLP");
  assert.equal(event.source_total_amount, 1000);
  assert.equal(event.source_event_at, "2026-09-24 10:00:00");
  assert.equal(event.event_time_authority, "source_event_at");
  assert.equal(validateEvent(event), null);
});

test("transitions preserve multiple event types without inventing commercial time", () => {
  const row = {
    source_booking_id: "77",
    previous_price: 8000,
    current_booking_paid: 8000,
    previous_booking_status: 9,
    previous_paying_status: "1",
    current_booking_status: 1,
    current_paying_status: "1",
    created_at: "2026-09-24T14:00:00Z",
  };
  const review = recoveryStateEvent(row, "payment_review", { state: "previous", sourceChangeId: "a", observedAt: row.created_at });
  const purchase = recoveryStateEvent(row, "purchase", { state: "change_current", sourceChangeId: "a", observedAt: row.created_at });
  assert.notEqual(eventKey(review), eventKey(purchase));
  assert.equal(review.event_at, null);
  assert.equal(review.source_event_at, null);
  assert.equal(review.event_time_authority, "observation_only");
  assert.equal(purchase.event_time_authority, "observation_only");
});

test("row-change processing covers transitions and same-class convergence", async () => {
  const purchases = [1, 2, 3, 4].map((number) => ({
    id: `entity-${number}`,
    source_booking_id: String(700 + number),
    price: 9000,
    booking_paid: 9000,
    booking_status: 2,
    paying_status: "1",
    row_hash: String(number).repeat(64),
    created_at: "2026-09-24T14:00:00Z",
  }));
  const transition = (number, previous, current) => ({
    id: `change-${number}`,
    source: "purchases",
    operation: "updated",
    entity_id: `entity-${number}`,
    created_at: `2026-09-24T14:0${number}:00Z`,
    previous_booking_status: previous.status,
    previous_paying_status: previous.paying ?? "1",
    previous_is_valid_purchase: previous.valid ?? false,
    previous_price: 9000,
    previous_booking_paid: 9000,
    previous_row_hash: String(number).repeat(64),
    current_booking_status: current.status,
    current_paying_status: current.paying ?? "1",
    current_is_valid_purchase: current.valid ?? false,
    current_price: 9000,
    current_booking_paid: 9000,
    current_row_hash: String(number).repeat(64),
  });
  const changes = [
    transition(1, { status: 9 }, { status: 1 }),
    transition(2, { status: 9 }, { status: 2 }),
    transition(3, { status: 1 }, { status: 2 }),
    transition(4, { status: 2 }, { status: 2 }),
  ];
  const tables = { recovery_bookings_import: purchases, recovery_incomplete_bookings_import: [], recovery_import_row_changes: changes };
  const client = { page: async (table) => tables[table] };
  const summary = safeSummary();

  await processTransitions(client, { apply: false, evidence: eventEvidence(), pending: new Map(), summary });

  assert.equal(summary.transition_events, 7);
  assert.equal(summary.same_class_updates, 1);
  assert.equal(summary.candidateCounts.candidate_purchase_transition, 2);
  assert.equal(summary.candidateCounts.candidate_booking_cancelled_transition, 3);
  assert.equal(summary.candidateCounts.candidate_payment_review_transition, 2);
});

test("legacy incomplete timestamps fail closed while certified rows materialize", () => {
  assert.equal(certifiedIncompleteEvent({ type: "abandoned", form_datetime: "2026-09-24T12:00:00Z" }), null);
  const event = certifiedIncompleteEvent({
    source_id: "88",
    type: "canceled",
    form_datetime: "2026-09-24T12:00:00Z",
    source_event_at: "2026-09-24 09:00:00",
    timestamp_parser_version: "backend_incomplete_form_datetime_santiago_v1",
    quoted_amount: "0",
    updated_at_source: "2026-09-24T12:30:00Z",
  });
  assert.equal(event.event_type, "checkout_cancelled");
  assert.equal(event.amount, 0);
  assert.equal(event.amount_kind, "quoted_amount");
  assert.equal(validateEvent(event), null);
});

test("dry-run counters count unique facts and expose duplicate evidence", () => {
  const event = recoveryStateEvent({ source_booking_id: "99", price: 100, booking_status: 2, created_at: "2026-09-24T12:00:00Z" }, "booking_cancelled");
  const summary = safeSummary();
  const evidence = eventEvidence();
  assert.equal(recordCandidate(summary, event, evidence, "current"), true);
  assert.equal(recordCandidate(summary, event, evidence, "transition"), true);
  assert.equal(summary.candidateCounts.candidate_booking_cancelled_current, 1);
  assert.equal(summary.candidateCounts.candidate_booking_cancelled_transition, 1);
  assert.equal(summary.candidateCounts.candidate_booking_cancelled_unique, 1);
  assert.equal(summary.duplicateEvidence.duplicate_event_evidence_total, 1);
  assert.equal(summary.duplicateEvidence.duplicate_event_natural_keys, 1);
  assert.equal(summary.duplicateEvidence.incompatible_event_key_collisions, 0);
});

test("candidate precedence is authority-first, then observed time, then a stable fingerprint", () => {
  const base = recoveryStateEvent({
    source_booking_id: "701",
    price: 1000,
    booking_status: 2,
    created_at: "2026-09-24T14:00:00Z",
  }, "booking_cancelled");
  const later = { ...base, observed_at: "2026-09-24T15:00:00Z", source_row_hash: "b".repeat(64) };
  assert.deepEqual(preferredEvent(base, later), later);

  const canonical = customerPurchaseEvent({
    source_row_id: "701",
    source_created_at: "2026-09-24 10:00:00",
    booking_paid: 1000,
    booking_status: 1,
    source_synced_at: "2026-09-24T13:00:00Z",
  });
  const transition = recoveryStateEvent({
    source_booking_id: "701",
    current_booking_paid: 1000,
    current_booking_status: 1,
    created_at: "2026-09-24T16:00:00Z",
  }, "purchase", {
    state: "change_current",
    sourceChangeId: "11111111-1111-4111-8111-111111111111",
    observedAt: "2026-09-24T16:00:00Z",
  });
  assert.deepEqual(preferredEvent(transition, canonical), canonical);
  assert.deepEqual(preferredEvent(canonical, transition), canonical);

  const tiedLeft = { ...base, source_row_hash: "1".repeat(64) };
  const tiedRight = { ...base, source_row_hash: "2".repeat(64) };
  assert.deepEqual(preferredEvent(tiedLeft, tiedRight), preferredEvent(tiedRight, tiedLeft));
});

test("apply batches contain one deterministic winner per event key", async () => {
  const tables = {
    customer_source_bookings_mcp_eap: [{
      source_row_id: "701",
      source_created_at: "2026-09-24 10:00:00",
      booking_paid: 1000,
      source_total_amount: 1000,
      booking_status: 1,
      paying_status: 1,
      row_hash: "a".repeat(64),
      source_synced_at: "2026-09-24T13:00:00Z",
      updated_at: "2026-09-24T13:00:00Z",
    }],
    recovery_bookings_import: [{
      id: "recovery-701",
      source_booking_id: "701",
      price: 1000,
      booking_paid: 1000,
      booking_status: 1,
      paying_status: "1",
      is_valid_purchase: true,
      row_hash: "b".repeat(64),
      created_at: "2026-09-24T12:00:00Z",
    }],
    recovery_incomplete_bookings_import: [],
    recovery_import_row_changes: [{
      id: "11111111-1111-4111-8111-111111111111",
      source: "purchases",
      operation: "updated",
      entity_id: "recovery-701",
      created_at: "2026-09-24T16:00:00Z",
      previous_booking_status: 9,
      previous_paying_status: "1",
      previous_is_valid_purchase: false,
      previous_price: 1000,
      previous_booking_paid: 1000,
      previous_row_hash: "c".repeat(64),
      current_booking_status: 1,
      current_paying_status: "1",
      current_is_valid_purchase: true,
      current_price: 1000,
      current_booking_paid: 1000,
      current_row_hash: "d".repeat(64),
    }],
    recovery_import_batches: [],
  };
  const batches = [];
  const client = {
    page: async (table) => tables[table] ?? [],
    upsert: async (events) => {
      batches.push(events);
      return { ok: true, affectedEvents: events.length };
    },
  };

  const result = await run({ mode: "backfill", apply: true }, { client, now: deterministicNow() });
  const events = batches.flat();
  const keys = events.map(eventKey);
  const purchase = events.find((event) => eventKey(event) === "MCP_EAP:mcp_Buchungen:701:purchase");

  assert.equal(keys.length, new Set(keys).size);
  assert.ok(batches.every((batch) => batch.length === new Set(batch.map(eventKey)).size));
  assert.equal(purchase.event_time_authority, "source_event_at");
  assert.equal(purchase.source_change_id, null);
  assert.equal(result.candidateCounts.candidate_purchase_current, 1);
  assert.equal(result.candidateCounts.candidate_purchase_transition, 1);
  assert.equal(result.candidateCounts.candidate_purchase_unique, 1);
  assert.equal(result.duplicateEvidence.duplicate_event_evidence_total, 1);
  assert.equal(result.finalUniqueEvents, 2);
  assert.equal(result.pendingDuplicateEventKeys, 0);
  assert.equal(result.plannedEvents, events.length);
  assert.equal(result.plannedBatchCount, 1);
  assert.equal(result.plannedMaxBatchSize, events.length);
  assert.equal(result.plannedLastBatchSize, events.length);
});

function diagnosticTables(extraPurchases = []) {
  return {
    customer_source_bookings_mcp_eap: [{
      id: "source-1",
      source_row_id: "100",
      source_created_at: "2026-09-24 10:00:00",
      booking_paid: 1000,
      source_total_amount: 1000,
      booking_status: 1,
      paying_status: 1,
      row_hash: "a".repeat(64),
      source_synced_at: "2026-09-24T13:00:00Z",
      updated_at: "2026-09-24T13:00:00Z",
    }, ...extraPurchases],
    recovery_bookings_import: [{
      id: "recovery-1",
      batch_id: "batch-1",
      source_booking_id: "200",
      price: 2000,
      booking_paid: null,
      booking_status: 2,
      paying_status: "1",
      is_valid_purchase: false,
      row_hash: "b".repeat(64),
      created_at: "2026-09-24T13:10:00Z",
    }],
    recovery_incomplete_bookings_import: [{
      id: "cart-1",
      batch_id: "batch-2",
      source_id: "300",
      type: "abandoned",
      form_datetime: "2026-09-24T10:00:00Z",
      row_hash: "c".repeat(64),
      created_at: "2026-09-24T13:20:00Z",
      created_at_source: "2026-09-24T12:00:00Z",
      updated_at_source: "2026-09-24T12:30:00Z",
    }],
    recovery_import_row_changes: [{
      id: "change-1",
      source: "purchases",
      operation: "updated",
      entity_id: "recovery-1",
      created_at: "2026-09-24T13:30:00Z",
      previous_booking_status: 9,
      previous_paying_status: "1",
      previous_is_valid_purchase: false,
      previous_price: 2000,
      current_booking_status: 2,
      current_paying_status: "1",
      current_is_valid_purchase: false,
      current_price: 2000,
    }],
    recovery_import_batches: [
      { id: "batch-1", created_at: "2026-09-24T12:00:00Z", confirmed_at: "2026-09-24T12:05:00Z" },
      { id: "batch-2", created_at: "2026-09-24T12:10:00Z", confirmed_at: "2026-09-24T12:15:00Z" },
    ],
  };
}

function mockClient(tables) {
  return {
    page: async (table) => tables[table] ?? [],
    upsert: async () => { throw new Error("dry-run must not upsert"); },
  };
}

function pagedClient(tables, batches = null) {
  return {
    page: async (table, _select, from, filter) => {
      let rows = tables[table] ?? [];
      if (filter) {
        const allowed = new Set(filter.values.map(String));
        rows = rows.filter((row) => allowed.has(String(row[filter.column])));
      }
      return rows.slice(from, from + 1000);
    },
    upsert: async (events) => {
      if (!batches) throw new Error("dry-run must not upsert");
      batches.push(events);
      return { ok: true, affectedEvents: events.length };
    },
  };
}

function deterministicNow() {
  const values = [Date.parse("2026-09-24T14:00:00Z"), Date.parse("2026-09-24T14:00:00.250Z")];
  return () => values.shift();
}

test("dry-run emits one capturedAt, source watermarks, reconciled breakdown, and explicit exclusions", async () => {
  const result = await run({ mode: "dry-run", apply: false }, {
    client: mockClient(diagnosticTables()),
    now: deterministicNow(),
  });

  assert.equal(result.capturedAt, "2026-09-24T14:00:00.000Z");
  assert.equal(result.durationMs, 250);
  assert.deepEqual(result.consistency, {
    mode: "per_source_high_water_marks",
    repeatableRead: false,
    reason: "postgrest_pages_use_independent_transactions",
  });
  assert.equal(result.highWaterMarks.customer_source_bookings_mcp_eap.maxSourceRowId, "100");
  assert.equal(result.highWaterMarks.recovery_bookings_import.latestBatchId, "batch-1");
  assert.equal(result.highWaterMarks.recovery_import_row_changes.lastChangeId, "change-1");
  assert.equal(result.highWaterMarks.recovery_incomplete_bookings_import.maxSourceId, "300");
  assert.equal(result.candidateCounts.candidate_purchase_current, 1);
  assert.equal(result.candidateCounts.candidate_booking_cancelled_current, 1);
  assert.equal(result.candidateCounts.candidate_booking_cancelled_transition, 1);
  assert.equal(result.candidateCounts.candidate_booking_cancelled_unique, 1);
  assert.equal(result.candidateCounts.candidate_payment_review_transition, 1);
  assert.equal(result.duplicateEvidence.duplicate_event_evidence_total, 1);
  assert.equal(result.duplicateEvidence.duplicate_event_natural_keys, 1);
  assert.equal(result.excludedCounts.incomplete_total, 1);
  assert.equal(result.excludedCounts.incomplete_timestamp_certified, 0);
  assert.equal(result.excludedCounts.incomplete_timestamp_excluded, 1);
  assert.equal(result.exclusions.incomplete_uncertified_timestamp, 1);
  assert.equal(result.excludedCounts.total, result.exclusions.total);
  assert.deepEqual(result.writeCounts, {
    upserted: 0,
    inserted: null,
    updated: null,
    skipped: 0,
    insertUpdateBreakdownAvailable: false,
  });
  assert.equal(result.plannedEvents, 3);
  assert.equal(result.plannedBatchCount, 1);
  assert.equal(result.plannedMaxBatchSize, 3);
  assert.equal(result.plannedLastBatchSize, 3);
  assert.equal(result.pendingDuplicateEventKeys, 0);
});

test("dry-run and apply build the same deterministic winners without dry-run writes", async () => {
  const tables = diagnosticTables();
  const dryPlan = [];
  const applyPlan = [];
  const batches = [];
  const dry = await run({ mode: "dry-run", apply: false }, {
    client: pagedClient(tables),
    now: deterministicNow(),
    onPlan: (events) => dryPlan.push(...events),
  });
  const applied = await run({ mode: "backfill", apply: true }, {
    client: pagedClient(tables, batches),
    now: deterministicNow(),
    onPlan: (events) => applyPlan.push(...events),
  });

  assert.deepEqual(dryPlan, applyPlan);
  assert.deepEqual(dryPlan.map(eventKey), [...new Set(dryPlan.map(eventKey))]);
  assert.equal(dry.plannedEvents, applied.plannedEvents);
  assert.equal(dry.pendingDuplicateEventKeys, 0);
  assert.equal(batches.flat().length, applied.plannedEvents);
});

test("dry-run reports exact batch geometry above the RPC limit", async () => {
  const rows = Array.from({ length: 2001 }, (_, index) => ({
    source_row_id: String(index + 1),
    source_created_at: "2026-09-24 10:00:00",
    booking_paid: 1000,
    source_total_amount: 1000,
    booking_status: 1,
    paying_status: 1,
    row_hash: String(index).padStart(64, "0"),
    source_synced_at: "2026-09-24T13:00:00Z",
    updated_at: "2026-09-24T13:00:00Z",
  }));
  const result = await run({ mode: "dry-run", apply: false }, {
    client: pagedClient({
      customer_source_bookings_mcp_eap: rows,
      recovery_bookings_import: [],
      recovery_incomplete_bookings_import: [],
      recovery_import_row_changes: [],
      recovery_import_batches: [],
    }),
    now: deterministicNow(),
  });

  assert.equal(result.plannedEvents, 2001);
  assert.equal(result.plannedBatchCount, 3);
  assert.equal(result.plannedMaxBatchSize, 1000);
  assert.equal(result.plannedLastBatchSize, 1);
  assert.equal(result.pendingDuplicateEventKeys, 0);
});

test("live source growth changes only affected counts and preserves summary invariants", async () => {
  const additionalPurchase = {
    id: "source-2",
    source_row_id: "101",
    source_created_at: "2026-09-24 10:05:00",
    booking_paid: 1500,
    source_total_amount: 1500,
    booking_status: 1,
    paying_status: 1,
    row_hash: "d".repeat(64),
    source_synced_at: "2026-09-24T13:40:00Z",
    updated_at: "2026-09-24T13:40:00Z",
  };
  const baseline = await run({ mode: "dry-run", apply: false }, { client: mockClient(diagnosticTables()), now: deterministicNow() });
  const grown = await run({ mode: "dry-run", apply: false }, { client: mockClient(diagnosticTables([additionalPurchase])), now: deterministicNow() });
  assert.equal(grown.candidateCounts.candidate_purchase_current, baseline.candidateCounts.candidate_purchase_current + 1);
  assert.equal(grown.candidateCounts.candidate_purchase_unique, baseline.candidateCounts.candidate_purchase_unique + 1);
  assert.equal(grown.duplicateEvidence.duplicate_event_evidence_total, baseline.duplicateEvidence.duplicate_event_evidence_total);
  assert.equal(grown.exclusions.total, grown.excludedCounts.total);
  assert.equal(grown.highWaterMarks.customer_source_bookings_mcp_eap.maxSourceRowId, "101");
});

test("incremental converges same-class purchase states and valid inserts from targeted current rows", async () => {
  const purchases = [
    { id: "10000000-0000-4000-8000-000000000001", source_booking_id: "501", price: 25000, booking_status: 2, paying_status: "1", is_valid_purchase: false, parking_code: "P2", row_hash: "b".repeat(64), created_at: "2026-09-24T10:00:00Z" },
    { id: "10000000-0000-4000-8000-000000000002", source_booking_id: "502", price: 35000, booking_status: 9, paying_status: "1", is_valid_purchase: false, parking_code: "P3", row_hash: "c".repeat(64), created_at: "2026-09-24T10:00:00Z" },
    { id: "10000000-0000-4000-8000-000000000003", source_booking_id: "503", price: 13000, booking_paid: 12000, booking_status: 1, paying_status: "1", is_valid_purchase: true, parking_code: "P4", row_hash: "d".repeat(64), created_at: "2026-09-24T10:00:00Z" },
    { id: "10000000-0000-4000-8000-000000000004", source_booking_id: "504", price: 14000, booking_paid: 14000, booking_status: 8, paying_status: "1", is_valid_purchase: true, parking_code: "P5", row_hash: "e".repeat(64), created_at: "2026-09-24T10:00:00Z" },
    { id: "10000000-0000-4000-8000-000000000005", source_booking_id: "505", price: 45000, booking_status: 2, paying_status: "1", is_valid_purchase: false, parking_code: "P6", row_hash: "f".repeat(64), created_at: "2026-09-24T10:00:00Z" },
  ];
  const change = (number, values) => ({
    id: `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    source: "purchases",
    operation: "updated",
    entity_id: purchases[number - 1].id,
    created_at: `2026-09-24T14:0${number}:00Z`,
    previous_row_hash: "a".repeat(64),
    current_row_hash: purchases[number - 1].row_hash,
    ...values,
  });
  const changes = [
    change(1, { previous_booking_status: 2, current_booking_status: 2, previous_paying_status: "1", current_paying_status: "1", previous_price: 20000, current_price: 25000 }),
    change(2, { previous_booking_status: 9, current_booking_status: 9, previous_paying_status: "1", current_paying_status: "1", previous_price: 30000, current_price: 35000 }),
    change(3, { previous_booking_status: 1, current_booking_status: 1, previous_is_valid_purchase: true, current_is_valid_purchase: true, previous_booking_paid: 10000, current_booking_paid: 12000, previous_price: 13000, current_price: 13000 }),
    change(4, { previous_booking_status: 1, current_booking_status: 8, previous_is_valid_purchase: true, current_is_valid_purchase: true, previous_booking_paid: 14000, current_booking_paid: 14000, previous_price: 14000, current_price: 14000 }),
    { ...change(5, { current_booking_status: 2, current_paying_status: "1", current_price: 45000 }), operation: "inserted" },
  ];
  const tables = {
    customer_source_bookings_mcp_eap: [],
    recovery_bookings_import: purchases,
    recovery_incomplete_bookings_import: [],
    recovery_import_row_changes: changes,
    recovery_import_batches: [],
  };
  const firstPlan = [];
  const secondPlan = [];
  const first = await run({ mode: "incremental", apply: false }, {
    client: pagedClient(tables), now: deterministicNow(), onPlan: (events) => firstPlan.push(...events),
  });
  await run({ mode: "incremental", apply: false }, {
    client: pagedClient(tables), now: deterministicNow(), onPlan: (events) => secondPlan.push(...events),
  });

  assert.equal(first.same_class_updates, 4);
  assert.equal(first.plannedEvents, 5);
  assert.equal(first.pendingDuplicateEventKeys, 0);
  assert.equal(firstPlan.find((event) => event.source_record_key === "501").amount, 25000);
  assert.equal(firstPlan.find((event) => event.source_record_key === "502").amount, 35000);
  assert.equal(firstPlan.find((event) => event.source_record_key === "503").amount, 12000);
  assert.equal(firstPlan.find((event) => event.source_record_key === "504").event_type, "purchase");
  assert.equal(firstPlan.find((event) => event.source_record_key === "505").event_type, "booking_cancelled");
  assert.ok(firstPlan.every((event) => event.source_change_id && event.observed_at));
  assert.deepEqual(firstPlan, secondPlan);
});

test("incremental loads only affected IDs and canonical purchase evidence wins", async () => {
  const recoveryId = "30000000-0000-4000-8000-000000000001";
  const changeId = "40000000-0000-4000-8000-000000000001";
  const tables = {
    recovery_import_row_changes: [{
      id: changeId, source: "purchases", operation: "updated", entity_id: recoveryId,
      created_at: "2026-09-24T16:00:00Z", previous_booking_status: 9,
      current_booking_status: 1, previous_paying_status: "1", current_paying_status: "1",
      previous_is_valid_purchase: false, current_is_valid_purchase: true,
      previous_price: 1000, current_price: 1000, current_booking_paid: 1000,
      previous_row_hash: "1".repeat(64), current_row_hash: "2".repeat(64),
    }],
    recovery_bookings_import: [{
      id: recoveryId, source_booking_id: "701", price: 1000, booking_paid: 1000,
      booking_status: 1, paying_status: "1", is_valid_purchase: true,
      row_hash: "2".repeat(64), created_at: "2026-09-24T12:00:00Z",
    }, {
      id: "30000000-0000-4000-8000-000000000099", source_booking_id: "999",
      price: 999, booking_status: 2, row_hash: "9".repeat(64), created_at: "2026-09-24T12:00:00Z",
    }],
    recovery_incomplete_bookings_import: [],
    customer_source_bookings_mcp_eap: [{
      source_row_id: "701", source_created_at: "2026-09-24 10:00:00", booking_paid: 1000,
      source_total_amount: 1000, booking_status: 1, paying_status: 1,
      row_hash: "a".repeat(64), source_synced_at: "2026-09-24T13:00:00Z",
      updated_at: "2026-09-24T13:00:00Z",
    }],
    recovery_import_batches: [],
  };
  const filters = [];
  const baseClient = pagedClient(tables);
  const client = {
    ...baseClient,
    page: async (table, select, from, filter) => {
      if (filter) filters.push({ table, column: filter.column, values: [...filter.values] });
      return baseClient.page(table, select, from, filter);
    },
  };
  const plan = [];
  const result = await run({ mode: "incremental", apply: false }, {
    client, now: deterministicNow(), onPlan: (events) => plan.push(...events),
  });
  const purchase = plan.find((event) => event.source_record_key === "701" && event.event_type === "purchase");

  assert.equal(result.pendingDuplicateEventKeys, 0);
  assert.equal(purchase.event_time_authority, "source_event_at");
  assert.equal(purchase.source_change_id, null);
  assert.ok(filters.some((filter) => filter.table === "recovery_bookings_import" && filter.values.length === 1 && filter.values[0] === recoveryId));
  assert.ok(filters.some((filter) => filter.table === "customer_source_bookings_mcp_eap" && filter.values.length === 1 && filter.values[0] === "701"));
  assert.ok(!plan.some((event) => event.source_record_key === "999"));
});

test("legacy inserted purchases fall back only when booking_paid was not captured", async () => {
  const purchases = [
    { id: "50000000-0000-4000-8000-000000000001", source_booking_id: "601", price: 6000, booking_paid: 5500, booking_status: 1, paying_status: "1", is_valid_purchase: true, row_hash: "1".repeat(64), created_at: "2026-09-24T10:00:00Z" },
    { id: "50000000-0000-4000-8000-000000000002", source_booking_id: "602", price: 6000, booking_paid: null, booking_status: 1, paying_status: "1", is_valid_purchase: true, row_hash: "2".repeat(64), created_at: "2026-09-24T10:00:00Z" },
    { id: "50000000-0000-4000-8000-000000000003", source_booking_id: "603", price: 7000, booking_paid: 6500, booking_status: 1, paying_status: "1", is_valid_purchase: true, row_hash: "3".repeat(64), created_at: "2026-09-24T10:00:00Z" },
  ];
  const changes = purchases.map((row, index) => ({
    id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    source: "purchases",
    operation: "inserted",
    entity_id: row.id,
    created_at: `2026-09-24T14:0${index + 1}:00Z`,
    changed_fields: index === 2 ? ["booking_status", "booking_paid", "row_hash"] : ["booking_status", "row_hash"],
    current_booking_status: 1,
    current_paying_status: "1",
    current_is_valid_purchase: true,
    current_price: row.price,
    current_booking_paid: null,
    current_row_hash: row.row_hash,
  }));
  const tables = {
    customer_source_bookings_mcp_eap: [],
    recovery_bookings_import: purchases,
    recovery_incomplete_bookings_import: [],
    recovery_import_row_changes: changes,
    recovery_import_batches: [],
  };
  const firstPlan = [];
  const replayPlan = [];
  const first = await run({ mode: "incremental", apply: false }, {
    client: pagedClient(tables), now: deterministicNow(), onPlan: (events) => firstPlan.push(...events),
  });
  await run({ mode: "incremental", apply: false }, {
    client: pagedClient(tables), now: deterministicNow(), onPlan: (events) => replayPlan.push(...events),
  });

  assert.equal(first.plannedEvents, 1);
  assert.equal(first.pendingDuplicateEventKeys, 0);
  assert.equal(first.excludedCounts.missing_purchase_paid_amount, 2);
  assert.equal(firstPlan[0].source_record_key, "601");
  assert.equal(firstPlan[0].amount, 5500);
  assert.equal(firstPlan[0].amount_kind, "paid_amount");
  assert.equal(firstPlan[0].currency, "CLP");
  assert.ok(!firstPlan.some((event) => event.source_record_key === "602"));
  assert.ok(!firstPlan.some((event) => event.source_record_key === "603"));
  assert.equal(first.candidateCounts.candidate_purchase_unique, 1);
  assert.deepEqual(firstPlan, replayPlan);
});

test("CLI is read-only by default contract and write modes require explicit apply", () => {
  assert.deepEqual(parseArgs(["--dry-run"]), { apply: false, mode: "dry-run" });
  assert.deepEqual(parseArgs(["--backfill", "--apply"]), { apply: true, mode: "backfill" });
  assert.deepEqual(parseArgs(["--incremental", "--apply"]), { apply: true, mode: "incremental" });
  assert.throws(() => parseArgs(["--backfill"]), /explicit --apply/);
  assert.throws(() => parseArgs(["--dry-run", "--apply"]), /cannot be combined/);
  assert.doesNotMatch(materializer, /if \(apply\) retainPendingCandidate\(pending, event\)/);
  assert.match(materializer, /if \(apply && pendingEvents\.length\) await flush/);
  assert.match(materializer, /plannedBatchCount/);
  assert.match(materializer, /loadRowsByValues/);
  assert.match(materializer, /sort\(\(\[left\], \[right\]\) => left\.localeCompare\(right\)\)/);
  assert.match(materializer, /incomplete_timestamp_excluded/);
  assert.doesNotMatch(materializer, /email_normalized|phone_normalized|plate_normalized/);
});
