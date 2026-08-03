import "server-only";

import { createClient } from "@supabase/supabase-js";

import { RECOVERY_ATTRIBUTION_CALCULATION_VERSION } from "@/lib/recuperacion/recovery-attribution";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECOVERY_TIME_ZONE = "America/Santiago";
const MAX_CHANGES = 100;
const EVENT_PAGE_SIZE = 1000;
const EVENT_ENTITY_CHUNK_SIZE = 200;

const safeChangedFields = new Set([
  "booking_created_at",
  "booking_status",
  "cms_url",
  "form_datetime",
  "intended_arrival_at",
  "intended_arrival_date",
  "intended_days",
  "intended_departure_at",
  "intended_departure_date",
  "is_valid_purchase",
  "message_sent",
  "parking_code",
  "paying_status",
  "price",
  "type",
  "updated_at_source",
]);

const purchaseHighFields = new Set([
  "booking_created_at",
  "booking_status",
  "is_valid_purchase",
  "paying_status",
  "price",
]);

const cartHighFields = new Set([
  "form_datetime",
  "intended_arrival_at",
  "intended_arrival_date",
  "intended_departure_at",
  "intended_departure_date",
  "type",
]);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RecoverySnapshotComparisonReason =
  | "ok"
  | "missing_current"
  | "missing_previous"
  | "no_changes";

export type RecoverySnapshotComparisonConfidence =
  | "high"
  | "medium"
  | "low";

export type RecoverySnapshotComparisonDto = {
  available: boolean;
  reason: RecoverySnapshotComparisonReason;
  weekStart: string;
  weekEnd: string;
  calculationVersion: "v1-intended-arrival";
  previousSnapshot: {
    idShort: string | null;
    snapshotAt: string;
    recoveryRate: number;
    recoveredConfirmed: number;
    recoveredAmount: number;
  } | null;
  currentSnapshot: {
    idShort: string | null;
    snapshotAt: string;
    recoveryRate: number;
    recoveredConfirmed: number;
    recoveredAmount: number;
  } | null;
  delta: {
    recoveryRatePoints: number;
    recoveredConfirmed: number;
    recoveredAmount: number;
    cartsChanged: number;
  } | null;
  counts: {
    totalRows: number;
    unchanged: number;
    statusChanged: number;
    purchaseChanged: number;
    amountChanged: number;
    purchaseDataChanged: number;
    added: number;
    removed: number;
  } | null;
  explanation: {
    text: string;
    triggerBatchShort: string | null;
    confidence: RecoverySnapshotComparisonConfidence | null;
  } | null;
  changes: Array<{
    cartIdShort: string | null;
    previousStatus: string | null;
    currentStatus: string | null;
    purchaseIdShort: string | null;
    previousAmount: number | null;
    currentAmount: number | null;
    amountDelta: number;
    probableChangeReason: string;
    triggerBatchShort: string | null;
    triggerBatchConfidence: RecoverySnapshotComparisonConfidence | null;
    triggerOperation: "inserted" | "updated" | null;
    triggerChangedFields: string[];
  }>;
};

type SnapshotRow = {
  id: string;
  snapshot_at: string;
  week_start: string;
  week_end: string;
  calculation_version: string;
  recovered_confirmed: number;
  recovered_amount: number;
  recovery_rate: number;
};

type CompareRow = {
  cart_id: string;
  previous_status: string | null;
  current_status: string | null;
  previous_purchase_id: string | null;
  current_purchase_id: string | null;
  previous_amount: number | string | null;
  current_amount: number | string | null;
  status_changed: boolean | null;
  purchase_changed: boolean | null;
  amount_changed: boolean | null;
  cart_changed: boolean | null;
  purchase_data_changed: boolean | null;
  probable_change_reason: string | null;
};

type ImportRowChange = {
  id: string;
  batch_id: string;
  changed_fields: string[] | null;
  created_at: string;
  entity_id: string;
  operation: "inserted" | "updated";
  source: "carts" | "purchases";
};

