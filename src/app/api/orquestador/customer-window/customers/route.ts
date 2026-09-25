export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";

import { buildCustomerWindowSearchTermsV2, isCustomerSearchType } from "@/lib/customer-window/customer-search";
import { isCustomerWindowRepresentationTypeV2 } from "@/lib/customer-window/customer-representations-v2";
import { getActiveAdminUser } from "@/lib/orquestador/auth";
import {
  getCustomerWindowClassificationCriteria,
  getCustomerWindowCommercialSignals,
  getCustomerWindowEconomics,
  getCustomerWindowIdentities,
  getCustomerWindowRefreshHealth,
  getCustomerWindowV2IdentityResolutionDetail,
  getCustomerWindowPurchasePeriodMetrics,
  getCustomerWindowSummary,
  getCustomerWindowV2PurchasePeriodFacets,
  getCustomerWindowV2RepresentationSummary,
  listCustomerWindowBookings,
  listCustomerWindowCustomersByPurchasePeriod,
  listCustomerWindowV2RepresentationBookings,
  listCustomerWindowV2RepresentationsByPurchasePeriod,
  searchCustomerWindowCustomers,
  searchCustomerWindowV2Representations,
} from "@/lib/orquestador/supabase-admin";

const noStoreHeaders = { "Cache-Control": "no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const allowedFamilies = new Set(["MCP_EAP", "OKP"]);
const allowedLifecycleStatuses = new Set(["NEW", "FREQUENT"]);
const allowedTiers = new Set(["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"]);
const allowedPackStatuses = new Set(["PACK", "NO_PACK"]);
const allowedBrandBehaviors = new Set(["ONLY_MCP_EAP", "ONLY_OKP", "MIGRATED_TO_MCP_EAP", "MIGRATED_TO_OKP", "ALTERNATING"]);
const postgresIntegerMaximum = 2_147_483_647;

function jsonError(error: string, status: number, retryable?: boolean) {
  return NextResponse.json(
    { error, ok: false, ...(typeof retryable === "boolean" ? { retryable } : {}) },
    { headers: noStoreHeaders, status },
  );
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
  if (action === "refresh-health") {
    const result = await getCustomerWindowRefreshHealth();
    return result.error
      ? jsonError("No fue posible consultar el estado de actualizacion.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  if (action === "criteria") {
    const result = await getCustomerWindowClassificationCriteria();
    return result.error
      ? jsonError("No fue posible consultar los criterios de clasificacion.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  if (action === "period-metrics") {
    const from = request.nextUrl.searchParams.get("from") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    const lifecycleStatus = optionalAllowedValue(request.nextUrl.searchParams.get("lifecycleStatus"), allowedLifecycleStatuses);
    const tier = optionalAllowedValue(request.nextUrl.searchParams.get("tier"), allowedTiers);
    const packStatus = optionalAllowedValue(request.nextUrl.searchParams.get("packStatus"), allowedPackStatuses);
    const brandBehavior = optionalAllowedValue(request.nextUrl.searchParams.get("brandBehavior"), allowedBrandBehaviors);
    if (
      !isValidDateValue(from) || !isValidDateValue(to) || from > to
      || lifecycleStatus === undefined || tier === undefined || packStatus === undefined || brandBehavior === undefined
    ) {
      return jsonError("Metricas por periodo invalidas.", 400);
    }
    const result = await getCustomerWindowPurchasePeriodMetrics({
      brandBehavior,
      from,
      lifecycleStatus,
      packStatus,
      tier,
      to,
    });
    return result.error
      ? jsonError("No fue posible consultar las metricas del periodo.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

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

  if (action === "list-by-period-v2") {
    const from = request.nextUrl.searchParams.get("from") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    const page = boundedInteger(request.nextUrl.searchParams.get("page"), 1, postgresIntegerMaximum);
    const pageSize = boundedInteger(request.nextUrl.searchParams.get("pageSize"), 25, 100);
    if (!isValidDateValue(from) || !isValidDateValue(to) || from > to || page === null || pageSize === null) {
      return jsonError("Listado de representaciones por periodo invalido.", 400);
    }
    const result = await listCustomerWindowV2RepresentationsByPurchasePeriod({
      from,
      page,
      pageSize,
      to,
    });
    return result.error
      ? jsonError("No fue posible consultar representaciones por periodo.", 500, result.retryable)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  if (action === "period-facets-v2") {
    const from = request.nextUrl.searchParams.get("from") ?? "";
    const to = request.nextUrl.searchParams.get("to") ?? "";
    if (!isValidDateValue(from) || !isValidDateValue(to) || from > to) {
      return jsonError("Facetas de representaciones por periodo invalidas.", 400);
    }
    const result = await getCustomerWindowV2PurchasePeriodFacets({ from, to });
    return result.error
      ? jsonError("No fue posible consultar las facetas del periodo.", 500, result.retryable)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  if (action === "summary-v2") {
    const representationType = request.nextUrl.searchParams.get("representationType");
    const representationId = request.nextUrl.searchParams.get("representationId")?.trim() ?? "";
    if (!isCustomerWindowRepresentationTypeV2(representationType) || !representationId || representationId.length > 128) {
      return jsonError("Representacion invalida.", 400);
    }
    const result = await getCustomerWindowV2RepresentationSummary({ representationId, representationType });
    return result.error
      ? jsonError("No fue posible consultar la representacion.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  if (action === "identity-resolution-detail-v2") {
    const representationType = request.nextUrl.searchParams.get("representationType");
    const relatedGroupId = request.nextUrl.searchParams.get("relatedGroupId")?.trim() ?? "";
    if (representationType !== "related_review" || !/^[0-9a-f]{64}$/.test(relatedGroupId)) {
      return jsonError("Detalle de resolucion de identidad invalido.", 400);
    }
    const result = await getCustomerWindowV2IdentityResolutionDetail(relatedGroupId);
    return result.error
      ? jsonError("No fue posible consultar el detalle de resolucion de identidad.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  if (action === "bookings-v2") {
    const representationType = request.nextUrl.searchParams.get("representationType");
    const representationId = request.nextUrl.searchParams.get("representationId")?.trim() ?? "";
    const page = boundedInteger(request.nextUrl.searchParams.get("page"), 1, postgresIntegerMaximum);
    const pageSize = boundedInteger(request.nextUrl.searchParams.get("pageSize"), 25, 100);
    if (
      !isCustomerWindowRepresentationTypeV2(representationType)
      || !representationId
      || representationId.length > 128
      || page === null
      || pageSize === null
    ) {
      return jsonError("Historial de representacion invalido.", 400);
    }
    const result = await listCustomerWindowV2RepresentationBookings({
      page,
      pageSize,
      representationId,
      representationType,
    });
    return result.error
      ? jsonError("No fue posible consultar el historial de la representacion.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  if (action === "search-v2") {
    const query = request.nextUrl.searchParams.get("query") ?? "";
    const limit = boundedInteger(request.nextUrl.searchParams.get("limit"), 20, 20);
    const terms = buildCustomerWindowSearchTermsV2(query);
    if (!terms || limit === null) return jsonError("Busqueda de representaciones invalida.", 400);
    const result = await searchCustomerWindowV2Representations({ ...terms, limit });
    return result.error
      ? jsonError("No fue posible buscar representaciones.", 500)
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

  if (action === "economics") {
    const result = await getCustomerWindowEconomics(customerId);
    return result.error
      ? jsonError("No fue posible consultar la economia del cliente.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  if (action === "signals") {
    const result = await getCustomerWindowCommercialSignals(customerId);
    return result.error
      ? jsonError("No fue posible consultar el perfil de compra.", 500)
      : NextResponse.json(result.data, { headers: noStoreHeaders });
  }

  if (action === "identities") {
    const result = await getCustomerWindowIdentities(customerId);
    return result.error
      ? jsonError("No fue posible consultar las identidades del cliente.", 500)
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
