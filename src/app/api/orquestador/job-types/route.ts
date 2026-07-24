export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { listOrchestratorJobTypes } from "@/lib/orquestador/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

export async function GET() {
  const admin = await getActiveAdminUser();

  if (!admin.ok) {
    return jsonError(admin.reason === "unauthenticated" ? "No autenticado." : "No autorizado.", admin.reason === "unauthenticated" ? 401 : 403);
  }

  const { data, error } = await listOrchestratorJobTypes();

  if (error) {
    return jsonError("No fue posible consultar los tipos de job.", 500);
  }

  return NextResponse.json({ jobTypes: data, ok: true });
}