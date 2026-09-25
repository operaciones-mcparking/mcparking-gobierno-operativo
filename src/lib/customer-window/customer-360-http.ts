import type { NextRequest } from "next/server";

import {
  normalizeCustomer360Locator,
  type Customer360ErrorCode,
  type Customer360Locator,
} from "@/lib/customer-window/customer-360-v1";

export function customer360LocatorFromRequest(request: NextRequest): Customer360Locator | null {
  const authoritySnapshotId = request.nextUrl.searchParams.get("authoritySnapshotId");
  return normalizeCustomer360Locator({
    authoritySnapshotId,
    customerUniverse: request.nextUrl.searchParams.get("customerUniverse"),
    representationId: request.nextUrl.searchParams.get("representationId"),
    representationKey: request.nextUrl.searchParams.get("representationKey"),
    representationType: request.nextUrl.searchParams.get("representationType"),
  });
}

export function customer360ErrorStatus(code: Customer360ErrorCode) {
  if (code === "invalid_locator_contract") return 400;
  if (code === "authority_not_found" || code === "representation_not_found") return 404;
  if (code === "stale_representation") return 409;
  return 503;
}
