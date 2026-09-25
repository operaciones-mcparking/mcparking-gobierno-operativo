import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MATERIALIZATION_VERSION = "customer_commercial_events_mcp_eap_v1";
export const PURCHASE_TIMESTAMP_PARSER_VERSION = "mcp_eap_buchungszeit_santiago_v1";
export const MAX_RPC_BATCH = 1000;
const FILTER_BATCH_SIZE = 100;
const EVENT_FINGERPRINT_FIELDS = [
  "event_type", "event_at", "event_time_authority", "source_event_at",
  "source_timezone", "timestamp_parser_version", "source", "source_entity",
  "source_record_key", "source_change_id", "brand", "parking", "amount",
  "amount_kind", "currency", "source_total_amount", "source_status",
  "source_paying_status", "source_row_hash", "materialization_version", "observed_at",
];

const THIS_FILE = fileURLToPath(import.meta.url);
const SOURCE = "MCP_EAP";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1].trim()] = value;
  }
  return values;
}

function parseArgs(argv) {
  const flags = new Set(argv);
  const modes = ["--dry-run", "--backfill", "--incremental"].filter((flag) => flags.has(flag));
  if (modes.length !== 1) throw new Error("Choose exactly one of --dry-run, --backfill, or --incremental.");
  const apply = flags.has("--apply");
  if (modes[0] === "--dry-run" && apply) throw new Error("--dry-run cannot be combined with --apply.");
  if (modes[0] !== "--dry-run" && !apply) throw new Error("Write modes require explicit --apply.");
  const unexpected = argv.filter((arg) => !["--dry-run", "--backfill", "--incremental", "--apply"].includes(arg));
  if (unexpected.length) throw new Error("Unexpected arguments.");
  return { apply, mode: modes[0].slice(2) };
}

function finiteAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function laterTimestamp(current, candidate) {
  if (!candidate) return current;
  return !current || candidate > current ? candidate : current;
}

function largerIntegerText(current, candidate) {
  if (candidate === null || candidate === undefined || candidate === "") return current;
  const value = String(candidate);
  if (!/^\d+$/.test(value)) return current;
  return current === null || BigInt(value) > BigInt(current) ? value : current;
}

function sourceWatermarks() {
  return {
    customer_source_bookings_mcp_eap: {
      rowsSeen: 0,
      maxSourceRowId: null,
      maxSourceSyncedAt: null,
      maxUpdatedAt: null,
    },
    recovery_bookings_import: {
      rowsSeen: 0,
      maxRowCreatedAt: null,
      latestBatchId: null,
      latestBatchCreatedAt: null,
      maxBatchConfirmedAt: null,
    },
    recovery_import_row_changes: {
      rowsSeen: 0,
      lastChangeId: null,
      maxCreatedAt: null,
    },
    recovery_incomplete_bookings_import: {
      rowsSeen: 0,
      maxSourceId: null,
      maxRowCreatedAt: null,
      maxSourceCreatedAt: null,
      maxSourceUpdatedAt: null,
      latestBatchId: null,
      latestBatchCreatedAt: null,
      maxBatchConfirmedAt: null,
    },
  };
}

function updateCustomerSourceWatermark(watermark, row) {
  watermark.rowsSeen++;
  watermark.maxSourceRowId = largerIntegerText(watermark.maxSourceRowId, row.source_row_id);
  watermark.maxSourceSyncedAt = laterTimestamp(watermark.maxSourceSyncedAt, row.source_synced_at);
  watermark.maxUpdatedAt = laterTimestamp(watermark.maxUpdatedAt, row.updated_at);
}

function updateRecoveryWatermark(watermark, row) {
  watermark.rowsSeen++;
  watermark.maxRowCreatedAt = laterTimestamp(watermark.maxRowCreatedAt, row.created_at);
}

function updateChangeWatermark(watermark, row) {
  watermark.rowsSeen++;
  if (!watermark.maxCreatedAt || row.created_at > watermark.maxCreatedAt || (
    row.created_at === watermark.maxCreatedAt && String(row.id) > String(watermark.lastChangeId)
  )) {
    watermark.maxCreatedAt = row.created_at ?? watermark.maxCreatedAt;
    watermark.lastChangeId = row.id ?? watermark.lastChangeId;
  }
}

