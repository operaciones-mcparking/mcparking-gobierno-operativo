export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { getOrchestratorJobTechnicalDetail } from "@/lib/orquestador/supabase-admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, ok: false }, { status });
}

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const admin = await getActiveAdminUser();

  if (!admin.ok) {
    return jsonError(admin.reason === "unauthenticated" ? "No autenticado." : "No autorizado.", admin.reason === "unauthenticated" ? 401 : 403);
  }

  const { jobId } = await params;
  if (!uuidPattern.test(jobId)) {
    return jsonError("Job no encontrado.", 404);
  }

  const detail = await getOrchestratorJobTechnicalDetail(jobId);

  if (detail.error) {
    return jsonError("No fue posible consultar el detalle tecnico del job.", 500);
  }

  if (!detail.data) {
    return jsonError("Job no encontrado.", 404);
  }

  return NextResponse.json({ detail: detail.data, ok: true });
}
