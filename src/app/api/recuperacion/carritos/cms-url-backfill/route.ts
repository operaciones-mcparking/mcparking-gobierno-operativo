import { createRequire } from "node:module";
import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const requireFromRoute = createRequire(import.meta.url);
const { parseCsv } = requireFromRoute("../../../../../../scripts/recovery/purchases-csv-validator.js") as {
  parseCsv: (csvContent: string) => { rows: Array<Record<string, string>> };
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const CMS_URL_BACKFILL_CHUNK_SIZE = 1000;

type CmsUrlBackfillRow = {
  booking_id: string | null;
  cms_url: string | null;
  source_id: string | null;
};

type CmsUrlBackfillRpcResult = {
  alreadyHadCmsUrlRows?: number;
  ambiguousBookingRows?: number;
  notFoundRows?: number;
  ok?: boolean;
  rowsTotal?: number;
  rowsWithCmsUrl?: number;
  skippedMissingCmsUrl?: number;
  skippedMissingKey?: number;
  updatedRows?: number;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

async function requireAdminForApi() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: jsonError("No autenticado.", 401), ok: false as const };
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("app_role,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { error: jsonError(error.message, 500), ok: false as const };
  }

  if (!profile || profile.app_role !== "admin" || profile.status !== "active") {
    return { error: jsonError("No autorizado.", 403), ok: false as const };
  }

  return { ok: true as const, supabase };
}

function cleanText(raw: unknown) {
  if (raw === null || raw === undefined) return null;

  const value = String(raw).trim();

  return value.length > 0 ? value : null;
}

function toBackfillRow(row: Record<string, string>): CmsUrlBackfillRow {
  return {
    booking_id: cleanText(row.booking_id),
    cms_url: cleanText(row.cms_url),
    source_id: cleanText(row.id),
  };
}

function emptyTotals(): Required<Omit<CmsUrlBackfillRpcResult, "ok">> {
  return {
    alreadyHadCmsUrlRows: 0,
    ambiguousBookingRows: 0,
    notFoundRows: 0,
    rowsTotal: 0,
    rowsWithCmsUrl: 0,
    skippedMissingCmsUrl: 0,
    skippedMissingKey: 0,
    updatedRows: 0,
  };
}

function addTotals(accumulated: Required<Omit<CmsUrlBackfillRpcResult, "ok">>, result: CmsUrlBackfillRpcResult) {
  accumulated.alreadyHadCmsUrlRows += result.alreadyHadCmsUrlRows ?? 0;
  accumulated.ambiguousBookingRows += result.ambiguousBookingRows ?? 0;
  accumulated.notFoundRows += result.notFoundRows ?? 0;
  accumulated.rowsTotal += result.rowsTotal ?? 0;
  accumulated.rowsWithCmsUrl += result.rowsWithCmsUrl ?? 0;
  accumulated.skippedMissingCmsUrl += result.skippedMissingCmsUrl ?? 0;
  accumulated.skippedMissingKey += result.skippedMissingKey ?? 0;
  accumulated.updatedRows += result.updatedRows ?? 0;
}

function safeErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message ?? "")
        : String(error ?? "");
  const normalized = message.trim();

  if (!normalized || normalized === "[object Object]" || normalized.length > 500 || /<html|<!doctype|cloudflare/i.test(normalized)) {
    return "No se pudo completar el backfill de cms_url.";
  }

  return normalized;
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminForApi();

  if (!admin.ok) {
    return admin.error;
  }

  const supabase = admin.supabase;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError("Debes enviar un archivo CSV en el campo file.", 400);
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return jsonError("Solo se aceptan archivos .csv.", 400);
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return jsonError("El archivo supera el limite de 10 MB.", 413);
  }

  try {
    const csvContent = await file.text();
    const { rows } = parseCsv(csvContent);
    const totals = emptyTotals();
    let currentChunk: CmsUrlBackfillRow[] = [];
    let chunksTotal = 0;

    async function flushChunk() {
      if (currentChunk.length === 0) return;

      const rowsForRpc = currentChunk;
      currentChunk = [];
      chunksTotal += 1;

      const { data, error } = await supabase.rpc("backfill_recovery_incomplete_booking_cms_urls", {
        p_rows: rowsForRpc,
      });

      if (error) {
        throw error;
      }

      if (!data || typeof data !== "object") {
        throw new Error("El backfill no devolvio un resumen valido.");
      }

      addTotals(totals, data as CmsUrlBackfillRpcResult);
    }

    for (const row of rows) {
      currentChunk.push(toBackfillRow(row));

      if (currentChunk.length >= CMS_URL_BACKFILL_CHUNK_SIZE) {
        await flushChunk();
      }
    }

    await flushChunk();

    return NextResponse.json({
      chunkSize: CMS_URL_BACKFILL_CHUNK_SIZE,
      chunksTotal,
      fileName: file.name,
      ok: true,
      summary: totals,
    });
  } catch (error) {
    return jsonError(safeErrorMessage(error), 500);
  }
}