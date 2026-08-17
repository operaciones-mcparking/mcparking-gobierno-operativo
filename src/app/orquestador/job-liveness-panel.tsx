"use client";

import { AlertTriangle, Loader2, RotateCcw, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { classifyJobHealth, type JobHealth, type JobProgress } from "@/lib/orquestador/liveness";
import type { OrchestratorJob, OrchestratorWorker } from "@/lib/orquestador/types";

type LivenessResponse = { job?: OrchestratorJob; worker?: OrchestratorWorker | null; progress?: JobProgress | null; error?: string; ok?: boolean };
type ActionResponse = { error?: string; message?: string; ok?: boolean; safe?: boolean };

type Props = { allowActions?: boolean; compact?: boolean; jobId: string };

const healthCopy: Record<JobHealth, { label: string; description: string; classes: string }> = {
  HEALTHY_RUNNING: { label: "Ejecutando normalmente", description: "El worker continúa reportando actividad.", classes: "border-[#cfeeda] bg-[#f1fbf4] text-[#22613b]" },
  STALE_RUNNING: { label: "Sin actividad reciente", description: "El proceso puede seguir ejecutándose. Estamos esperando una nueva señal.", classes: "border-[#ffe699] bg-[#fffaf0] text-[#765900]" },
  ORPHAN_SUSPECTED: { label: "Posible ejecución interrumpida", description: "El worker está activo, pero esta ejecución dejó de reportar actividad.", classes: "border-[#ffd4a3] bg-[#fff8ef] text-[#8a4a00]" },
  UNKNOWN_BLOCKED: { label: "Estado por verificar", description: "No hay señales suficientes para determinar el estado de esta ejecución.", classes: "border-[#d7e3ec] bg-[#f8fbfd] text-slate-600" },
};

const dateFormatter = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", second: "2-digit", timeZone: "America/Santiago" });

function timestamp(value: string | null | undefined) { const result = value ? new Date(value).getTime() : Number.NaN; return Number.isFinite(result) ? result : null; }
function relative(value: string | null | undefined, now: number) {
  const valueMs = timestamp(value); if (valueMs === null) return "Sin señal";
  const seconds = Math.max(0, Math.floor((now - valueMs) / 1000));
  if (seconds < 60) return `Hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60); const remainder = seconds % 60;
  return remainder ? `Hace ${minutes} min ${remainder} s` : `Hace ${minutes} min`;
}
function duration(startedAt: string | null | undefined, now: number) {
  const start = timestamp(startedAt); if (start === null) return "Sin registro";
  const total = Math.max(0, Math.floor((now - start) / 1000));
  const hours = Math.floor(total / 3600); const minutes = Math.floor((total % 3600) / 60); const seconds = total % 60;
  return hours > 0 ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function short(value: string | null | undefined) { return value ? `${value.slice(0, 8)}...` : "Sin registro"; }
function time(value: string | null | undefined) { const ms = timestamp(value); return ms === null ? "Sin registro" : dateFormatter.format(new Date(ms)); }

export function JobLivenessPanel({ allowActions = true, compact = false, jobId }: Props) {
  const router = useRouter();
  const [data, setData] = useState<LivenessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryState, setRecoveryState] = useState<"idle" | "checking" | "safe" | "recovering" | "done">("idle");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [retryOpen, setRetryOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/orquestador/jobs/${jobId}/liveness`, { cache: "no-store" });
      const body = await response.json() as LivenessResponse;
      if (!response.ok || !body.ok || !body.job) { setError(body.error ?? "No fue posible consultar la salud de la ejecución."); return null; }
      setData(body); setError(null); return body;
    } catch { setError("No fue posible consultar la salud de la ejecución."); return null; }
  }, [jobId]);

  useEffect(() => { void load(); const poll = window.setInterval(() => void load(), 20_000); return () => window.clearInterval(poll); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1_000); return () => window.clearInterval(timer); }, []);

  const health = useMemo(() => data?.job ? classifyJobHealth({ job: data.job, worker: data.worker ?? null, now: new Date(now) }) : "UNKNOWN_BLOCKED", [data, now]);
  const copy = healthCopy[health];
  const job = data?.job;
  const worker = data?.worker;
  const progressText = data?.progress?.message ?? (job?.status === "running" ? "Ejecutando job" : "Sin etapa reciente");
  const canRecover = allowActions && health === "ORPHAN_SUSPECTED" && Boolean(job?.worker_id);
  const canRetry = allowActions && job?.status === "failed" && !job.compositeRunId;

  async function openRecovery() {
    if (!job?.worker_id || !canRecover) return;
    setRecoveryOpen(true); setRecoveryState("checking"); setActionMessage(null);
    try {
      const response = await fetch("/api/orquestador/jobs/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dry-run", jobId, workerId: job.worker_id }) });
      const body = await response.json() as ActionResponse;
      if (!response.ok || !body.ok || !body.safe) { setRecoveryState("idle"); setActionMessage(body.error ?? "No fue posible comprobar la recuperación."); return; }
      setRecoveryState("safe"); setActionMessage(body.message ?? null);
    } catch { setRecoveryState("idle"); setActionMessage("No fue posible comprobar la recuperación."); }
  }

  async function confirmRecovery() {
    if (!job?.worker_id || recoveryState !== "safe") return;
    setRecoveryState("recovering"); setActionMessage(null);
    try {
      const response = await fetch("/api/orquestador/jobs/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "recover", confirmRecovery: "RECUPERAR", jobId, workerId: job.worker_id }) });
      const body = await response.json() as ActionResponse;
      if (!response.ok || !body.ok) { setRecoveryState("safe"); setActionMessage(body.error ?? "No fue posible recuperar la ejecución."); return; }
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const observed = await load();
        if (observed?.job?.status === "failed" && !observed.worker?.currentJobId) break;
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }
      setRecoveryState("done"); setActionMessage(body.message ?? null); router.refresh();
    } catch { setRecoveryState("safe"); setActionMessage("No fue posible recuperar la ejecución."); }
  }

  async function confirmRetry() {
    if (!canRetry || retrying) return;
    setRetrying(true); setActionMessage(null);
    try {
      const response = await fetch(`/api/orquestador/jobs/${jobId}/retry`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmRetry: "REINTENTAR" }) });
      const body = await response.json() as ActionResponse;
      if (!response.ok || !body.ok) { setActionMessage(body.error ?? "No fue posible crear el reintento."); return; }
      setRetryOpen(false); setActionMessage("Se creó una nueva ejecución. El job original permanece fallido."); router.refresh();
    } catch { setActionMessage("No fue posible crear el reintento."); } finally { setRetrying(false); }
  }

  if (!job) return error ? <p className="text-xs text-[#8a4a00]">{error}</p> : <p className="text-xs text-slate-500">Cargando salud de ejecución...</p>;

  return (
    <>
      <section className={compact ? "mt-3 border-t border-[#e6eef4] pt-3" : "rounded-lg border border-[#d6e1ea] bg-[#f8fbfd] p-3"}>
        {!compact ? <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-navy">Salud de ejecución</h3> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2"><span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${copy.classes}`}>{copy.label}</span></div>
        <p className="mt-2 text-xs leading-5 text-slate-600">{copy.description}</p>
        <dl className={`mt-3 grid gap-3 text-xs ${compact ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          <div><dt className="text-slate-500">Etapa actual</dt><dd className="mt-1 font-medium text-navy">{progressText}</dd></div>
          <div><dt className="text-slate-500">Última señal</dt><dd className="mt-1 font-medium text-navy">{relative(job.lastHeartbeatAt, now)}</dd></div>
          <div><dt className="text-slate-500">Duración</dt><dd className="mt-1 font-medium text-navy">{duration(job.started_at, now)}</dd></div>
          <div><dt className="text-slate-500">Worker</dt><dd className="mt-1 font-medium text-navy">{job.worker_id ?? "Sin asignar"}</dd></div>
          {!compact ? <div><dt className="text-slate-500">Instancia</dt><dd className="mt-1 font-medium text-navy">{short(worker?.instanceId)}</dd></div> : null}
          {!compact ? <div><dt className="text-slate-500">Inicio worker / job</dt><dd className="mt-1 font-medium text-navy">{time(worker?.startedAt)} · {time(job.started_at)}</dd></div> : null}
        </dl>
        {actionMessage && !recoveryOpen ? <p className="mt-3 text-xs text-[#8a4a00]" aria-live="polite">{actionMessage}</p> : null}
        {allowActions ? <div className="mt-3 flex flex-wrap gap-2">
          {canRecover ? <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d8a56d] bg-white px-2.5 text-xs font-medium text-[#8a4a00]" onClick={openRecovery} type="button"><Wrench className="h-3.5 w-3.5" />Recuperar ejecución</button> : null}
          {canRetry ? <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#cbd8e3] bg-white px-2.5 text-xs font-medium text-navy" onClick={() => { setRetryOpen(true); setActionMessage(null); }} type="button"><RotateCcw className="h-3.5 w-3.5" />Reintentar</button> : null}
          {job.status === "failed" && job.compositeRunId ? <p className="text-xs text-slate-500">El reintento de ejecuciones compuestas aún requiere recuperación del flujo completo.</p> : null}
        </div> : null}
      </section>

      {recoveryOpen ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-3" role="presentation"><div aria-modal="true" className="w-full max-w-lg rounded-lg border border-[#d6e1ea] bg-white p-4 shadow-xl" role="dialog"><div className="flex justify-between gap-3"><div><h2 className="font-semibold text-navy">Esta ejecución parece interrumpida.</h2><p className="mt-1 text-xs text-slate-500">Job {job.id.slice(0, 8)} · {job.job_type}</p></div><button aria-label="Cerrar recuperación" onClick={() => setRecoveryOpen(false)} type="button"><X className="h-4 w-4" /></button></div><p className="mt-3 text-sm text-slate-600">Worker: {job.worker_id}<br />Última señal: {relative(job.lastHeartbeatAt, now)}<br />Etapa: {progressText}<br />Duración: {duration(job.started_at, now)}</p>{recoveryState === "checking" ? <p className="mt-3 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Comprobando recuperación segura...</p> : null}{actionMessage ? <p className="mt-3 text-sm text-[#8a4a00]" aria-live="polite">{actionMessage}</p> : null}<div className="mt-4 flex justify-end gap-2"><button className="h-9 rounded-md border border-[#cbd8e3] px-3 text-sm" onClick={() => setRecoveryOpen(false)} type="button">Cancelar</button>{recoveryState === "safe" ? <button className="h-9 rounded-md border border-[#d8a56d] bg-[#8a4a00] px-3 text-sm font-medium text-white" onClick={confirmRecovery} type="button">Recuperar ejecución</button> : null}</div></div></div> : null}

      {retryOpen ? <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-3" role="presentation"><div aria-modal="true" className="w-full max-w-md rounded-lg border border-[#d6e1ea] bg-white p-4 shadow-xl" role="dialog"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 text-[#8a4a00]" /><div><h2 className="font-semibold text-navy">Reintentar ejecución</h2><p className="mt-2 text-sm text-slate-600">Se creará un job nuevo. La ejecución original {job.id.slice(0, 8)} permanecerá fallida.</p><p className="mt-2 text-xs text-slate-500">{job.error_message ?? "Sin error detallado"} · Worker {job.worker_id ?? "sin asignar"}</p></div></div>{actionMessage ? <p className="mt-3 text-sm text-[#8a4a00]">{actionMessage}</p> : null}<div className="mt-4 flex justify-end gap-2"><button className="h-9 rounded-md border border-[#cbd8e3] px-3 text-sm" onClick={() => setRetryOpen(false)} type="button">Cancelar</button><button className="h-9 rounded-md bg-navy px-3 text-sm font-medium text-white disabled:opacity-60" disabled={retrying} onClick={confirmRetry} type="button">{retrying ? "Creando..." : "Reintentar"}</button></div></div></div> : null}
    </>
  );
}