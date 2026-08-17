export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getActiveAdminUser } from "@/lib/orquestador/auth";
import { getLatestJobProgress } from "@/lib/orquestador/liveness";
import { getOrchestratorJobById, listOrchestratorJobEvents, listOrchestratorWorkers } from "@/lib/orquestador/supabase-admin";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const admin = await getActiveAdminUser();
  if (!admin.ok) return NextResponse.json({ error: admin.reason === "unauthenticated" ? "No autenticado." : "No autorizado.", ok: false }, { status: admin.reason === "unauthenticated" ? 401 : 403 });
  const { jobId } = await context.params;
  if (!uuidPattern.test(jobId)) return NextResponse.json({ error: "Job no encontrado.", ok: false }, { status: 404 });
  const [jobResult, workers, events] = await Promise.all([getOrchestratorJobById(jobId), listOrchestratorWorkers(), listOrchestratorJobEvents(jobId, 50)]);
  if (jobResult.error || workers.error || events.error) return NextResponse.json({ error: "No fue posible consultar la salud de la ejecución.", ok: false }, { status: 500 });
  const job = jobResult.data;
  if (!job) return NextResponse.json({ error: "Job no encontrado.", ok: false }, { status: 404 });
  const worker = workers.data.find((item) => item.worker_id === job.worker_id) ?? null;
  return NextResponse.json({ job, worker, progress: getLatestJobProgress(events.data), ok: true });
}