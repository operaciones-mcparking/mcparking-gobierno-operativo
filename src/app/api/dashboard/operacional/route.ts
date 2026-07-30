export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";

import {
  isValidOperationalDashboardDate,
  isValidOperationalDashboardUuid,
  normalizeOperationalDashboardRpcResult,
  type OperationalDashboardQuery,
} from "@/lib/dashboard/operacional";
import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { getOperationalDashboardRpcData } from "@/lib/orquestador/supabase-admin";

const allowedParams = new Set(["date", "from", "to", "parking_codigo", "sistema_grupo", "source_run_id"]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

function optionalText(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function parseQuery(request: NextRequest): { error: string; query: null } | { error: null; query: OperationalDashboardQuery } {
  for (const key of request.nextUrl.searchParams.keys()) {
    if (!allowedParams.has(key)) {
      return { error: "Parametro no permitido.", query: null };
    }
  }

  const query: OperationalDashboardQuery = {
    date: optionalText(request.nextUrl.searchParams.get("date")),
    from: optionalText(request.nextUrl.searchParams.get("from")),
    parking_codigo: optionalText(request.nextUrl.searchParams.get("parking_codigo")),
    sistema_grupo: optionalText(request.nextUrl.searchParams.get("sistema_grupo")),
    source_run_id: optionalText(request.nextUrl.searchParams.get("source_run_id")),
    to: optionalText(request.nextUrl.searchParams.get("to")),
  };

  if (query.date !== null && !isValidOperationalDashboardDate(query.date)) {
    return { error: "Parametro date invalido.", query: null };
  }

  if (query.from !== null && !isValidOperationalDashboardDate(query.from)) {
    return { error: "Parametro from invalido.", query: null };
  }

  if (query.to !== null && !isValidOperationalDashboardDate(query.to)) {
    return { error: "Parametro to invalido.", query: null };
  }

  if (query.source_run_id !== null && !isValidOperationalDashboardUuid(query.source_run_id)) {
    return { error: "Parametro source_run_id invalido.", query: null };
  }

  return { error: null, query };
}

export async function GET(request: NextRequest) {
  const admin = await getActiveAdminUser();

  if (!admin.ok) {
    return jsonError(admin.reason === "unauthenticated" ? "No autenticado." : "No autorizado.", admin.reason === "unauthenticated" ? 401 : 403);
  }

  const parsed = parseQuery(request);
  if (parsed.error || !parsed.query) {
    return jsonError(parsed.error ?? "Parametros invalidos.", 400);
  }

  const rpcResult = await getOperationalDashboardRpcData(parsed.query);
  if (rpcResult.error) {
    return jsonError("No fue posible consultar el dashboard operacional.", 500);
  }

  const dashboard = normalizeOperationalDashboardRpcResult(rpcResult.data);
  if (!dashboard) {
    return jsonError("No fue posible consultar el dashboard operacional.", 500);
  }

  return NextResponse.json({ dashboard, ok: true });
}