function updateIncompleteWatermark(watermark, row) {
  watermark.rowsSeen++;
  watermark.maxSourceId = largerIntegerText(watermark.maxSourceId, row.source_id);
  watermark.maxRowCreatedAt = laterTimestamp(watermark.maxRowCreatedAt, row.created_at);
  watermark.maxSourceCreatedAt = laterTimestamp(watermark.maxSourceCreatedAt, row.created_at_source);
  watermark.maxSourceUpdatedAt = laterTimestamp(watermark.maxSourceUpdatedAt, row.updated_at_source);
}

export function classifyRecoveryPurchase(row) {
  if (row.is_valid_purchase === true || [1, 8].includes(Number(row.booking_status))) return "purchase";
  if (Number(row.booking_status) === 2) return "booking_cancelled";
  if (Number(row.booking_status) === 9 && String(row.paying_status ?? "").trim() === "1") return "payment_review";
  return null;
}

export function classifyIncomplete(row) {
  if (row.type === "abandoned") return "checkout_abandoned";
  if (row.type === "canceled") return "checkout_cancelled";
  return null;
}

export function eventKey(event) {
  return `${event.source}:${event.source_entity}:${event.source_record_key}:${event.event_type}`;
}

function amountFields(eventType, amount) {
  if (amount === null) return { amount: null, amount_kind: null, currency: null };
  if (eventType === "purchase") return { amount, amount_kind: "paid_amount", currency: "CLP" };
  if (["booking_cancelled", "payment_review"].includes(eventType)) {
    return { amount, amount_kind: "observed_booking_amount", currency: "CLP" };
  }
  return { amount, amount_kind: "quoted_amount", currency: "CLP" };
}

function baseEvent(values) {
  return {
    ...values,
    materialization_version: MATERIALIZATION_VERSION,
    source: SOURCE,
  };
}

export function customerPurchaseEvent(row) {
  const amount = finiteAmount(row.booking_paid);
  return baseEvent({
    event_type: "purchase",
    event_at: null,
    event_time_authority: "source_event_at",
    source_event_at: row.source_created_at ?? null,
    source_timezone: "America/Santiago",
    timestamp_parser_version: PURCHASE_TIMESTAMP_PARSER_VERSION,
    source_entity: "mcp_Buchungen",
    source_record_key: String(row.source_row_id ?? ""),
    source_change_id: null,
    brand: row.brand_normalized ?? null,
    parking: row.parking_normalized ?? null,
    ...amountFields("purchase", amount),
    source_total_amount: finiteAmount(row.source_total_amount),
    source_status: row.booking_status == null ? null : Number(row.booking_status),
    source_paying_status: row.paying_status == null ? null : String(row.paying_status),
    source_row_hash: row.row_hash ?? null,
    observed_at: row.source_synced_at ?? row.updated_at ?? null,
  });
}

export function recoveryStateEvent(row, eventType, options = {}) {
  const state = options.state ?? "current";
  const prefix = state === "previous" ? "previous_" : state === "change_current" ? "current_" : "";
  const stateValue = (field) => {
    const key = `${prefix}${field}`;
    return prefix && Object.hasOwn(row, key) ? row[key] : row[field];
  };
  const amountSource = eventType === "purchase" ? stateValue("booking_paid") : stateValue("price");
  const amount = finiteAmount(amountSource);
  return baseEvent({
    event_type: eventType,
    event_at: null,
    event_time_authority: "observation_only",
    source_event_at: null,
    source_timezone: null,
    timestamp_parser_version: null,
    source_entity: "mcp_Buchungen",
    source_record_key: String(options.sourceRecordKey ?? row.source_booking_id ?? ""),
    source_change_id: options.sourceChangeId ?? null,
    brand: null,
    parking: stateValue("parking_code") ?? null,
    ...amountFields(eventType, amount),
    source_total_amount: finiteAmount(stateValue("price")),
    source_status: stateValue("booking_status") == null ? null : Number(stateValue("booking_status")),
    source_paying_status: stateValue("paying_status") ?? null,
    source_row_hash: stateValue("row_hash") ?? null,
    observed_at: options.observedAt ?? row.latest_observed_at ?? row.created_at ?? null,
  });
}

