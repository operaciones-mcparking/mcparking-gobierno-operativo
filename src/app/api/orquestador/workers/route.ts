export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { listOrchestratorWorkers } from "@/lib/orquestador/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

export async function GET() {
  const admin = await getActiveAdminUser();

  if (!admin.ok) {
    return jsonError(admin.reason === "unauthenticated" ? "No autenticado." : "No autorizado.", admin.reason === "unauthenticated" ? 401 : 403);
  }

  const { data, error } = await listOrchestratorWorkers();

  if (error) {
    return jsonError("No fue posible consultar los workers.", 500);
  }

  return NextResponse.json({ ok: true, workers: data });
}