type QueryError = { message?: string } | null;

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => unknown;
  };
  rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: QueryError }>;
};

type SnapshotQueryChain = PromiseLike<{ data: SnapshotRow[] | null; error: QueryError }> & {
  eq: (column: string, value: string) => SnapshotQueryChain;
  limit: (value: number) => SnapshotQueryChain;
  order: (column: string, options: { ascending: boolean }) => SnapshotQueryChain;
};

type ImportEventsQueryChain = PromiseLike<{ data: ImportRowChange[] | null; error: QueryError }> & {
  gte: (column: string, value: string) => ImportEventsQueryChain;
  in: (column: string, values: string[]) => ImportEventsQueryChain;
  lte: (column: string, value: string) => ImportEventsQueryChain;
  order: (column: string, options: { ascending: boolean }) => ImportEventsQueryChain;
  range: (from: number, to: number) => PromiseLike<{ data: ImportRowChange[] | null; error: QueryError }>;
};

function createRecoverySnapshotComparisonClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role environment is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

export function shortId(value: unknown) {
  if (typeof value !== "string" || !uuidPattern.test(value)) return null;
  return value.slice(0, 8);
}

function dateOnlyParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

export function isValidRecoverySnapshotWeekStart(value: string) {
  const parts = dateOnlyParts(value);
  if (!parts) return false;

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    return false;
  }

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: RECOVERY_TIME_ZONE,
    weekday: "short",
  }).format(date);

  return weekday === "Mon";
}

export function recoverySnapshotWeekEnd(weekStart: string) {
  const parts = dateOnlyParts(weekStart);
  if (!parts) throw new Error("Invalid recovery snapshot weekStart.");

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  date.setUTCDate(date.getUTCDate() + 7);

  return date.toISOString().slice(0, 10);
}

function normalizeNumber(value: number | string | null) {
  if (value === null) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function snapshotDto(row: SnapshotRow | null) {
  if (!row) return null;

  return {
    idShort: shortId(row.id),
    recoveredAmount: Number(row.recovered_amount),
    recoveredConfirmed: Number(row.recovered_confirmed),
    recoveryRate: Number(row.recovery_rate),
    snapshotAt: row.snapshot_at,
  };
}

function isSnapshotRow(value: unknown): value is SnapshotRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.snapshot_at === "string" &&
    typeof row.week_start === "string" &&
    typeof row.week_end === "string" &&
    typeof row.calculation_version === "string" &&
    typeof row.recovered_confirmed === "number" &&
    typeof row.recovered_amount === "number" &&
    typeof row.recovery_rate === "number"
  );
}

function isCompareRow(value: unknown): value is CompareRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.cart_id === "string";
}

function isImportRowChange(value: unknown): value is ImportRowChange {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.batch_id === "string" &&
    typeof row.created_at === "string" &&
    typeof row.entity_id === "string" &&
    (row.operation === "inserted" || row.operation === "updated") &&
    (row.source === "carts" || row.source === "purchases") &&
    (Array.isArray(row.changed_fields) || row.changed_fields === null)
  );
}

function sanitizeChangedFields(fields: string[] | null) {
  return (fields ?? []).filter((field) => safeChangedFields.has(field));
}

function queryBuilder<T>(query: unknown): PromiseLike<{ data: T[] | null; error: QueryError }> {
  return query as PromiseLike<{ data: T[] | null; error: QueryError }>;
}