export function certifiedIncompleteEvent(row) {
  if (row.timestamp_parser_version !== "backend_incomplete_form_datetime_santiago_v1") return null;
  const eventType = classifyIncomplete(row);
  if (!eventType || !row.form_datetime) return null;
  const amount = finiteAmount(row.quoted_amount);
  return baseEvent({
    event_type: eventType,
    event_at: null,
    event_time_authority: "source_event_at",
    source_event_at: row.source_event_at ?? null,
    source_timezone: "America/Santiago",
    timestamp_parser_version: row.timestamp_parser_version,
    source_entity: "BackendIncompleteBookings2",
    source_record_key: String(row.source_id ?? ""),
    source_change_id: null,
    brand: null,
    parking: row.parking_code ?? null,
    ...amountFields(eventType, amount),
    source_total_amount: null,
    source_status: null,
    source_paying_status: null,
    source_row_hash: row.row_hash ?? null,
    observed_at: row.updated_at_source ?? row.created_at_source ?? row.created_at ?? null,
  });
}

export function validateEvent(event) {
  if (!event.event_type || !event.source_entity || !event.source_record_key || !event.observed_at) return "missing_required_fields";
  if (event.amount !== null && (!Number.isFinite(event.amount) || event.amount < 0)) return "invalid_amount";
  if (event.source_total_amount !== null && (!Number.isFinite(event.source_total_amount) || event.source_total_amount < 0)) return "invalid_amount";
  if (event.event_type === "purchase" && event.amount === null) return "missing_required_fields";
  if (event.event_time_authority === "source_event_at" && (!event.source_event_at || !event.timestamp_parser_version)) {
    return "missing_required_fields";
  }
  return null;
}

function safeSummary() {
  const candidateCounts = {};
  for (const eventType of ["purchase", "booking_cancelled", "payment_review", "checkout_abandoned", "checkout_cancelled"]) {
    for (const countType of ["current", "transition", "unique"]) {
      candidateCounts[`candidate_${eventType}_${countType}`] = 0;
    }
  }
  return {
    candidateCounts,
    transition_events: 0,
    same_class_updates: 0,
    duplicateEvidence: {
      duplicate_event_evidence_total: 0,
      duplicate_event_natural_keys: 0,
      incompatible_event_key_collisions: 0,
    },
    excludedCounts: {
      incomplete_total: 0,
      incomplete_timestamp_certified: 0,
      incomplete_timestamp_excluded: 0,
      incomplete_transition_evidence_excluded: 0,
      invalid_amounts: 0,
      missing_required_fields_total: 0,
      missing_purchase_paid_amount: 0,
      missing_by_event_type: {},
    },
    exclusions: {
      incomplete_uncertified_timestamp: 0,
      historical_purchase_missing_paid_amount: 0,
      invalid_required_fields_other: 0,
      invalid_amount: 0,
    },
    writeCounts: {
      upserted: 0,
      inserted: null,
      updated: null,
      skipped: 0,
      insertUpdateBreakdownAvailable: false,
    },
    containsPii: false,
  };
}

function semanticSignature(event) {
  return [event.source, event.source_entity, event.source_record_key, event.event_type, event.amount_kind, event.currency].join("|");
}

function stableEventFingerprint(event) {
  return JSON.stringify(EVENT_FINGERPRINT_FIELDS.map((field) => event[field] ?? null));
}

export function preferredEvent(left, right) {
  const leftAuthority = left.event_time_authority === "source_event_at" ? 1 : 0;
  const rightAuthority = right.event_time_authority === "source_event_at" ? 1 : 0;
  if (leftAuthority !== rightAuthority) return rightAuthority > leftAuthority ? right : left;

  const leftObservedAt = Date.parse(left.observed_at);
  const rightObservedAt = Date.parse(right.observed_at);
  if (Number.isFinite(leftObservedAt) && Number.isFinite(rightObservedAt) && leftObservedAt !== rightObservedAt) {
    return rightObservedAt > leftObservedAt ? right : left;
  }

  return stableEventFingerprint(right) > stableEventFingerprint(left) ? right : left;
}

function retainPendingCandidate(pending, event) {
  const key = eventKey(event);
  const previous = pending.get(key);
  pending.set(key, previous ? preferredEvent(previous, event) : event);
}

function eventEvidence() {
  return { byKey: new Map(), duplicateKeys: new Set(), incompatibleKeys: new Set() };
}

