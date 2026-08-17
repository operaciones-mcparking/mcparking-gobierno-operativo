import { NextResponse } from "next/server";

import { validateRecoveryDryRun } from "@/lib/orquestador/liveness";
import { recoverStuckWorkerAsAdmin } from "@/lib/orquestador/liveness-server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Body = { action?: unknown; confirmRecovery?: unknown; jobId?: unknown; workerId?: unknown };

export async function POST(request: Request) {
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Solicitud inválida.", ok: false }, { status: 400 }); }
  if ((body.action !== "dry-run" && body.action !== "recover") || typeof body.jobId !== "string" || !uuidPattern.test(body.jobId) || typeof body.workerId !== "string" || !body.workerId.trim()) return NextResponse.json({ error: "Solicitud inválida.", ok: false }, { status: 400 });
  if (body.action === "recover" && body.confirmRecovery !== "RECUPERAR") return NextResponse.json({ error: "Confirmación final requerida.", ok: false }, { status: 400 });
  const input = { workerId: body.workerId.trim(), recentHours: 24, reason: `Recuperación web controlada del job ${body.jobId}`, dryRun: true };
  const dryRun = await recoverStuckWorkerAsAdmin(input);
  if (!dryRun.ok) return NextResponse.json({ error: dryRun.reason === "unauthenticated" ? "No autenticado." : dryRun.reason === "forbidden" ? "No autorizado." : "No fue posible comprobar la recuperación.", ok: false }, { status: dryRun.reason === "unauthenticated" ? 401 : dryRun.reason === "forbidden" ? 403 : 409 });
  const validation = validateRecoveryDryRun(dryRun.data, body.jobId, input.workerId);
  if (!validation.safe) return NextResponse.json({ error: validation.reason === "ambiguous" ? "No es seguro recuperar automáticamente esta ejecución porque se detectaron varias ejecuciones asociadas al worker. Requiere revisión manual." : "La comprobación previa no identificó de forma inequívoca esta ejecución.", ok: false, safe: false }, { status: 409 });
  if (body.action === "dry-run") return NextResponse.json({ ok: true, safe: true, message: "La comprobación previa confirmó una única ejecución interrumpida." });
  const recovered = await recoverStuckWorkerAsAdmin({ ...input, dryRun: false });
  if (!recovered.ok) return NextResponse.json({ error: "No fue posible recuperar la ejecución.", ok: false }, { status: 409 });
  return NextResponse.json({ ok: true, recovered: true, message: "Ejecución recuperada. El job fue cerrado como fallido y el worker quedó disponible." });
}