async function loadSnapshots(supabase: SupabaseLike, weekStart: string, weekEnd: string) {
  const query = supabase
    .from("recovery_weekly_snapshots")
    .select("id,snapshot_at,week_start,week_end,calculation_version,recovered_confirmed,recovered_amount,recovery_rate") as SnapshotQueryChain;

  const { data, error } = await queryBuilder<SnapshotRow>(
    query
      .eq("week_start", weekStart)
      .eq("week_end", weekEnd)
      .eq("calculation_version", RECOVERY_ATTRIBUTION_CALCULATION_VERSION)
      .order("snapshot_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(2),
  );

  if (error) throw new Error("Could not load recovery snapshots.");

  return (data ?? []).filter(isSnapshotRow);
}

async function loadComparisonRows(supabase: SupabaseLike, previousSnapshotId: string, currentSnapshotId: string) {
  const { data, error } = await supabase.rpc("recovery_compare_snapshots", {
    p_current_snapshot_id: currentSnapshotId,
    p_previous_snapshot_id: previousSnapshotId,
  });

  if (error) throw new Error("Could not compare recovery snapshots.");

  return (Array.isArray(data) ? data : []).filter(isCompareRow);
}

function chunkValues(values: string[], size: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchEventRowsInPages(queryFactory: () => ImportEventsQueryChain) {
  const rows: ImportRowChange[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryFactory().range(from, from + EVENT_PAGE_SIZE - 1);

    if (error) return { data: [] as ImportRowChange[], error };

    const page = (data ?? []).filter(isImportRowChange);
    rows.push(...page);

    if ((data ?? []).length < EVENT_PAGE_SIZE) return { data: rows, error: null };

    from += EVENT_PAGE_SIZE;
  }
}

async function loadImportEvents(
  supabase: SupabaseLike,
  rows: CompareRow[],
  previousSnapshotAt: string,
  currentSnapshotAt: string,
) {
  const entityIds = Array.from(
    new Set(
      rows
        .flatMap((row) => [row.cart_id, row.previous_purchase_id, row.current_purchase_id])
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (entityIds.length === 0) return [] as ImportRowChange[];

  const events: ImportRowChange[] = [];

  for (const chunk of chunkValues(entityIds, EVENT_ENTITY_CHUNK_SIZE)) {
    const result = await fetchEventRowsInPages(() =>
      (
        supabase
          .from("recovery_import_row_changes")
          .select("id,batch_id,source,operation,entity_id,changed_fields,created_at") as ImportEventsQueryChain
      )
        .gte("created_at", previousSnapshotAt)
        .lte("created_at", currentSnapshotAt)
        .in("entity_id", chunk)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
    );

    if (result.error) return [] as ImportRowChange[];
    events.push(...result.data);
  }

  return Array.from(new Map(events.map((event) => [event.id, event])).values()).sort((left, right) => {
    const byCreatedAt = left.created_at.localeCompare(right.created_at);
    return byCreatedAt !== 0 ? byCreatedAt : left.id.localeCompare(right.id);
  });
}

function isChanged(row: CompareRow) {
  return Boolean(
    row.status_changed ||
      row.purchase_changed ||
      row.amount_changed ||
      row.cart_changed ||
      row.purchase_data_changed ||
      row.probable_change_reason === "added_to_snapshot" ||
      row.probable_change_reason === "removed_from_snapshot",
  );
}

function changePriority(row: CompareRow) {
  if (row.status_changed) return 0;
  if (row.purchase_changed) return 1;
  if (row.amount_changed) return 2;
  return 3;
}

function confidenceRank(value: RecoverySnapshotComparisonConfidence | null) {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function hasRecoveredStatusChange(row: CompareRow) {
  const previous = row.previous_status ?? "";
  const current = row.current_status ?? "";
  return previous.startsWith("recovered") !== current.startsWith("recovered");
}

function highPurchaseFieldsFor(row: CompareRow) {
  const fields = new Set<string>();

  if (row.amount_changed) fields.add("price");
  if (row.purchase_changed) fields.add("booking_created_at");
  if (row.status_changed || hasRecoveredStatusChange(row)) {
    fields.add("booking_status");
    fields.add("paying_status");
    fields.add("is_valid_purchase");
    fields.add("booking_created_at");
  }

  for (const field of purchaseHighFields) {
    if (!fields.has(field) && !row.amount_changed && !row.purchase_changed && !row.status_changed) {
      fields.add(field);
    }
  }

  return fields;
}

function highCartFieldsFor(row: CompareRow) {
  if (!row.cart_changed) return new Set<string>();
  return cartHighFields;
}

function eventConfidence(row: CompareRow, event: ImportRowChange): RecoverySnapshotComparisonConfidence {
  const fields = sanitizeChangedFields(event.changed_fields);
  const highFields = event.source === "purchases" ? highPurchaseFieldsFor(row) : highCartFieldsFor(row);

  return fields.some((field) => highFields.has(field)) ? "high" : "medium";
}

function compareEventsForRow(row: CompareRow, left: ImportRowChange, right: ImportRowChange) {
  const leftConfidence = eventConfidence(row, left);
  const rightConfidence = eventConfidence(row, right);
  const confidenceDelta = confidenceRank(rightConfidence) - confidenceRank(leftConfidence);
  if (confidenceDelta !== 0) return confidenceDelta;

  const createdDelta = right.created_at.localeCompare(left.created_at);
  if (createdDelta !== 0) return createdDelta;

  return right.id.localeCompare(left.id);
}

function classifyTrigger(row: CompareRow, events: ImportRowChange[]) {
  const purchaseIds = new Set([row.previous_purchase_id, row.current_purchase_id].filter(Boolean));
  const exactEvents = events.filter(
    (event) =>
      (event.source === "purchases" && purchaseIds.has(event.entity_id)) ||
      (event.source === "carts" && event.entity_id === row.cart_id),
  );

  if (exactEvents.length > 0) {
    const event = [...exactEvents].sort((left, right) => compareEventsForRow(row, left, right))[0];
    return {
      batchShort: shortId(event.batch_id),
      changedFields: sanitizeChangedFields(event.changed_fields),
      confidence: eventConfidence(row, event),
      operation: event.operation,
    };
  }

  const temporalEvent = [...events].reverse().find((event) => event.source === "purchases");
  if (temporalEvent) {
    return {
      batchShort: shortId(temporalEvent.batch_id),
      changedFields: sanitizeChangedFields(temporalEvent.changed_fields),
      confidence: "low" as const,
      operation: temporalEvent.operation,
    };
  }

  return {
    batchShort: null,
    changedFields: [] as string[],
    confidence: null,
    operation: null,
  };
}

function plural(count: number, singular: string, pluralText: string) {
  return count === 1 ? singular : pluralText;
}

function formatCurrencyForText(value: number) {
  return `$${new Intl.NumberFormat("es-CL").format(Math.abs(Math.round(value)))}`;
}

function statusTransitionText(rows: CompareRow[]) {
  const newlyRecovered = rows.filter((row) => {
    const previous = row.previous_status ?? "";
    const current = row.current_status ?? "";
    return previous === "unrecovered" && current.startsWith("recovered");
  });
  const noLongerRecovered = rows.filter((row) => {
    const previous = row.previous_status ?? "";
    const current = row.current_status ?? "";
    return previous.startsWith("recovered") && current === "unrecovered";
  });
  const withAmount = newlyRecovered.filter((row) => row.current_status === "recovered_with_amount").length;
  const withPack = newlyRecovered.filter((row) => row.current_status === "recovered_pack").length;

  return { newlyRecovered: newlyRecovered.length, noLongerRecovered: noLongerRecovered.length, withAmount, withPack };
}

function buildExplanation(
  delta: NonNullable<RecoverySnapshotComparisonDto["delta"]>,
  changedRows: CompareRow[],
  changes: RecoverySnapshotComparisonDto["changes"],
  counts: NonNullable<RecoverySnapshotComparisonDto["counts"]>,
) {
  if (changedRows.length === 0) {
    return {
      confidence: null,
      text: "No hubo cambios desde el snapshot anterior.",
      triggerBatchShort: null,
    };
  }

  const transition = statusTransitionText(changedRows);
  const bestChange = changes.reduce<RecoverySnapshotComparisonDto["changes"][number] | null>((best, change) => {
    if (!best) return change;
    return confidenceRank(change.triggerBatchConfidence) > confidenceRank(best.triggerBatchConfidence) ? change : best;
  }, null);
  const sentences: string[] = [];

  if (delta.recoveredConfirmed > 0 && transition.newlyRecovered > 0) {
    sentences.push(
      `${delta.recoveredConfirmed} ${plural(delta.recoveredConfirmed, "carrito adicional pasó", "carritos adicionales pasaron")} a recuperado${delta.recoveredConfirmed === 1 ? "" : "s"}.`,
    );
    if (transition.withAmount > 0 || transition.withPack > 0) {
      sentences.push(`${transition.withAmount} ${plural(transition.withAmount, "incorporó", "incorporaron")} monto y ${transition.withPack} ${plural(transition.withPack, "fue", "fueron")} recuperado${transition.withPack === 1 ? "" : "s"} con pack.`);
    }
  } else if (delta.recoveredConfirmed < 0) {
    const count = Math.abs(delta.recoveredConfirmed);
    sentences.push(`${count} ${plural(count, "carrito dejó", "carritos dejaron")} de estar recuperado${count === 1 ? "" : "s"}.`);
  } else if (delta.recoveredConfirmed === 0 && delta.recoveredAmount === 0) {
    sentences.push("La tasa se mantuvo sin cambios netos en carritos recuperados.");
  }

  if (delta.recoveredAmount > 0) {
    sentences.push(`El monto recuperado aumentó en ${formatCurrencyForText(delta.recoveredAmount)}.`);
  } else if (delta.recoveredAmount < 0) {
    sentences.push(`El monto recuperado disminuyó en ${formatCurrencyForText(delta.recoveredAmount)}.`);
  }

  if (delta.recoveredConfirmed === 0 && delta.recoveredAmount === 0 && counts.purchaseChanged > 0) {
    sentences.push(`${counts.purchaseChanged} ${plural(counts.purchaseChanged, "compra atribuida cambió", "compras atribuidas cambiaron")} sin cambiar el total recuperado.`);
  }

  if (counts.added > 0) sentences.push(`${counts.added} ${plural(counts.added, "carrito fue agregado", "carritos fueron agregados")} al snapshot.`);
  if (counts.removed > 0) sentences.push(`${counts.removed} ${plural(counts.removed, "carrito fue removido", "carritos fueron removidos")} del snapshot.`);

  if (bestChange?.triggerBatchShort) {
    if (bestChange.triggerBatchConfidence === "high") {
      sentences.push(`El batch responsable confirmado ${bestChange.triggerBatchShort} actualizó datos relacionados entre ambos snapshots.`);
    } else if (bestChange.triggerBatchConfidence === "medium") {
      sentences.push(`El batch probablemente relacionado ${bestChange.triggerBatchShort} tuvo eventos sobre entidades vinculadas.`);
    } else if (bestChange.triggerBatchConfidence === "low") {
      sentences.push(`El batch ${bestChange.triggerBatchShort} está temporalmente relacionado con los cambios.`);
    }
  }

  return {
    confidence: bestChange?.triggerBatchConfidence ?? null,
    text: sentences.join(" "),
    triggerBatchShort: bestChange?.triggerBatchShort ?? null,
  };
}

function emptyComparison(weekStart: string, weekEnd: string, reason: RecoverySnapshotComparisonReason, currentSnapshot: SnapshotRow | null) {
  return {
    available: false,
    calculationVersion: RECOVERY_ATTRIBUTION_CALCULATION_VERSION,
    changes: [],
    counts: null,
    currentSnapshot: snapshotDto(currentSnapshot),
    delta: null,
    explanation: null,
    previousSnapshot: null,
    reason,
    weekEnd,
    weekStart,
  } satisfies RecoverySnapshotComparisonDto;
}

export async function getRecoverySnapshotComparison(
  weekStart: string,
  options: { supabase?: SupabaseLike } = {},
): Promise<RecoverySnapshotComparisonDto> {
  if (!isValidRecoverySnapshotWeekStart(weekStart)) {
    throw new Error("Invalid recovery snapshot weekStart.");
  }

  const weekEnd = recoverySnapshotWeekEnd(weekStart);
  const supabase = options.supabase ?? createRecoverySnapshotComparisonClient();
  const snapshots = await loadSnapshots(supabase, weekStart, weekEnd);

  if (snapshots.length === 0) return emptyComparison(weekStart, weekEnd, "missing_current", null);
  if (snapshots.length === 1) return emptyComparison(weekStart, weekEnd, "missing_previous", snapshots[0]);

  const [currentSnapshot, previousSnapshot] = snapshots;
  const comparisonRows = await loadComparisonRows(supabase, previousSnapshot.id, currentSnapshot.id);
  const changedRows = comparisonRows
    .filter(isChanged)
    .sort((left, right) => changePriority(left) - changePriority(right))
    .slice(0, MAX_CHANGES);
  const importEvents = await loadImportEvents(supabase, changedRows, previousSnapshot.snapshot_at, currentSnapshot.snapshot_at);

  const changes = changedRows.map((row) => {
    const trigger = classifyTrigger(row, importEvents);
    const previousAmount = normalizeNumber(row.previous_amount);
    const currentAmount = normalizeNumber(row.current_amount);

    return {
      amountDelta: (currentAmount ?? 0) - (previousAmount ?? 0),
      cartIdShort: shortId(row.cart_id),
      currentAmount,
      currentStatus: row.current_status,
      previousAmount,
      previousStatus: row.previous_status,
      probableChangeReason: row.probable_change_reason ?? "unknown",
      purchaseIdShort: shortId(row.current_purchase_id ?? row.previous_purchase_id),
      triggerBatchConfidence: trigger.confidence,
      triggerBatchShort: trigger.batchShort,
      triggerChangedFields: trigger.changedFields,
      triggerOperation: trigger.operation,
    };
  });

  const counts = comparisonRows.reduce(
    (total, row) => {
      if (row.probable_change_reason === "added_to_snapshot") total.added += 1;
      if (row.probable_change_reason === "removed_from_snapshot") total.removed += 1;
      if (row.status_changed) total.statusChanged += 1;
      if (row.purchase_changed) total.purchaseChanged += 1;
      if (row.amount_changed) total.amountChanged += 1;
      if (row.purchase_data_changed) total.purchaseDataChanged += 1;
      if (!isChanged(row)) total.unchanged += 1;
      total.totalRows += 1;
      return total;
    },
    {
      added: 0,
      amountChanged: 0,
      purchaseChanged: 0,
      purchaseDataChanged: 0,
      removed: 0,
      statusChanged: 0,
      totalRows: 0,
      unchanged: 0,
    },
  );
  const delta = {
    cartsChanged: changedRows.length,
    recoveredAmount: Number(currentSnapshot.recovered_amount) - Number(previousSnapshot.recovered_amount),
    recoveredConfirmed: Number(currentSnapshot.recovered_confirmed) - Number(previousSnapshot.recovered_confirmed),
    recoveryRatePoints: Number(currentSnapshot.recovery_rate) - Number(previousSnapshot.recovery_rate),
  };
  const reason = changedRows.length === 0 ? "no_changes" : "ok";

  return {
    available: true,
    calculationVersion: RECOVERY_ATTRIBUTION_CALCULATION_VERSION,
    changes,
    counts,
    currentSnapshot: snapshotDto(currentSnapshot),
    delta,
    explanation: buildExplanation(delta, changedRows, changes, counts),
    previousSnapshot: snapshotDto(previousSnapshot),
    reason,
    weekEnd,
    weekStart,
  };
}