function recordCandidate(summary, event, evidence, origin = "current") {
  const error = validateEvent(event);
  if (error === "invalid_amount") {
    summary.excludedCounts.invalid_amounts++;
    summary.exclusions.invalid_amount++;
  }
  if (error === "missing_required_fields") {
    summary.excludedCounts.missing_required_fields_total++;
    summary.excludedCounts.missing_by_event_type[event.event_type ?? "unknown"] =
      (summary.excludedCounts.missing_by_event_type[event.event_type ?? "unknown"] ?? 0) + 1;
    if (origin === "transition" && event.event_type === "purchase" && event.amount === null) {
      summary.excludedCounts.missing_purchase_paid_amount++;
      summary.exclusions.historical_purchase_missing_paid_amount++;
    } else {
      summary.exclusions.invalid_required_fields_other++;
    }
  }
  if (error) return false;

  summary.candidateCounts[`candidate_${event.event_type}_${origin}`]++;
  const key = eventKey(event);
  const previous = evidence.byKey.get(key);
  if (previous) {
    summary.duplicateEvidence.duplicate_event_evidence_total++;
    if (!evidence.duplicateKeys.has(key)) {
      evidence.duplicateKeys.add(key);
      summary.duplicateEvidence.duplicate_event_natural_keys++;
    }
    if (previous !== semanticSignature(event) && !evidence.incompatibleKeys.has(key)) {
      evidence.incompatibleKeys.add(key);
      summary.duplicateEvidence.incompatible_event_key_collisions++;
    }
  } else {
    evidence.byKey.set(key, semanticSignature(event));
    summary.candidateCounts[`candidate_${event.event_type}_unique`]++;
  }
  return true;
}

