import { NextResponse } from "next/server";

import { retryStandaloneJobAsAdmin } from "@/lib/orquestador/liveness-server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!uuidPattern.test(jobId)) return NextResponse.json({ error: "Job no encontrado.", ok: false }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud inválida.", ok: false }, { status: 400 }); }
  if (!body || typeof body !== "object" || (body as { confirmRetry?: unknown }).confirmRetry !== "REINTENTAR" || Object.keys(body).length !== 1) return NextResponse.json({ error: "Confirmación requerida.", ok: false }, { status: 400 });
  const result = await retryStandaloneJobAsAdmin(jobId);
  if (!result.ok) {
    const messages = { unauthenticated: "No autenticado.", forbidden: "No autorizado.", "invalid-input": "Solicitud inválida.", "not-found": "Job no encontrado.", "invalid-status": "Solo se pueden reintentar jobs fallidos.", "rpc-error": "No fue posible crear el reintento.", "composite-not-supported": "El reintento de ejecuciones compuestas aún requiere recuperación del flujo completo.", "duplicate-active": "Ya existe una ejecución activa equivalente." } as const;
    return NextResponse.json({ error: messages[result.reason], ok: false }, { status: result.reason === "unauthenticated" ? 401 : result.reason === "forbidden" ? 403 : 409 });
  }
  return NextResponse.json({ job: result.data, ok: true });
}