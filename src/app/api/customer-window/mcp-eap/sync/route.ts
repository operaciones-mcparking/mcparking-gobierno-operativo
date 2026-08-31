import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

import { mapMcpEapBookingSourceRow, type CustomerSourceBookingMcpEapInsert } from "@/lib/customer-window/mcp-eap-booking-mapper";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_ROWS_PER_REQUEST = 500;
const SOURCE = "MCP_BUCHUNGEN";
const NORMALIZED_INPUT_FIELDS = [
  "booking_status", "brand_normalized", "email_normalized", "is_pack",
  "parking_normalized", "phone_normalized", "plate_normalized", "row_hash", "source_row_id",
] as const;

const requireFromRoute = createRequire(import.meta.url);
const { isValidPurchaseSyncSecret } = requireFromRoute(
  "../../../../../../scripts/recovery/purchases-json-adapter.js",
) as {
  isValidPurchaseSyncSecret: (incomingSecret: string | null, expectedSecret: string | undefined) => boolean;
};

type ImportRpcResult = {
  conflictRows?: number;
  insertedRows?: number;
  invalidRows?: number;
  rowsReceived?: number;
  unchangedRows?: number;
  updatedRows?: number;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasNormalizedInput(row: Record<string, unknown>) {
  return NORMALIZED_INPUT_FIELDS.some((field) => Object.hasOwn(row, field));
}

export async function POST(request: NextRequest) {
  const secretValid = isValidPurchaseSyncSecret(
    request.headers.get("x-mcparking-recovery-secret"),
    process.env.N8N_RECOVERY_PURCHASES_SECRET,
  );
  if (!secretValid) return jsonError("No autorizado.", 401);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Debes enviar JSON valido.", 400);
  }

  if (!isPlainObject(payload) || payload.source !== SOURCE) return jsonError("Fuente MCP/EAP invalida.", 400);
  if (!Array.isArray(payload.rows)) return jsonError("rows debe ser un arreglo.", 400);
  if (payload.rows.length === 0) return jsonError("El lote debe contener al menos una fila.", 400);
  if (payload.rows.length > MAX_ROWS_PER_REQUEST) {
    return jsonError(`El lote supera el maximo de ${MAX_ROWS_PER_REQUEST} filas.`, 413);
  }

  const mappedRows: CustomerSourceBookingMcpEapInsert[] = [];
  let invalidRows = 0;
  for (const rawRow of payload.rows) {
    if (!isPlainObject(rawRow) || hasNormalizedInput(rawRow)) {
      invalidRows += 1;
      continue;
    }
    try {
      mappedRows.push(mapMcpEapBookingSourceRow(rawRow));
    } catch {
      invalidRows += 1;
    }
  }

  const countsBySourceRowId = new Map<number, number>();
  for (const row of mappedRows) {
    countsBySourceRowId.set(row.source_row_id, (countsBySourceRowId.get(row.source_row_id) ?? 0) + 1);
  }
  const uniqueRows = mappedRows.filter((row) => countsBySourceRowId.get(row.source_row_id) === 1);
  const localConflictRows = mappedRows.length - uniqueRows.length;

  if (uniqueRows.length === 0) {
    return NextResponse.json({
      conflictRows: localConflictRows,
      insertedRows: 0,
      invalidRows,
      ok: true,
      rowsReceived: payload.rows.length,
      unchangedRows: 0,
      updatedRows: 0,
    });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("import_customer_source_bookings_mcp_eap_m2m", { p_rows: uniqueRows });
  if (error) return jsonError("No se pudo importar el lote MCP/EAP.", 500);
  if (!data || typeof data !== "object") return jsonError("La importacion MCP/EAP no devolvio un resumen valido.", 500);

  const result = data as ImportRpcResult;
  return NextResponse.json({
    conflictRows: localConflictRows + (result.conflictRows ?? 0),
    insertedRows: result.insertedRows ?? 0,
    invalidRows: invalidRows + (result.invalidRows ?? 0),
    ok: true,
    rowsReceived: payload.rows.length,
    unchangedRows: result.unchangedRows ?? 0,
    updatedRows: result.updatedRows ?? 0,
  });
}
