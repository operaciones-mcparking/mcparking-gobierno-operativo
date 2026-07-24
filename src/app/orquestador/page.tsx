export const dynamic = "force-dynamic";

import {
  Activity,
  Boxes,
  Clock,
  Server,
} from "lucide-react";

import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/dashboard/data-table";
import { DashboardShell, KpiCard, Panel } from "@/components/dashboard/shell";
import { requireAdminAccess } from "@/lib/auth/admin";
import {
  listOrchestratorEvents,
  listOrchestratorJobs,
  listOrchestratorJobTypes,
  listOrchestratorWorkers,
} from "@/lib/orquestador/supabase-admin";
import type { OrchestratorEvent, OrchestratorJob, OrchestratorJobType, OrchestratorWorker } from "@/lib/orquestador/types";
import { OrquestadorRefreshButton } from "./refresh-button";

type LoadResult = {
  errors: string[];
  events: OrchestratorEvent[];
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
  if (["queued", "running", "busy"].includes(normalized)) return "info";
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

async function loadOrquestadorData(): Promise<LoadResult> {
  const [workers, jobs, events, jobTypes] = await Promise.all([
    listOrchestratorWorkers(),
    listOrchestratorJobs(),
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
    jobs: jobs.data,
    jobTypes: jobTypes.data,
    workers: workers.data,
  };
}

export default async function OrquestadorPage() {
  await requireAdminAccess();
  const { errors, events, jobs, jobTypes, workers } = await loadOrquestadorData();
  const activeWorkers = workers.filter((worker) => worker.status !== "offline").length;
  const activeJobs = jobs.filter((job) => ["queued", "running"].includes(job.status)).length;
  const lastHeartbeat = workers
    .map((worker) => worker.last_seen_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <DashboardShell
      activePath="/orquestador"
      description="Estado de workers, heartbeats, jobs, eventos y tipos registrados en el orquestador existente."
      eyebrow="Control operativo"
      title="Orquestador"
    >
      <ErrorPanel errors={errors} />

      <section className="mt-5 grid gap-4 md:grid-cols-4">
        <KpiCard icon={Server} label="Workers activos" status="Solo lectura" value={`${activeWorkers}/${workers.length}`} />
        <KpiCard icon={Activity} label="Jobs en curso o cola" value={activeJobs} />
        <KpiCard icon={Boxes} label="Tipos de job" value={jobTypes.length} />
        <KpiCard icon={Clock} label="Ultimo heartbeat" value={formatDate(lastHeartbeat)} />
      </section>

      <Panel count={`${workers.length} workers`} title="Workers">
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
              {workers.map((worker) => (
                <DataTableRow key={worker.worker_id}>
                  <DataTableCell strong>{worker.worker_id}</DataTableCell>
                  <DataTableCell>{worker.display_name ?? "Sin nombre"}</DataTableCell>
                  <DataTableCell>
                    <StatusBadge value={worker.status} />
                  </DataTableCell>
                  <DataTableCell>{formatDate(worker.last_seen_at)}</DataTableCell>
                  <DataTableCell>{shortId(worker.locked_job_id)}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
          {workers.length === 0 ? <p className="mt-4 text-sm text-slate-600">No hay workers registrados.</p> : null}
        </div>
      </Panel>

      <Panel count={`${jobs.length} jobs`} title="Ultimos jobs">
        <div className="mt-5">
          <DataTable minWidth="1080px">
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>ID</DataTableHeaderCell>
                <DataTableHeaderCell>Tipo</DataTableHeaderCell>
                <DataTableHeaderCell>Estado</DataTableHeaderCell>
                <DataTableHeaderCell>Worker</DataTableHeaderCell>
                <DataTableHeaderCell>Intentos</DataTableHeaderCell>
                <DataTableHeaderCell>Creado</DataTableHeaderCell>
                <DataTableHeaderCell>Inicio</DataTableHeaderCell>
                <DataTableHeaderCell>Fin</DataTableHeaderCell>
                <DataTableHeaderCell>Error</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {jobs.map((job) => (
                <DataTableRow key={job.id}>
                  <DataTableCell strong>{shortId(job.id)}</DataTableCell>
                  <DataTableCell>{job.job_type}</DataTableCell>
                  <DataTableCell>
                    <StatusBadge value={job.status} />
                  </DataTableCell>
                  <DataTableCell>{job.worker_id ?? "-"}</DataTableCell>
                  <DataTableCell>{job.attempts ?? 0}/{job.max_attempts ?? 1}</DataTableCell>
                  <DataTableCell>{formatDate(job.created_at)}</DataTableCell>
                  <DataTableCell>{formatDate(job.started_at)}</DataTableCell>
                  <DataTableCell>{formatDate(job.finished_at)}</DataTableCell>
                  <DataTableCell>{job.error_message ?? "-"}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
          {jobs.length === 0 ? <p className="mt-4 text-sm text-slate-600">No hay jobs recientes.</p> : null}
        </div>
      </Panel>

      <Panel count={`${events.length} eventos`} title="Eventos recientes">
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

      <Panel count={`${jobTypes.length} tipos`} title="Tipos de job">
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
    </DashboardShell>
  );
}
