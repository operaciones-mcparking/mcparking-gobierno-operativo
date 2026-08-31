export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";

import { buildOperationalOccupancyReadModel, isValidOccupancyDate } from "@/lib/dashboard/ocupacion";
import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { getCommercialOccupancyRpcData, getPhysicalOccupancyRpcData } from "@/lib/orquestador/supabase-admin";

const allowedParams = new Set(["from", "to"]);
const noStoreHeaders = { "Cache-Control": "no-store" };

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { headers: noStoreHeaders, status });
}

export async function GET(request: NextRequest) {
  const admin = await getActiveAdminUser();
  if (!admin.ok) {
    return jsonError(admin.reason === "unauthenticated" ? "No autenticado." : "No autorizado.", admin.reason === "unauthenticated" ? 401 : 403);
  }

  for (const key of request.nextUrl.searchParams.keys()) {
    if (!allowedParams.has(key)) return jsonError("Parametro no permitido.", 400);
  }

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!isValidOccupancyDate(from) || !isValidOccupancyDate(to) || from > to) {
    return jsonError("Rango de fechas invalido.", 400);
  }

  const [physicalResult, commercialResult] = await Promise.all([
    getPhysicalOccupancyRpcData(from, to),
    getCommercialOccupancyRpcData(from, to),
  ]);
  if (physicalResult.error || commercialResult.error) {
    return jsonError("No fue posible consultar la ocupacion operacional.", 500);
  }

  const occupancy = buildOperationalOccupancyReadModel({
    commercial: commercialResult.data,
    from,
    physical: physicalResult.data,
    to,
  });
  if (!occupancy) return jsonError("No fue posible consultar la ocupacion operacional.", 500);

  return NextResponse.json(occupancy, { headers: noStoreHeaders });
}
