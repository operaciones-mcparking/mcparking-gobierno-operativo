import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  RECOVERY_ATTRIBUTION_CALCULATION_VERSION,
  resolveRecoveryAttributions,
  summarizeRecoveryAttributions,
  type RecoveryAttributionCartInput,
  type RecoveryAttributionPurchaseInput,
  type RecoveryAttributionResult,
  type RecoveryAttributionSummary,
} from "@/lib/recuperacion/recovery-attribution";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECOVERY_TIME_ZONE = "America/Santiago";

export type RecoveryWeeklySnapshotKind = "batch" | "daily" | "weekly_close" | "manual" | "reconstructed";

export type RecoveryWeeklySnapshotSummaryInput = RecoveryAttributionSummary;

export type RecoveryWeeklyCartSnapshotInput = {
  attributed_amount: number | null;
  attributed_purchase_at: string | null;
  attributed_purchase_id: string | null;
  attribution_reason: string;
  cart_batch_id: string | null;
  cart_id: string;
  cart_row_hash: string | null;
  cart_updated_at_source: string | null;
  confidence: string | null;
  form_datetime: string;
  intended_arrival_at: string | null;
  match_type: string | null;
  purchase_batch_id: string | null;
  purchase_created_at: string | null;
  purchase_row_hash: string | null;
  recovery_status: RecoveryAttributionResult["status"];
};

export type RecoveryWeeklySnapshotCreateInput = {
  calculationVersion?: string;
  latestCartBatchId?: string | null;
  latestMessageMemoryBatchId?: string | null;
  latestPurchaseBatchId?: string | null;
  latestTrackingBatchId?: string | null;
  snapshotKey: string;
  snapshotKind: RecoveryWeeklySnapshotKind;
  triggerBatchId?: string | null;
  weekEnd: string;
  weekStart: string;
};

export type RecoveryWeeklySnapshotCreateResult = {
  cartsTotal: number;
  created: boolean;
  snapshotAt: string;
  snapshotId: string;
};

type CartSnapshotSourceRow = RecoveryAttributionCartInput & {
  updated_at_source?: string | null;
};

type PurchaseSnapshotSourceRow = RecoveryAttributionPurchaseInput;

type SnapshotRpcRow = {
  carts_total: number;
  created: boolean;
  snapshot_at: string;
  snapshot_id: string;
};

type SnapshotRpcResult = SnapshotRpcRow | SnapshotRpcRow[] | null;

type SnapshotQueryError = { message: string };

type SnapshotPagedQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: SnapshotQueryError | null }>;
};

function createRecoverySnapshotSupabaseClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role environment is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function addIsoDays(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function timeZoneParts(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);

  const valueFor = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    day: valueFor("day"),
    hour: valueFor("hour"),
    minute: valueFor("minute"),
    month: valueFor("month"),
    second: valueFor("second"),
    year: valueFor("year"),
  };
}

function timeZoneOffsetMs(timeZone: string, date: Date) {
  const parts = timeZoneParts(timeZone, date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  return asUtc - date.getTime();
}

function zonedMidnightToUtcIso(timeZone: string, year: number, month: number, day: number) {
  const guess = new Date(Date.UTC(year, month - 1, day));
  const firstPass = new Date(guess.getTime() - timeZoneOffsetMs(timeZone, guess));
  const secondPass = new Date(guess.getTime() - timeZoneOffsetMs(timeZone, firstPass));

  return secondPass.toISOString();
}

function santiagoDateOnlyToUtcIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (!match) {
    throw new Error("Snapshot week boundaries must use YYYY-MM-DD.");
  }

  return zonedMidnightToUtcIso(
    RECOVERY_TIME_ZONE,
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );
}

function assertSafeSnapshotKey(value: string) {
  if (!value.trim()) {
    throw new Error("snapshotKey is required.");
  }
}

function isSnapshotRpcRow(value: unknown): value is SnapshotRpcRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.snapshot_id === "string" &&
    typeof row.created === "boolean" &&
    typeof row.carts_total === "number" &&
    typeof row.snapshot_at === "string"
  );
}

function normalizeSnapshotRpcResult(data: SnapshotRpcResult): SnapshotRpcRow | null {
  if (Array.isArray(data)) return data.find(isSnapshotRpcRow) ?? null;
  return isSnapshotRpcRow(data) ? data : null;
}

async function fetchSnapshotRowsInPages<T>(
  queryFactory: () => SnapshotPagedQuery<T>,
  pageSize = 1000,
): Promise<{ data: T[]; error: SnapshotQueryError | null }> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);

    if (error) {
      return { data: [] as T[], error };
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) {
      return { data: rows, error: null };
    }

    from += pageSize;
  }
}

