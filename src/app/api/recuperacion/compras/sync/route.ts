import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const requireFromRoute = createRequire(import.meta.url);
const { isValidPurchaseSyncSecret, prepareRecoveryPurchaseSync } = requireFromRoute(
  "../../../../../../scripts/recovery/purchases-json-adapter.js",
) as {
  isValidPurchaseSyncSecret: (incomingSecret: string | null, expectedSecret: string | undefined) => boolean;
  prepareRecoveryPurchaseSync: (payload: unknown) => PreparedSync | SyncValidationError;
};

type RecoveryBookingImportRow = {
  arrival_date: string | null;
  booking_created_at: string | null;
  booking_number: string | null;
  booking_status: number | null;
  customer_id: string | null;
  departure_date: string | null;
  duration_days: number | null;
  email_normalized: string | null;
  is_valid_purchase: boolean;
  location_code: string | null;
  parking_code: string | null;
  paying_status: string | null;
  phone_normalized: string | null;
  price: number | null;
  row_hash: string;
  source_booking_id: string | null;
};

type PreparedSync = {
  empty: boolean;
  fileHash?: string;
  fileName?: string;
  fileSize?: number;
  ok: true;
  rows?: RecoveryBookingImportRow[];
  summary?: Record<string, unknown>;
};

type SyncValidationError = {
  error: string;
  invalidRows: number;
  ok: false;
  status: number;
};

type ImportRpcResult = {
  batchId?: string;
  bookingDuplicateRows?: number;
  conflictRows?: number;
  fileAlreadyImported?: boolean;
  insertedRows?: number;
  internalDuplicateRows?: number;
  invalidRows?: number;
  rowsReceived?: number;
  skippedDuplicateRows?: number;
  sourceDuplicateRows?: number;
  updatedRows?: number;
};

type RecoveryStatusRefreshResult = {
  direct?: number;
  error?: string;
  errorCode?: string;
  none?: number;
  ok?: boolean;
  related?: number;
  review?: number;
  rowsCalculated?: number;
};

const MAX_PURCHASE_IDS_PER_REFRESH = 2_000;

function jsonError(message: string, status: number, invalidRows?: number) {
  return NextResponse.json({ error: message, ...(invalidRows ? { invalidRows } : {}), ok: false }, { status });
}

function emptyResult() {
  return {
    bookingDuplicateRows: 0,
    conflictRows: 0,
    fileAlreadyImported: false,
    insertedRows: 0,
    internalDuplicateRows: 0,
    invalidRows: 0,
    ok: true,
    rowsReceived: 0,
    skippedDuplicateRows: 0,
    sourceDuplicateRows: 0,
    updatedRows: 0,
  };
}

async function refreshRecoveryStatusesForBatch(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  batchId: string,
) {
  const { data: changes, error: changesError } = await supabase
    .from("recovery_import_row_changes")
    .select("entity_id")
    .eq("batch_id", batchId)
    .eq("source", "purchases")
    .in("operation", ["inserted", "updated"])
    .limit(MAX_PURCHASE_IDS_PER_REFRESH + 1);

  if (changesError) {
    return { ok: false as const };
  }

  const purchaseIds = Array.from(
    new Set((changes ?? []).map((change) => change.entity_id).filter((id): id is string => Boolean(id))),
  );

  if (purchaseIds.length > MAX_PURCHASE_IDS_PER_REFRESH) {
    return { ok: false as const };
  }

  if (purchaseIds.length === 0) {
    return {
      direct: 0,
      none: 0,
      ok: true as const,
      related: 0,
      review: 0,
      rowsCalculated: 0,
    };
  }

  const { data, error } = await supabase.rpc("refresh_recovery_cart_recovery_status_v2_for_purchases", {
    p_purchase_ids: purchaseIds,
  });
  const result = data as RecoveryStatusRefreshResult | null;

  if (error || result?.ok !== true) {
    return { ok: false as const };
  }

  return {
    direct: result.direct ?? 0,
    none: result.none ?? 0,
    ok: true as const,
    related: result.related ?? 0,
    review: result.review ?? 0,
    rowsCalculated: result.rowsCalculated ?? 0,
  };
}

export async function POST(request: NextRequest) {
  const incomingSecret = request.headers.get("x-mcparking-recovery-secret");
  const expectedSecret = process.env.N8N_RECOVERY_PURCHASES_SECRET;
  const secretValid = isValidPurchaseSyncSecret(incomingSecret, expectedSecret);

  if (!secretValid) {
    return jsonError("No autorizado.", 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Debes enviar JSON valido.", 400);
  }

  const prepared = prepareRecoveryPurchaseSync(payload);
  if (!prepared.ok) {
    return jsonError(prepared.error, prepared.status, prepared.invalidRows);
  }
  if (prepared.empty) {
    return NextResponse.json(emptyResult());
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("import_recovery_purchases_m2m", {
    p_file_hash: prepared.fileHash,
    p_file_name: prepared.fileName,
    p_file_size: prepared.fileSize,
    p_rows: prepared.rows,
    p_summary: prepared.summary,
  });

  if (error) {
    return jsonError("No se pudo importar el lote de compras.", 500);
  }
  if (!data || typeof data !== "object") {
    return jsonError("La importacion no devolvio un resumen valido.", 500);
  }

  const result = data as ImportRpcResult;
  const batchId = result.batchId ?? null;

  if (!batchId) {
    return jsonError("La importacion no devolvio un lote valido.", 500);
  }

  // The import commits before this read-model refresh. Replaying the same
  // deterministic batch safely retries only the idempotent attribution step.
  const attributionRefresh = await refreshRecoveryStatusesForBatch(supabase, batchId);

  if (!attributionRefresh.ok) {
    return jsonError("La compra se importo, pero no se pudo actualizar la atribucion.", 500);
  }

  return NextResponse.json({
    attributionRefresh,
    batchId,
    bookingDuplicateRows: result.bookingDuplicateRows ?? 0,
    conflictRows: result.conflictRows ?? 0,
    fileAlreadyImported: result.fileAlreadyImported === true,
    insertedRows: result.insertedRows ?? 0,
    internalDuplicateRows: result.internalDuplicateRows ?? 0,
    invalidRows: result.invalidRows ?? 0,
    ok: true,
    rowsReceived: result.rowsReceived ?? prepared.rows?.length ?? 0,
    skippedDuplicateRows: result.skippedDuplicateRows ?? 0,
    sourceDuplicateRows: result.sourceDuplicateRows ?? 0,
    updatedRows: result.updatedRows ?? 0,
  });
}
