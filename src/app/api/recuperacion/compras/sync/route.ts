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
  return NextResponse.json({
    batchId: result.batchId ?? null,
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
