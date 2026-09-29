export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";

import { customer360ErrorStatus, customer360LocatorFromRequest } from "@/lib/customer-window/customer-360-http";
import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { getCustomerWindow360BoletaAnalytics } from "@/lib/orquestador/supabase-admin";

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
  if (!locator || locator.representationType !== "confirmed_customer") {
    return NextResponse.json(
      { code: "invalid_locator_contract", ok: false },
      { headers: noStoreHeaders, status: 400 },
    );
  }

  const result = await getCustomerWindow360BoletaAnalytics(locator);
  if (result.errorCode) {
    return NextResponse.json(
      { code: result.errorCode, ok: false },
      { headers: noStoreHeaders, status: customer360ErrorStatus(result.errorCode) },
    );
  }
  return NextResponse.json(result.data, { headers: noStoreHeaders });
}