function clientFromEnv() {
  const local = loadEnvFile(path.join(process.cwd(), ".env.local"));
  const env = { ...local, ...process.env };
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL or service role key.");
  return {
    async page(table, select, from, filter = null) {
      const parameters = new URLSearchParams({ select, order: "id.asc" });
      if (filter) parameters.set(filter.column, `in.(${filter.values.join(",")})`);
      const response = await fetch(`${url}/rest/v1/${table}?${parameters}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
      });
      if (!response.ok) throw new Error(`Read failed for ${table} (${response.status}).`);
      return response.json();
    },
    async upsert(events) {
      const response = await fetch(`${url}/rest/v1/rpc/customer_commercial_events_upsert_v1_m2m`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_events: events }),
      });
      if (!response.ok) throw new Error(`Commercial event RPC failed (${response.status}).`);
      return response.json();
    },
  };
}

async function forEachPage(client, table, select, callback) {
  for (let from = 0; ; from += 1000) {
    const rows = await client.page(table, select, from);
    await callback(rows);
    if (rows.length < 1000) return;
  }
}

async function flush(client, pending, summary, flushAll = false) {
  while (pending.length >= MAX_RPC_BATCH || (flushAll && pending.length)) {
    const batch = pending.splice(0, Math.min(MAX_RPC_BATCH, pending.length));
    const result = await client.upsert(batch);
    const affected = Number(result?.affectedEvents ?? 0);
    summary.writeCounts.upserted += affected;
    summary.writeCounts.skipped += batch.length - affected;
  }
}

async function loadRows(client, table, select) {
  const result = [];
  await forEachPage(client, table, select, async (rows) => result.push(...rows));
  return result;
}

async function loadRowsByValues(client, table, select, column, values) {
  const uniqueValues = [...new Set(values.filter((value) => value !== null && value !== undefined).map(String))];
  const result = [];
  for (let offset = 0; offset < uniqueValues.length; offset += FILTER_BATCH_SIZE) {
    const filterValues = uniqueValues.slice(offset, offset + FILTER_BATCH_SIZE);
    if (filterValues.some((value) => !/^[A-Za-z0-9-]+$/.test(value))) {
      throw new Error("Unsafe incremental filter value.");
    }
    for (let from = 0; ; from += 1000) {
      const rows = await client.page(table, select, from, { column, values: filterValues });
      result.push(...rows);
      if (rows.length < 1000) break;
    }
  }
  return result;
}

export async function processTransitions(client, {
  evidence = eventEvidence(),
  pending,
  summary,
  highWaterMarks = sourceWatermarks(),
  recoveryBatchIds = new Set(),
  incompleteBatchIds = new Set(),
  captureLookupWatermarks = false,
}) {
  const changes = await loadRows(client, "recovery_import_row_changes", "id,source,operation,entity_id,created_at,changed_fields,previous_row_hash,current_row_hash,previous_type,current_type,previous_form_datetime,current_form_datetime,previous_updated_at_source,current_updated_at_source,previous_parking_code,current_parking_code,previous_booking_status,current_booking_status,previous_paying_status,current_paying_status,previous_is_valid_purchase,current_is_valid_purchase,previous_price,current_price,previous_booking_paid,current_booking_paid");
  const relevantChanges = changes.filter((change) => ["inserted", "updated"].includes(change.operation));
  const purchaseIds = relevantChanges.filter((change) => change.source === "purchases").map((change) => change.entity_id);
  const cartIds = relevantChanges.filter((change) => change.source === "carts").map((change) => change.entity_id);
  const [purchases, carts] = captureLookupWatermarks
    ? await Promise.all([
      loadRowsByValues(client, "recovery_bookings_import", "id,batch_id,source_booking_id,price,booking_paid,booking_status,paying_status,is_valid_purchase,parking_code,row_hash,created_at", "id", purchaseIds),
      loadRowsByValues(client, "recovery_incomplete_bookings_import", "id,batch_id,source_id,type,form_datetime,quoted_amount,parking_code,row_hash,created_at,created_at_source,updated_at_source", "id", cartIds),
    ])
    : await Promise.all([
      loadRows(client, "recovery_bookings_import", "id,batch_id,source_booking_id,price,booking_paid,booking_status,paying_status,is_valid_purchase,parking_code,row_hash,created_at"),
      loadRows(client, "recovery_incomplete_bookings_import", "id,batch_id,source_id,type,form_datetime,quoted_amount,parking_code,row_hash,created_at,created_at_source,updated_at_source"),
    ]);
  if (captureLookupWatermarks) {
    for (const row of purchases) {
      updateRecoveryWatermark(highWaterMarks.recovery_bookings_import, row);
      if (row.batch_id) recoveryBatchIds.add(row.batch_id);
    }
    for (const row of carts) {
      updateIncompleteWatermark(highWaterMarks.recovery_incomplete_bookings_import, row);
      if (row.batch_id) incompleteBatchIds.add(row.batch_id);
    }
  }
  for (const row of changes) updateChangeWatermark(highWaterMarks.recovery_import_row_changes, row);
  const purchaseById = new Map(purchases.map((row) => [row.id, row]));
  const cartById = new Map(carts.map((row) => [row.id, row]));

  const affectedSourceKeys = purchases.map((row) => row.source_booking_id);
  const canonicalPurchases = captureLookupWatermarks
    ? await loadRowsByValues(
      client,
      "customer_source_bookings_mcp_eap",
      "source_row_id,source_created_at,booking_paid,source_total_amount,booking_status,paying_status,brand_normalized,parking_normalized,row_hash,source_synced_at,updated_at",
      "source_row_id",
      affectedSourceKeys,
    )
    : [];
  for (const row of canonicalPurchases) {
    updateCustomerSourceWatermark(highWaterMarks.customer_source_bookings_mcp_eap, row);
    const event = customerPurchaseEvent(row);
    if (recordCandidate(summary, event, evidence, "current")) retainPendingCandidate(pending, event);
  }

  for (const change of relevantChanges) {
    if (change.source === "purchases") {
      const row = purchaseById.get(change.entity_id);
      if (!row) {
        summary.excludedCounts.missing_required_fields_total++;
        summary.excludedCounts.missing_by_event_type.unknown = (summary.excludedCounts.missing_by_event_type.unknown ?? 0) + 1;
        summary.exclusions.invalid_required_fields_other++;
        continue;
      }
      const previousType = classifyRecoveryPurchase({
        booking_status: change.previous_booking_status,
        paying_status: change.previous_paying_status,
        is_valid_purchase: change.previous_is_valid_purchase,
      });
      const currentType = classifyRecoveryPurchase({
        booking_status: change.current_booking_status,
        paying_status: change.current_paying_status,
        is_valid_purchase: change.current_is_valid_purchase,
      });
      const states = change.operation === "inserted"
        ? [[currentType, "change_current"]]
        : previousType === currentType
          ? (summary.same_class_updates++, [[currentType, "change_current"]])
          : [[previousType, "previous"], [currentType, "change_current"]];
      for (const [eventType, state] of states) {
        if (!eventType) continue;
        const eventRow = { ...row, ...change };
        if (
          change.operation === "inserted"
          && eventType === "purchase"
          && state === "change_current"
          && change.current_booking_paid == null
          && !change.changed_fields?.includes("booking_paid")
        ) {
          eventRow.current_booking_paid = row.booking_paid;
        }
        const event = recoveryStateEvent(eventRow, eventType, {
          observedAt: change.created_at,
          sourceChangeId: change.id,
          sourceRecordKey: row.source_booking_id,
          state,
        });
        if (recordCandidate(summary, event, evidence, "transition")) {
          summary.transition_events++;
          retainPendingCandidate(pending, event);
        }
      }
    } else if (change.source === "carts") {
      const row = cartById.get(change.entity_id);
      if (!row) {
        summary.excludedCounts.missing_required_fields_total++;
        summary.excludedCounts.missing_by_event_type.unknown = (summary.excludedCounts.missing_by_event_type.unknown ?? 0) + 1;
        summary.exclusions.invalid_required_fields_other++;
        continue;
      }
      const previousType = classifyIncomplete({ type: change.previous_type });
      const currentType = classifyIncomplete({ type: change.current_type });
      if (change.operation === "inserted" || previousType === currentType) {
        if (change.operation === "updated") summary.same_class_updates++;
        const event = certifiedIncompleteEvent(row);
        if (!event) {
          summary.excludedCounts.incomplete_transition_evidence_excluded++;
          summary.exclusions.incomplete_uncertified_timestamp++;
          continue;
        }
        event.observed_at = change.created_at;
        if (recordCandidate(summary, event, evidence, "transition")) {
          summary.transition_events++;
          retainPendingCandidate(pending, event);
        }
      }
      // Historical cart timestamps are not certified, so type transitions remain excluded in V1.
      else {
        const excluded = Number(Boolean(previousType)) + Number(Boolean(currentType));
        summary.excludedCounts.incomplete_transition_evidence_excluded += excluded;
        summary.exclusions.incomplete_uncertified_timestamp += excluded;
      }
    }
  }
}

async function captureBatchWatermarks(client, recoveryBatchIds, incompleteBatchIds, highWaterMarks) {
  if (!recoveryBatchIds.size && !incompleteBatchIds.size) return;
  await forEachPage(client, "recovery_import_batches", "id,created_at,confirmed_at", async (rows) => {
    for (const row of rows) {
      for (const [batchIds, watermark] of [
        [recoveryBatchIds, highWaterMarks.recovery_bookings_import],
        [incompleteBatchIds, highWaterMarks.recovery_incomplete_bookings_import],
      ]) {
        if (!batchIds.has(row.id)) continue;
        if (!watermark.latestBatchCreatedAt || row.created_at > watermark.latestBatchCreatedAt || (
          row.created_at === watermark.latestBatchCreatedAt && String(row.id) > String(watermark.latestBatchId)
        )) {
          watermark.latestBatchId = row.id;
          watermark.latestBatchCreatedAt = row.created_at;
        }
        watermark.maxBatchConfirmedAt = laterTimestamp(watermark.maxBatchConfirmedAt, row.confirmed_at);
      }
    }
  });
}

async function run(options, dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const startedAtMs = now();
  const capturedAt = new Date(startedAtMs).toISOString();
  const client = dependencies.client ?? clientFromEnv();
  const summary = safeSummary();
  const evidence = eventEvidence();
  const highWaterMarks = sourceWatermarks();
  const recoveryBatchIds = new Set();
  const incompleteBatchIds = new Set();
  const pending = new Map();
  const apply = options.apply;

  if (options.mode !== "incremental") {
    await forEachPage(client, "customer_source_bookings_mcp_eap", "source_row_id,source_created_at,booking_paid,source_total_amount,booking_status,paying_status,brand_normalized,parking_normalized,row_hash,source_synced_at,updated_at", async (rows) => {
      for (const row of rows) {
        updateCustomerSourceWatermark(highWaterMarks.customer_source_bookings_mcp_eap, row);
        const event = customerPurchaseEvent(row);
        if (recordCandidate(summary, event, evidence, "current")) retainPendingCandidate(pending, event);
      }
    });

    await forEachPage(client, "recovery_bookings_import", "batch_id,source_booking_id,price,booking_status,paying_status,is_valid_purchase,parking_code,row_hash,created_at", async (rows) => {
      for (const row of rows) {
        updateRecoveryWatermark(highWaterMarks.recovery_bookings_import, row);
        if (row.batch_id) recoveryBatchIds.add(row.batch_id);
        const type = classifyRecoveryPurchase(row);
        if (!["booking_cancelled", "payment_review"].includes(type)) continue;
        const event = recoveryStateEvent(row, type);
        if (recordCandidate(summary, event, evidence, "current")) retainPendingCandidate(pending, event);
      }
    });

    await forEachPage(client, "recovery_incomplete_bookings_import", "batch_id,source_id,type,form_datetime,quoted_amount,parking_code,row_hash,created_at,created_at_source,updated_at_source", async (rows) => {
      for (const row of rows) {
        updateIncompleteWatermark(highWaterMarks.recovery_incomplete_bookings_import, row);
        if (row.batch_id) incompleteBatchIds.add(row.batch_id);
        summary.excludedCounts.incomplete_total++;
        const event = certifiedIncompleteEvent(row);
        if (!event) {
          summary.excludedCounts.incomplete_timestamp_excluded++;
          summary.exclusions.incomplete_uncertified_timestamp++;
          continue;
        }
        summary.excludedCounts.incomplete_timestamp_certified++;
        if (recordCandidate(summary, event, evidence, "current")) retainPendingCandidate(pending, event);
      }
    });
  }

  await processTransitions(client, {
    evidence,
    pending,
    summary,
    highWaterMarks,
    recoveryBatchIds,
    incompleteBatchIds,
    captureLookupWatermarks: options.mode === "incremental",
  });
  await captureBatchWatermarks(client, recoveryBatchIds, incompleteBatchIds, highWaterMarks);
  const finalUniqueEvents = evidence.byKey.size;
  const pendingEvents = [...pending.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, event]) => event);
  const plannedEvents = pendingEvents.length;
  const plannedBatchCount = plannedEvents === 0 ? 0 : Math.ceil(plannedEvents / MAX_RPC_BATCH);
  const plannedMaxBatchSize = plannedEvents === 0 ? 0 : Math.min(MAX_RPC_BATCH, plannedEvents);
  const plannedLastBatchSize = plannedEvents === 0 ? 0 : ((plannedEvents - 1) % MAX_RPC_BATCH) + 1;
  const pendingDuplicateEventKeys = pendingEvents.length - new Set(pendingEvents.map(eventKey)).size;
  dependencies.onPlan?.(pendingEvents);
  if (apply && pendingEvents.length) await flush(client, pendingEvents, summary, true);
  summary.excludedCounts.total =
    summary.excludedCounts.incomplete_timestamp_excluded
    + summary.excludedCounts.incomplete_transition_evidence_excluded
    + summary.excludedCounts.invalid_amounts
    + summary.excludedCounts.missing_required_fields_total;
  summary.exclusions.total = Object.entries(summary.exclusions)
    .filter(([key]) => key !== "total")
    .reduce((total, [, count]) => total + count, 0);
  return {
    ok: true,
    mode: options.mode,
    applied: apply,
    capturedAt,
    consistency: {
      mode: "per_source_high_water_marks",
      repeatableRead: false,
      reason: "postgrest_pages_use_independent_transactions",
    },
    highWaterMarks,
    finalUniqueEvents,
    plannedEvents,
    plannedBatchCount,
    plannedMaxBatchSize,
    plannedLastBatchSize,
    pendingDuplicateEventKeys,
    ...summary,
    durationMs: now() - startedAtMs,
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    console.log(JSON.stringify(await run(options)));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: "commercial_events_materializer_failed", errorType: error?.name ?? "Error", containsPii: false }));
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(THIS_FILE)) await main();

export { amountFields, eventEvidence, parseArgs, recordCandidate, run, safeSummary, sourceWatermarks };
