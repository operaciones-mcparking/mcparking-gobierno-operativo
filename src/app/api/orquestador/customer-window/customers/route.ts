export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";

import { isCustomerSearchType } from "@/lib/customer-window/customer-search";
import { getActiveAdminUser } from "@/lib/orquestador/auth";
import {
  getCustomerWindowSummary,
  listCustomerWindowBookings,
  listCustomerWindowCustomersByPurchasePeriod,
  searchCustomerWindowCustomers,
} from "@/lib/orquestador/supabase-admin";

const noStoreHeaders = { "Cache-Control": "no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const allowedFamilies = new Set(["MCP_EAP", "OKP"]);
const allowedLifecycleStatuses = new Set(["NEW", "FREQUENT"]);
const allowedTiers = new Set(["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"]);
const allowedPackStatuses = new Set(["PACK", "NO_PACK"]);
const allowedBrandBehaviors = new Set(["ONLY_MCP_EAP", "ONLY_OKP", "MIGRATED_TO_MCP_EAP", "MIGRATED_TO_OKP", "ALTERNATING"]);

function jsonError(error: string, status: number) {
  return NextResponse.json({ error, ok: false }, { headers: noStoreHeaders, status });
}

function boundedInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function optionalAllowedValue(value: string | null, allowed: Set<string>) {
  return value === null || value === "" ? null : allowed.has(value) ? value : undefined;
}

function isValidDateValue(value: string) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
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
  if (action === "list-by-period") {
    const from = request.nextUrl.searchParams.get("from") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    const family = request.nextUrl.searchParams.get("family") ?? "";
    const page = boundedInteger(request.nextUrl.searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
    const pageSize = boundedInteger(request.nextUrl.searchParams.get("pageSize"), 25, 100);
    const lifecycleStatus = optionalAllowedValue(request.nextUrl.searchParams.get("lifecycleStatus"), allowedLifecycleStatuses);
    const tier = optionalAllowedValue(request.nextUrl.searchParams.get("tier"), allowedTiers);
    const packStatus = optionalAllowedValue(request.nextUrl.searchParams.get("packStatus"), allowedPackStatuses);
    const brandBehavior = optionalAllowedValue(request.nextUrl.searchParams.get("brandBehavior"), allowedBrandBehaviors);
    if (
      !isValidDateValue(from) || !isValidDateValue(to) || from > to || !allowedFamilies.has(family)
      || page === null || pageSize === null || lifecycleStatus === undefined || tier === undefined
      || packStatus === undefined || brandBehavior === undefined
    ) {
      return jsonError("Listado por periodo invalido.", 400);
    }
    const result = await listCustomerWindowCustomersByPurchasePeriod({
      brandBehavior,
      family: family as "MCP_EAP" | "OKP",
      from,
      lifecycleStatus,
      packStatus,
      page,
      pageSize,
      tier,
      to,
    });
    return result.error
      ? jsonError("No fue posible consultar clientes por periodo.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

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
