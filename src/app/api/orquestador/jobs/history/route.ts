export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { getOrchestratorJobById, listOrchestratorJobsPage } from "@/lib/orquestador/supabase-admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestampPattern = /^d{4}-d{2}-d{2}T/;
const pageSize = 50;

export async function GET(request: Request) {
  const admin = await getActiveAdminUser();
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.reason === "unauthenticated" ? "No autenticado." : "No autorizado.", ok: false },
      { status: admin.reason === "unauthenticated" ? 401 : 403 },
    );
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId");
  if (jobId !== null) {
    if (!uuidPattern.test(jobId) || url.searchParams.size !== 1) {
      return NextResponse.json({ error: "Job ID inválido.", ok: false }, { status: 400 });
    }

    const result = await getOrchestratorJobById(jobId);
    if (result.error) {
      return NextResponse.json({ error: "No fue posible buscar el job.", ok: false }, { status: 500 });
    }
    if (!result.data) {
      return NextResponse.json({ error: "No encontrado.", ok: false }, { status: 404 });
    }
    return NextResponse.json({ job: result.data, ok: true });
  }

  const beforeCreatedAt = url.searchParams.get("beforeCreatedAt");
  const beforeId = url.searchParams.get("beforeId");
  if (
    (beforeCreatedAt === null) !== (beforeId === null)
    || (beforeCreatedAt !== null && (!timestampPattern.test(beforeCreatedAt) || Number.isNaN(new Date(beforeCreatedAt).getTime())))
    || (beforeId !== null && !uuidPattern.test(beforeId))
  ) {
    return NextResponse.json({ error: "Cursor inválido.", ok: false }, { status: 400 });
  }

  const result = await listOrchestratorJobsPage({
    beforeCreatedAt,
    beforeId,
    limit: pageSize + 1,
  });
  if (result.error) {
    return NextResponse.json({ error: "No fue posible cargar el historial.", ok: false }, { status: 500 });
  }

  return NextResponse.json({
    hasMore: result.data.length > pageSize,
    jobs: result.data.slice(0, pageSize),
    ok: true,
  });
}