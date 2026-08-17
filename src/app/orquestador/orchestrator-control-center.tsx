import {
  Activity,
  Boxes,
  Clock,
  Server,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/dashboard/data-table";
import { KpiCard, Panel } from "@/components/dashboard/shell";
import { BANCO_PACKS_TARGET_WORKER_ID, BANCO_PACKS_UPDATE_JOB_TYPE, getBancoPacksUpdateReadiness } from "@/lib/orquestador/banco-packs-actualizar-packs";
import { BANCO_RESERVAS_LAST_WEEK_JOB_TYPE, BANCO_RESERVAS_TARGET_WORKER_ID, getBancoReservasReadiness } from "@/lib/orquestador/banco-reservas-last-week";
import { DASHBOARD_LAST_MONTH_JOB_TYPE, DASHBOARD_TARGET_WORKER_ID, getDashboardLastMonthReadiness } from "@/lib/orquestador/dashboard-last-month";
import { classifyWorkerHealth, type WorkerHealth } from "@/lib/orquestador/liveness";
import {
  listOrchestratorEvents,
  listOrchestratorJobsPage,
  listOrchestratorJobTypes,
  listOrchestratorWorkers,
} from "@/lib/orquestador/supabase-admin";
import type { OrchestratorEvent, OrchestratorJob, OrchestratorJobType, OrchestratorWorker } from "@/lib/orquestador/types";
import { ActualizarDatosOperacionalesControl } from "./actualizar-datos-operacionales-control";
import { BancoPacksUpdateControl } from "./banco-packs-update-control";
import { BancoReservasLastWeekControl } from "./banco-reservas-last-week-control";
import { DashboardLastMonthControl } from "./dashboard-last-month-control";
import { OrquestadorRefreshButton } from "./refresh-button";
import { RecentProcesses } from "./recent-processes";
import { SourceConnectionCheckControl } from "./source-connection-check-control";
import { WorkerHealthCheckButton } from "./worker-health-check-button";

type LoadResult = {
  errors: string[];
  events: OrchestratorEvent[];
  hasMoreJobs: boolean;
  jobs: OrchestratorJob[];
  jobTypes: OrchestratorJobType[];
  workers: OrchestratorWorker[];
};

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

function formatDate(value?: string | null) {
  if (!value) {
    return "Sin registro";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateFormatter.format(date);
}

function shortId(value?: string | null) {
  return value ? value.slice(0, 8) : "-";
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();

  if (["idle", "succeeded"].includes(normalized)) return "success";
  if (["queued", "claimed", "running", "busy"].includes(normalized)) return "info";
  if (["failed", "error", "offline"].includes(normalized)) return "danger";
  if (["cancelled"].includes(normalized)) return "warning";

  return "neutral";
}

function StatusBadge({ value }: { value: string }) {
  const tone = statusTone(value);
  const classes = {
    danger: "border-[#ffd4a3] bg-[#fff8ef] text-[#8a4a00]",
    info: "border-[#c9d8e4] bg-[#eef4f8] text-[#023574]",
    neutral: "border-[#d7e3ec] bg-[#f8fbfd] text-slate-600",
    success: "border-[#cfeeda] bg-[#f1fbf4] text-[#22613b]",
    warning: "border-[#ffe699] bg-[#fffaf0] text-[#765900]",
  }[tone];

  return (
    <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${classes}`}>
      {value}
    </span>
  );
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${
        enabled
          ? "border-[#cfeeda] bg-[#f1fbf4] text-[#22613b]"
          : "border-[#d7e3ec] bg-[#f8fbfd] text-slate-600"
      }`}
    >
      {enabled ? "Habilitado" : "Deshabilitado"}
    </span>
  );
}

function ErrorPanel({ errors }: { errors: string[] }) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 rounded-lg border border-[#e6b8a6] bg-[#fff4ef] p-4 text-sm text-[#91472b]">
      <p className="font-medium">No se pudo cargar toda la informacion del orquestador.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

function ControlCenterSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="mt-5">
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight text-navy">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function workerHealthDisplay(health: WorkerHealth) {
  return {
    AVAILABLE: { label: "Disponible", tone: "success" as const },
    BUSY: { label: "Ejecutando", tone: "info" as const },
    STALE: { label: "Sin señal", tone: "warning" as const },
    OFFLINE_OR_UNKNOWN: { label: "Estado desconocido", tone: "danger" as const },
  }[health];
}

function OperationStatusBadge({ label, tone }: { label: string; tone: "danger" | "info" | "success" | "warning" }) {
  const classes = {
    danger: "border-[#ffd4a3] bg-[#fff8ef] text-[#8a4a00]",
    info: "border-[#c9d8e4] bg-[#eef4f8] text-[#023574]",
    success: "border-[#cfeeda] bg-[#f1fbf4] text-[#22613b]",
    warning: "border-[#ffe699] bg-[#fffaf0] text-[#765900]",
  }[tone];

  return <span className={`w-fit rounded-md border px-2.5 py-1 text-xs font-medium ${classes}`}>{label}</span>;
}

async function loadOrquestadorData(): Promise<LoadResult> {
  const [workers, jobs, events, jobTypes] = await Promise.all([
    listOrchestratorWorkers(),
    listOrchestratorJobsPage({ limit: 51 }),
    listOrchestratorEvents(),
    listOrchestratorJobTypes(),
  ]);

  const errors = [
    workers.error ? "No fue posible consultar los workers." : null,
    jobs.error ? "No fue posible consultar los jobs." : null,
    events.error ? "No fue posible consultar los eventos." : null,
    jobTypes.error ? "No fue posible consultar los tipos de job." : null,
  ].filter((message): message is string => Boolean(message));

  return {
    errors,
    events: events.data,
    hasMoreJobs: jobs.data.length > 50,
    jobs: jobs.data.slice(0, 50),
    jobTypes: jobTypes.data,
    workers: workers.data,
  };
}

export async function OrchestratorControlCenter() {
  const { errors, events, hasMoreJobs, jobs, jobTypes, workers } = await loadOrquestadorData();
  const activeWorkers = workers.filter((worker) => worker.status !== "offline").length;
  const activeJobs = jobs.filter((job) => ["queued", "claimed", "running"].includes(job.status)).length;
  const runningJobs = jobs.filter((job) => ["claimed", "running"].includes(job.status)).length;
  const queuedJobs = jobs.filter((job) => job.status === "queued").length;
  const lastHeartbeat = workers
    .map((worker) => worker.last_seen_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const operationStatus =
    activeWorkers === 0
      ? { label: "Equipo local desconectado", tone: "danger" as const }
      : activeJobs > 0
        ? { label: "Proceso en curso", tone: "info" as const }
        : errors.length > 0
          ? { label: "Requiere atencion", tone: "warning" as const }
          : { label: "Operacion disponible", tone: "success" as const };
  const sourceConnectionJobType = jobTypes.find((jobType) => jobType.job_type === "source_connection_check");
  const bancoPacksJobType = jobTypes.find((jobType) => jobType.job_type === BANCO_PACKS_UPDATE_JOB_TYPE);
  const bancoPacksReadiness = getBancoPacksUpdateReadiness({
    jobType: bancoPacksJobType,
    jobs,
    worker: workers.find((worker) => worker.worker_id === BANCO_PACKS_TARGET_WORKER_ID),
  });
  const dashboardLastMonthJobType = jobTypes.find((jobType) => jobType.job_type === DASHBOARD_LAST_MONTH_JOB_TYPE);
  const dashboardLastMonthReadiness = getDashboardLastMonthReadiness({
    jobType: dashboardLastMonthJobType,
    jobs,
    worker: workers.find((worker) => worker.worker_id === DASHBOARD_TARGET_WORKER_ID),
  });
  const bancoReservasJobType = jobTypes.find((jobType) => jobType.job_type === BANCO_RESERVAS_LAST_WEEK_JOB_TYPE);
  const bancoReservasReadiness = getBancoReservasReadiness({
    jobType: bancoReservasJobType,
    jobs,
    worker: workers.find((worker) => worker.worker_id === BANCO_RESERVAS_TARGET_WORKER_ID),
  });

  return (
    <>
      <ErrorPanel errors={errors} />

      <ControlCenterSection title="Estado operacional">
        <div className="rounded-xl border border-[#d6e1ea] bg-white p-5 shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600">Resumen del sistema</p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-navy">{operationStatus.label}</p>
            </div>
            <OperationStatusBadge label={operationStatus.label} tone={operationStatus.tone} />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard icon={Server} label="Equipos activos" status="Solo lectura" value={`${activeWorkers}/${workers.length}`} />
            <KpiCard icon={Activity} label="Procesos en curso" value={runningJobs} />
            <KpiCard icon={Activity} label="Cola pendiente" value={queuedJobs} />
            <KpiCard icon={Boxes} label="Tipos de proceso" value={jobTypes.length} />
            <KpiCard icon={Clock} label="Ultima señal" value={formatDate(lastHeartbeat)} />
          </div>
        </div>
      </ControlCenterSection>

      <ControlCenterSection title="Actualizar datos operacionales">
        <ActualizarDatosOperacionalesControl />
      </ControlCenterSection>

      <ControlCenterSection title="Acciones individuales">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <BancoReservasLastWeekControl readinessCode={bancoReservasReadiness.code} />
          <BancoPacksUpdateControl readinessCode={bancoPacksReadiness.code} />
          <DashboardLastMonthControl readinessCode={dashboardLastMonthReadiness.code} />
        </div>
      </ControlCenterSection>

      <ControlCenterSection description="Usar para validar el estado tecnico del sistema." title="Herramientas de comprobacion">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex max-w-md flex-col gap-3 rounded-lg border border-[#d6e1ea] bg-white p-3 text-sm text-slate-600 shadow-sm">
            <p className="font-medium text-navy">Estado de pantalla</p>
            <OrquestadorRefreshButton />
            <WorkerHealthCheckButton />
          </div>
          <SourceConnectionCheckControl enabled={sourceConnectionJobType?.enabled === true} />
        </div>
      </ControlCenterSection>

      <Panel count={`${jobs.length} procesos`} title="Procesos recientes">
        <RecentProcesses hasMore={hasMoreJobs} jobs={jobs} />
      </Panel>

      <ControlCenterSection title="Diagnostico tecnico">
        <Panel count={`${workers.length} workers`} title="Equipos conectados / Workers">
          <div className="mt-5">
            <DataTable minWidth="760px">
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Worker</DataTableHeaderCell>
                  <DataTableHeaderCell>Nombre</DataTableHeaderCell>
                  <DataTableHeaderCell>Estado</DataTableHeaderCell>
                  <DataTableHeaderCell>Heartbeat</DataTableHeaderCell>
                  <DataTableHeaderCell>Job actual</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {workers.map((worker) => {
                  const health = workerHealthDisplay(classifyWorkerHealth(worker));

                  return (
                    <DataTableRow key={worker.worker_id}>
                      <DataTableCell strong>{worker.worker_id}</DataTableCell>
                      <DataTableCell>{worker.display_name ?? "Sin nombre"}</DataTableCell>
                      <DataTableCell>
                        <OperationStatusBadge label={health.label} tone={health.tone} />
                      </DataTableCell>
                      <DataTableCell>{formatDate(worker.last_seen_at)}</DataTableCell>
                      <DataTableCell>{shortId(worker.locked_job_id)}</DataTableCell>
                    </DataTableRow>
                  );
                })}
              </DataTableBody>
            </DataTable>
            {workers.length === 0 ? <p className="mt-4 text-sm text-slate-600">No hay workers registrados.</p> : null}
          </div>
        </Panel>

        <Panel count={`${events.length} eventos`} title="Registro tecnico / Eventos recientes">
          <div className="mt-5">
            <DataTable minWidth="920px">
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Fecha</DataTableHeaderCell>
                  <DataTableHeaderCell>Evento</DataTableHeaderCell>
                  <DataTableHeaderCell>Job</DataTableHeaderCell>
                  <DataTableHeaderCell>Worker</DataTableHeaderCell>
                  <DataTableHeaderCell>Mensaje</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {events.map((event) => (
                  <DataTableRow key={event.id}>
                    <DataTableCell>{formatDate(event.created_at)}</DataTableCell>
                    <DataTableCell strong>{event.event_type}</DataTableCell>
                    <DataTableCell>{shortId(event.job_id)}</DataTableCell>
                    <DataTableCell>{event.worker_id ?? "-"}</DataTableCell>
                    <DataTableCell>{event.message ?? "-"}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
            {events.length === 0 ? <p className="mt-4 text-sm text-slate-600">No hay eventos recientes.</p> : null}
          </div>
        </Panel>

        <Panel count={`${jobTypes.length} tipos`} title="Procesos disponibles / Tipos de job">
          <div className="mt-5">
            <DataTable minWidth="900px">
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Tipo</DataTableHeaderCell>
                  <DataTableHeaderCell>Nombre</DataTableHeaderCell>
                  <DataTableHeaderCell>Estado</DataTableHeaderCell>
                  <DataTableHeaderCell>Descripcion</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {jobTypes.map((jobType) => (
                  <DataTableRow key={jobType.job_type}>
                    <DataTableCell strong>{jobType.job_type}</DataTableCell>
                    <DataTableCell>{jobType.name}</DataTableCell>
                    <DataTableCell>
                      <EnabledBadge enabled={jobType.enabled} />
                    </DataTableCell>
                    <DataTableCell>{jobType.description ?? "Sin descripcion"}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
            {jobTypes.length === 0 ? <p className="mt-4 text-sm text-slate-600">No hay tipos de job registrados.</p> : null}
          </div>
        </Panel>
      </ControlCenterSection>
    </>
  );
}
