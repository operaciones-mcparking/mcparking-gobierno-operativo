import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock3,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";

import {
  shortCompositeJobId,
  type CompositeRunStepStatus,
  type CompositeRunViewModel,
} from "@/lib/orquestador/composite-runs";

type CompositeRunViewerProps = {
  className?: string;
  compact?: boolean;
  onRetry?: () => void;
  run: CompositeRunViewModel;
  title?: string;
};

const statusLabels: Record<CompositeRunStepStatus, string> = {
  blocked: "No ejecutado",
  cancelled: "Cancelado",
  claimed: "Ejecutando",
  failed: "Fallo",
  pending: "Pendiente",
  queued: "En cola",
  running: "Ejecutando",
  succeeded: "Completado",
};

const runStatusLabels: Record<CompositeRunViewModel["status"], string> = {
  cancelled: "Cancelado",
  failed: "Fallido",
  ready: "Listo",
  running: "En ejecucion",
  succeeded: "Completado",
  waiting: "En espera",
};

const toneClasses: Record<CompositeRunStepStatus | CompositeRunViewModel["status"], string> = {
  blocked: "border-[#d7e3ec] bg-[#f8fbfd] text-slate-600",
  cancelled: "border-[#ffe699] bg-[#fffaf0] text-[#765900]",
  claimed: "border-[#c9d8e4] bg-[#eef4f8] text-[#023574]",
  failed: "border-[#ffd4a3] bg-[#fff8ef] text-[#8a4a00]",
  pending: "border-[#d7e3ec] bg-[#f8fbfd] text-slate-600",
  queued: "border-[#c9d8e4] bg-[#eef4f8] text-[#023574]",
  ready: "border-[#d7e3ec] bg-[#f8fbfd] text-slate-600",
  running: "border-[#c9d8e4] bg-[#eef4f8] text-[#023574]",
  succeeded: "border-[#cfeeda] bg-[#f1fbf4] text-[#22613b]",
  waiting: "border-[#d7e3ec] bg-[#f8fbfd] text-slate-600",
};

function StepIcon({ status }: { status: CompositeRunStepStatus }) {
  const className = "h-4 w-4";

  if (status === "succeeded") return <CheckCircle2 aria-hidden="true" className={className} />;
  if (status === "failed") return <AlertTriangle aria-hidden="true" className={className} />;
  if (status === "cancelled") return <Ban aria-hidden="true" className={className} />;
  if (status === "claimed" || status === "running") return <LoaderCircle aria-hidden="true" className={`${className} animate-spin`} />;
  if (status === "queued") return <Clock3 aria-hidden="true" className={className} />;

  return <CircleDashed aria-hidden="true" className={className} />;
}

function formatDuration(value: number | null) {
  if (value === null) {
    return "-";
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  if (minutes === 0) {
    return `${seconds} s`;
  }

  if (seconds === 0) {
    return `${minutes} min`;
  }

  return `${minutes} min ${seconds} s`;
}

function resultMessage(run: CompositeRunViewModel) {
  if (run.status === "succeeded") {
    return "Actualizacion completada correctamente";
  }

  if (run.status === "failed") {
    return `La secuencia se detuvo en el paso ${run.current_step ?? "-"}`;
  }

  if (run.status === "cancelled") {
    return "La secuencia fue cancelada";
  }

  if (run.status === "running") {
    return `Ejecutando paso ${run.current_step ?? "-"} de ${run.total_steps}`;
  }

  return null;
}

export function CompositeRunViewer({
  className = "",
  compact = false,
  onRetry,
  run,
  title = "Ejecucion compuesta",
}: CompositeRunViewerProps) {
  const completedSteps = run.steps.filter((step) => step.status === "succeeded").length;
  const progressPercent = run.total_steps > 0 ? Math.round((completedSteps / run.total_steps) * 100) : 0;
  const message = resultMessage(run);

  return (
    <section className={`rounded-lg border border-[#d6e1ea] bg-white ${compact ? "p-3" : "p-4"} text-sm text-slate-600 shadow-sm ${className}`} aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-medium text-navy">{title}</h2>
          <p className="mt-1 text-xs leading-5">
            Run {run.run_id ? shortCompositeJobId(run.run_id) : "-"} - {run.kind || "sin tipo"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {run.duration_seconds !== null ? (
            <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2.5 py-1 text-xs font-medium text-slate-600">
              Duracion {formatDuration(run.duration_seconds)}
            </span>
          ) : null}
          <span className={`rounded-md border px-2.5 py-1 text-xs font-medium ${toneClasses[run.status]}`}>{runStatusLabels[run.status]}</span>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-navy">
            Paso {run.current_step ?? completedSteps} de {run.total_steps}
          </span>
          <span>{progressPercent}% completado</span>
        </div>
        <div
          aria-label="Progreso de ejecucion compuesta"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progressPercent}
          className="mt-2 h-2 rounded-full bg-[#e8f0f5]"
          role="progressbar"
        >
          <div className="h-2 rounded-full bg-sea transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <ol className="mt-4 divide-y divide-[#d6e1ea] rounded-lg border border-[#d6e1ea] bg-[#f8fbfd]">
        {run.steps.map((step) => (
          <li
            key={step.step}
            className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(14rem,1fr)_9rem_5rem] sm:items-center sm:gap-4"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Paso {step.step}</p>
              <p className="mt-0.5 truncate whitespace-nowrap font-medium text-navy">{step.label}</p>
            </div>
            <div className="sm:flex sm:justify-start">
              <span className={`inline-flex w-fit items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${toneClasses[step.status]}`}>
                <StepIcon status={step.status} />
                {statusLabels[step.status]}
              </span>
            </div>
            <p className="text-xs font-medium text-slate-600 sm:text-right">{formatDuration(step.duration_seconds)}</p>
            {step.safe_error ? <p className="text-xs font-medium leading-5 text-[#8a4a00] sm:col-span-3">{step.safe_error}</p> : null}
          </li>
        ))}
      </ol>

      {message || onRetry ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-[#d6e1ea] pt-4 sm:flex-row sm:items-center sm:justify-between">
          {message ? <p className="text-sm font-medium text-navy">{message}</p> : <span />}
          {onRetry ? (
            <button
              className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm font-medium text-navy shadow-sm transition hover:border-sea hover:bg-[#fbfdff]"
              onClick={onRetry}
              type="button"
            >
              <RotateCcw className="h-4 w-4 text-sea" />
              Reintentar visualizacion
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
