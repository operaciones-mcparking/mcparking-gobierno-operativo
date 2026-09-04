export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";

import { isCustomerSearchType } from "@/lib/customer-window/customer-search";
import { getActiveAdminUser } from "@/lib/orquestador/auth";
import {
  getCustomerWindowSummary,
  listCustomerWindowBookings,
  searchCustomerWindowCustomers,
} from "@/lib/orquestador/supabase-admin";

const noStoreHeaders = { "Cache-Control": "no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
  return NextResponse.json({ error, ok: false }, { headers: noStoreHeaders, status });
}

function boundedInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

export async function GET(request: NextRequest) {
  const admin = await getActiveAdminUser();
  if (!admin.ok) {
    return jsonError(
      admin.reason === "unauthenticated" ? "No autenticado." : "No autorizado.",
      admin.reason === "unauthenticated" ? 401 : 403,
    );
  }

  const action = request.nextUrl.searchParams.get("action");
  if (action === "search") {
    const type = request.nextUrl.searchParams.get("type");
    const value = request.nextUrl.searchParams.get("value")?.trim() ?? "";
    const limit = boundedInteger(request.nextUrl.searchParams.get("limit"), 20, 100);
    if (!isCustomerSearchType(type) || !value || limit === null) {
      return jsonError("Busqueda invalida.", 400);
    }
    const result = await searchCustomerWindowCustomers(type, value, limit);
    return result.error
      ? jsonError("No fue posible buscar clientes.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  const customerId = request.nextUrl.searchParams.get("customerId") ?? "";
  if (!uuidPattern.test(customerId)) return jsonError("Customer ID invalido.", 400);

  if (action === "summary") {
    const result = await getCustomerWindowSummary(customerId);
    return result.error
      ? jsonError("No fue posible consultar el cliente.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  if (action === "bookings") {
    const page = boundedInteger(request.nextUrl.searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const pageSize = boundedInteger(request.nextUrl.searchParams.get("pageSize"), 20, 100);
    if (page === null || pageSize === null) return jsonError("Paginacion invalida.", 400);
    const result = await listCustomerWindowBookings(customerId, page, pageSize);
    return result.error
      ? jsonError("No fue posible consultar el historial.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  return jsonError("Accion invalida.", 400);
}