function buildCartSnapshotRows(
  attributions: RecoveryAttributionResult[],
  carts: CartSnapshotSourceRow[],
): RecoveryWeeklyCartSnapshotInput[] {
  const cartsById = new Map(carts.map((cart) => [cart.id, cart]));

  return attributions.map((result) => {
    const cart = cartsById.get(result.cartId);

    if (!result.cartFormDatetime) {
      throw new Error(`Cart ${result.cartId} is missing form_datetime.`);
    }

    return {
      attributed_amount: result.attributedAmount,
      attributed_purchase_at: result.attributedPurchaseAt,
      attributed_purchase_id: result.attributedPurchaseId,
      attribution_reason: result.attributionReason,
      cart_batch_id: result.cartBatchId,
      cart_id: result.cartId,
      cart_row_hash: result.cartRowHash,
      cart_updated_at_source: cart?.updated_at_source ?? null,
      confidence: result.confidence,
      form_datetime: result.cartFormDatetime,
      intended_arrival_at: result.intendedArrivalAt,
      match_type: result.matchType,
      purchase_batch_id: result.purchaseBatchId,
      purchase_created_at: result.attributedPurchaseAt,
      purchase_row_hash: result.purchaseRowHash,
      recovery_status: result.status,
    };
  });
}

function latestBatchId(rows: Array<{ batch_id?: string | null }>) {
  return rows.findLast((row) => Boolean(row.batch_id))?.batch_id ?? null;
}

export function buildRecoveryWeeklySnapshotPayload(
  carts: CartSnapshotSourceRow[],
  purchases: PurchaseSnapshotSourceRow[],
) {
  const attributions = resolveRecoveryAttributions(carts, purchases);
  const summary = summarizeRecoveryAttributions(attributions);
  const cartResults = buildCartSnapshotRows(attributions, carts).sort((left, right) => left.cart_id.localeCompare(right.cart_id));

  return {
    cartResults,
    latestCartBatchId: latestBatchId(carts),
    latestPurchaseBatchId: latestBatchId(purchases),
    summary,
  };
}

export async function createRecoveryWeeklySnapshot(
  input: RecoveryWeeklySnapshotCreateInput,
): Promise<RecoveryWeeklySnapshotCreateResult> {
  assertSafeSnapshotKey(input.snapshotKey);

  const calculationVersion = input.calculationVersion ?? RECOVERY_ATTRIBUTION_CALCULATION_VERSION;
  const weekStartUtc = santiagoDateOnlyToUtcIso(input.weekStart);
  const weekEndUtc = santiagoDateOnlyToUtcIso(input.weekEnd);
  const purchaseWindowEnd = addIsoDays(weekEndUtc, 14);
  const supabase = createRecoverySnapshotSupabaseClient();

  const [cartsResult, purchasesResult] = await Promise.all([
    fetchSnapshotRowsInPages<CartSnapshotSourceRow>(() =>
      supabase
        .from("recovery_incomplete_bookings_import")
        .select(
          "id,batch_id,email_normalized,phone_normalized,type,parking_code,form_datetime,message_sent,intended_arrival_at,row_hash,updated_at_source",
        )
        .gte("form_datetime", weekStartUtc)
        .lt("form_datetime", weekEndUtc)
        .order("form_datetime", { ascending: true }),
    ),
    fetchSnapshotRowsInPages<PurchaseSnapshotSourceRow>(() =>
      supabase
        .from("recovery_bookings_import")
        .select("id,batch_id,booking_created_at,booking_status,paying_status,is_valid_purchase,price,email_normalized,phone_normalized,row_hash")
        .or("is_valid_purchase.eq.true,and(booking_status.eq.9,paying_status.eq.1)")
        .gte("booking_created_at", weekStartUtc)
        .lt("booking_created_at", purchaseWindowEnd)
        .order("booking_created_at", { ascending: true }),
    ),
  ]);

  if (cartsResult.error) throw new Error("Could not load recovery carts for snapshot.");
  if (purchasesResult.error) throw new Error("Could not load recovery purchases for snapshot.");

  const carts = cartsResult.data;
  const purchases = purchasesResult.data;
  const payload = buildRecoveryWeeklySnapshotPayload(carts, purchases);

  const { data, error } = await supabase.rpc("create_recovery_weekly_snapshot", {
    p_calculation_version: calculationVersion,
    p_cart_results: payload.cartResults,
    p_latest_cart_batch_id: input.latestCartBatchId ?? payload.latestCartBatchId,
    p_latest_message_memory_batch_id: input.latestMessageMemoryBatchId ?? null,
    p_latest_purchase_batch_id: input.latestPurchaseBatchId ?? payload.latestPurchaseBatchId,
    p_latest_tracking_batch_id: input.latestTrackingBatchId ?? null,
    p_snapshot_key: input.snapshotKey,
    p_snapshot_kind: input.snapshotKind,
    p_summary: payload.summary satisfies RecoveryWeeklySnapshotSummaryInput,
    p_trigger_batch_id: input.triggerBatchId ?? null,
    p_week_end: toDateOnly(input.weekEnd),
    p_week_start: toDateOnly(input.weekStart),
  });

  if (error) throw new Error("Could not persist recovery weekly snapshot.");

  const row = normalizeSnapshotRpcResult(data as SnapshotRpcResult);
  if (!row) throw new Error("Invalid recovery weekly snapshot RPC response.");

  return {
    cartsTotal: row.carts_total,
    created: row.created,
    snapshotAt: row.snapshot_at,
    snapshotId: row.snapshot_id,
  };
}
