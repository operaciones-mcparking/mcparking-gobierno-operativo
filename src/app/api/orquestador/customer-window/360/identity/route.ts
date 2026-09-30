export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";

import { traceCustomer360RpcCall } from "@/lib/customer-window/customer-360-caller-trace";
import { isCustomer360RepresentationEnabled } from "@/lib/customer-window/customer-360-db";
import { customer360ErrorStatus, customer360LocatorFromRequest } from "@/lib/customer-window/customer-360-http";
import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { getCustomerWindow360GlobalReviewIdentity } from "@/lib/orquestador/supabase-admin";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const admin = await getActiveAdminUser();
  if (!admin.ok) {
    return NextResponse.json(
      { code: admin.reason === "unauthenticated" ? "unauthenticated" : "forbidden", ok: false },
      { headers: noStoreHeaders, status: admin.reason === "unauthenticated" ? 401 : 403 },
    );
  }
  const locator = customer360LocatorFromRequest(request);
  if (!locator || locator.representationType !== "global_review") {
    return NextResponse.json(
      { code: "invalid_locator_contract", ok: false },
      { headers: noStoreHeaders, status: 400 },
    );
  }
  if (!isCustomer360RepresentationEnabled(locator.representationType)) {
    return NextResponse.json(
      { code: "representation_authority_unavailable", ok: false },
      { headers: noStoreHeaders, status: 503 },
    );
  }
  const trace = traceCustomer360RpcCall("identity");
  const result = await getCustomerWindow360GlobalReviewIdentity(locator, trace);
  if (result.errorCode) {
    return NextResponse.json(
      { code: result.errorCode, ok: false },
      { headers: noStoreHeaders, status: customer360ErrorStatus(result.errorCode) },
    );
  }
  return NextResponse.json(result.data, { headers: noStoreHeaders });
}
