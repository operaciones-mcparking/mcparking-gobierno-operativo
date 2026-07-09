import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Edit3,
  HelpCircle,
  ShieldCheck,
  UserRound,
  Workflow,
} from "lucide-react";

import { TypedBadge, ValueBadge } from "@/components/dashboard/badge";
import { ProcessMatrixTools } from "@/components/dashboard/process-matrix-tools";
import { DashboardShell, Panel } from "@/components/dashboard/shell";
import {
  getProcessBottlenecks,
  getProcessCatalogItem,
  getProcessMatrix,
} from "@/lib/dashboard/data";

type Params = Promise<{
  processId: string;
}>;

function Value({ value }: { value: string | null | undefined }) {
  return <span>{value && value.length > 0 ? value : "No definido"}</span>;
}

function processTypeBadge(value: string | null | undefined) {
  if (value === "strategic") {
    return { label: "Estratégico", tone: "info" as const };
  }

  if (value === "support") {
    return { label: "Soporte", tone: "warning" as const };
  }

  return { label: "Operativo / Clave", tone: "success" as const };
}

function splitList(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/, |\|/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="text-slate-500">No definido</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          className="rounded-md bg-[#eef4f8] px-2 py-1 text-xs font-semibold text-navy"
          key={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function TextBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-700">
        <Value value={value} />
      </p>
    </section>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  title,
  value,
}: {
  icon: React.ElementType;
  label: string;
  title: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-white px-3 py-2" title={title}>
      <Icon className="h-4 w-4 shrink-0 text-sea" />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="truncate text-sm font-bold text-navy">{value}</p>
      </div>
    </div>
  );
}

const roleHelp = {
  owner: "Rol responsable de que la etapa exista, funcione y tenga seguimiento.",
  user: "Rol que usa la salida de esta etapa o depende de ella para continuar el proceso.",
  support: "Rol que apoya, entrega informacion o participa sin ser el responsable principal.",
  backup: "Rol que puede cubrir la etapa si el rol dueño o la persona asignada no está disponible.",
};

function RoleHeading({ help, label }: { help: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={help}>
      {label}
      <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
    </span>
  );
}

function RoleBlock({
  company,
  help,
  label,
  person,
  role,
}: {
  company: string | null;
  help: string;
  label: string;
  person: string | null;
  role: string | null;
}) {
  const missingPerson = !person || person === "No definido";

  return (
    <div className="rounded-md border border-line bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
        <RoleHeading help={help} label={label} />
      </p>
      <p className="mt-2 min-h-8 text-sm font-bold leading-5 text-navy">
        <Value value={role} />
      </p>
      <p className={`mt-2 text-sm ${missingPerson ? "text-[#86510d]" : "text-slate-600"}`}>
        Persona: <Value value={person} />
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Empresa rol: <Value value={company} />
      </p>
    </div>
  );
}

function TimelineMeta({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
        <Icon className="h-4 w-4 text-sea" />
        {label}
      </div>
      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  );
}

const alertCopy: Record<string, { action: string; label: string }> = {
  critical_process_without_owner: {
    action: "Asignar una persona actual al rol dueño del proceso.",
    label: "Proceso crítico sin responsable",
  },
  critical_subprocess_without_backup: {
    action: "Asignar rol o persona de respaldo para esta etapa crítica.",
    label: "Etapa crítica sin respaldo",
  },
  person_impact: {
    action: "Revisar concentración de impacto en esta persona.",
    label: "Impacto acumulado por persona",
  },
  person_many_critical_roles: {
    action: "Distribuir roles críticos o definir reemplazos.",
    label: "Persona con muchos roles críticos",
  },
  role_impact: {
    action: "Revisar concentración de impacto en este rol.",
    label: "Impacto acumulado por rol",
  },
  role_without_person: {
    action: "Asignar una persona actual para este rol.",
    label: "Rol sin persona asignada",
  },
};

function normalizeAlertType(type: string) {
  return type.toLowerCase();
}

function getAlertCopy(type: string) {
  return (
    alertCopy[normalizeAlertType(type)] ?? {
      action: "Revisar esta señal operacional.",
      label: type.replaceAll("_", " ").toLowerCase(),
    }
  );
}

function alertMetricLabel(type: string, value: number) {
  const normalized = normalizeAlertType(type);

  if (normalized.includes("impact")) {
    return `Impacto acumulado: ${value}%`;
  }

  if (value > 0) {
    return `Conteo asociado: ${value}`;
  }

  return "Requiere revisión operacional";
}

export default async function ProcessDetailPage({ params }: { params: Params }) {
  const { processId } = await params;
  const [processResult, matrixResult, bottleneckResult] = await Promise.all([
    getProcessCatalogItem(processId),
    getProcessMatrix(processId),
    getProcessBottlenecks(processId),
  ]);

  if (!processResult.data) {
    notFound();
  }

  const process = processResult.data;
  const macroType = processTypeBadge(process.process_type);
  const rows = matrixResult.data;
  const totalImpact = rows.reduce((total, row) => total + (row.impact_percent ?? 0), 0);
  const rolesWithoutPerson = new Set(
    rows.flatMap((row) =>
      [
        [row.owner_role_name, row.owner_person_name],
        [row.user_role_name, row.user_person_name],
        [row.support_role_name, row.support_person_name],
        [row.backup_role_name, row.backup_person_name],
      ]
        .filter(([role, person]) => role && role !== "No definido" && !person)
        .map(([role]) => role as string),
    ),
  ).size;
  const criticalWithoutBackup = rows.filter(
    (row) => ["critical", "high"].includes(row.criticality) && !row.backup_person_name,
  ).length;
  const processWithoutOwner = rows.every((row) => !row.owner_person_name);
  const activeAlerts = [
    { label: "Roles sin persona", value: rolesWithoutPerson, tone: rolesWithoutPerson > 0 ? "warning" : "ok" },
    {
      label: "Etapas criticas sin respaldo",
      value: criticalWithoutBackup,
      tone: criticalWithoutBackup > 0 ? "warning" : "ok",
    },
    {
      label: "Proceso critico sin responsable",
      value: processWithoutOwner && process.criticality === "critical" ? 1 : 0,
      tone: processWithoutOwner && process.criticality === "critical" ? "warning" : "ok",
    },
  ];

  return (
    <DashboardShell
      description="Ficha estructurada del proceso modelo, construida desde Supabase."
      eyebrow="Ficha de proceso"
      title={process.process_name}
    >
      <section className="mt-5 rounded-lg border border-line bg-white p-5 shadow-[0_10px_30px_rgba(0,59,92,0.06)]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ValueBadge tone={macroType.tone}>Tipo de proceso: {macroType.label}</ValueBadge>
              <TypedBadge type="criticality" value={process.criticality} />
              <TypedBadge type="status" value={process.status} />
              <TypedBadge type="documentation" value={process.documentation_status} />
            </div>
            <h2 className="mt-3 text-2xl font-bold text-navy">{process.process_name}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-700">
              <Value value={process.definition} />
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef4f8]"
              href="/procesos"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Link>
            <Link
              className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077]"
              href={`/procesos/${process.process_id}/editar`}
            >
              <Edit3 className="h-4 w-4 text-clay" />
              Editar
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryItem
            icon={Workflow}
            label="Empresa dueña"
            title="Empresa donde ocurre el proceso y a la que pertenece el resultado."
            value={process.owner_company_name ?? process.company_name}
          />
          <SummaryItem
            icon={ShieldCheck}
            label="Operado por"
            title="Empresa que provee roles, personas o equipos para ejecutar el proceso."
            value={process.operating_company_name ?? process.company_name}
          />
          <SummaryItem
            icon={Workflow}
            label="Tipo de operación"
            title="Area principal o tipo operativo del proceso."
            value={process.area_name ?? "Sin tipo"}
          />
          <SummaryItem
            icon={CheckCircle2}
            label="Alcance"
            title="Conteos principales calculados desde las relaciones del proceso."
            value={`${rows.length} etapas · ${process.responsibility_count} roles · ${process.system_count} sistemas`}
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <TextBlock label="Objetivo" value={process.objective} />
          <TextBlock label="Resultado esperado" value={process.expected_result} />
        </div>
      </section>

      <Panel count={`${rows.length} etapas · impacto ${totalImpact}%`} title="Línea de tiempo operacional">
        <div className="mt-6">
          {rows.map((row, index) => (
            <details className="group relative grid gap-4 pb-5 pl-12 last:pb-0" key={row.subprocess_id}>
              <div className="absolute left-4 top-0 flex h-full w-px justify-center bg-line">
                {index === rows.length - 1 ? <span className="mt-8 h-full w-3 bg-white" /> : null}
              </div>
              <summary className="list-none">
                <div className="absolute left-0 top-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-sea bg-white text-sm font-bold text-sea shadow-sm">
                  {row.sort_order ?? index + 1}
                </div>

                <article className="cursor-pointer rounded-lg border border-line bg-mist p-4 transition hover:border-sea hover:bg-[#eef4f8]">
                  <div className="grid gap-3 lg:grid-cols-[1fr_360px] lg:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-navy">{row.subprocess_name}</h3>
                        <TypedBadge type="criticality" value={row.criticality} />
                      </div>
                      <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-slate-600">
                        <Value value={row.subprocess_description} />
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-md bg-white px-3 py-2">
                        <p className="text-xs text-slate-500">
                          <RoleHeading help={roleHelp.owner} label="Dueño" />
                        </p>
                        <p className="mt-1 truncate font-bold text-navy">
                          <Value value={row.owner_person_name} />
                        </p>
                      </div>
                      <div className="rounded-md bg-white px-3 py-2">
                        <p className="text-xs text-slate-500">
                          <RoleHeading help={roleHelp.backup} label="Respaldo" />
                        </p>
                        <p className="mt-1 truncate font-bold text-navy">
                          <Value value={row.backup_person_name ?? row.backup_role_name} />
                        </p>
                      </div>
                      <div className="rounded-md bg-white px-3 py-2">
                        <p className="text-xs text-slate-500">Impacto</p>
                        <p className="mt-1 font-bold text-navy">
                          {row.impact_percent === null ? "-" : `${row.impact_percent}%`}
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              </summary>

              <div className="rounded-b-lg border border-t-0 border-line bg-white p-4">
                <div className="grid gap-4 2xl:grid-cols-[1.05fr_0.95fr]">
                  <section className="rounded-lg bg-mist p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-sea" />
                      <h4 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-500">
                        Responsabilidades
                      </h4>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <RoleBlock
                        company={row.owner_role_company_name}
                        help={roleHelp.owner}
                        label="Rol dueño"
                        person={row.owner_person_name}
                        role={row.owner_role_name}
                      />
                      <RoleBlock
                        company={row.user_role_company_name}
                        help={roleHelp.user}
                        label="Rol usuario"
                        person={row.user_person_name}
                        role={row.user_role_name}
                      />
                      <RoleBlock
                        company={row.support_role_company_name}
                        help={roleHelp.support}
                        label="Rol apoyo"
                        person={row.support_person_name}
                        role={row.support_role_name}
                      />
                      <RoleBlock
                        company={row.backup_role_company_name}
                        help={roleHelp.backup}
                        label="Rol respaldo"
                        person={row.backup_person_name}
                        role={row.backup_role_name}
                      />
                    </div>
                  </section>

                  <section className="rounded-lg bg-mist p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-sea" />
                      <h4 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-500">
                        Soporte operativo
                      </h4>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TimelineMeta icon={Database} label="Sistemas" value={<ChipList items={splitList(row.systems)} />} />
                      <TimelineMeta icon={AlertTriangle} label="Riesgo" value={<ChipList items={splitList(row.risks)} />} />
                      <TimelineMeta icon={CheckCircle2} label="Control" value={<ChipList items={splitList(row.controls)} />} />
                      <TimelineMeta
                        icon={ShieldCheck}
                        label="Respaldo"
                        value={
                          <span>
                            <Value value={row.backup_role_name} />
                            {row.backup_person_name ? ` (${row.backup_person_name})` : ""}
                          </span>
                        }
                      />
                    </div>
                  </section>
                </div>
              </div>
            </details>
          ))}
        </div>
      </Panel>

      <details className="mt-5 rounded-lg border border-line bg-white shadow-[0_10px_30px_rgba(0,59,92,0.06)]">
        <summary className="cursor-pointer list-none px-5 py-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-navy">Matriz técnica</h2>
              <p className="mt-1 text-sm text-slate-600">
                Filtros, revisión de responsabilidades y descarga para Excel.
              </p>
            </div>
            <span className="text-sm font-semibold text-sea">{rows.length} filas</span>
          </div>
        </summary>
        <ProcessMatrixTools rows={rows} />
      </details>

      <details className="mt-5 rounded-lg border border-line bg-white shadow-[0_10px_30px_rgba(0,59,92,0.06)]">
        <summary className="cursor-pointer list-none px-5 py-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-navy">Alertas del proceso</h2>
              <p className="mt-1 text-sm text-slate-600">
                Señales ejecutivas calculadas desde roles, personas y respaldos.
              </p>
            </div>
            <span className="text-sm font-semibold text-sea">
              {activeAlerts.filter((alert) => alert.value > 0).length} por revisar
            </span>
          </div>
        </summary>
        <div className="border-t border-line px-5 py-5">
          <div className="grid gap-3 md:grid-cols-3">
            {activeAlerts.map((alert) => (
              <div className="rounded-lg border border-line bg-mist p-4" key={alert.label}>
                <p className="text-sm text-slate-600">{alert.label}</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-3xl font-bold text-navy">{alert.value}</p>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-bold ${
                      alert.tone === "warning"
                        ? "bg-[#ffe6ca] text-[#86510d]"
                        : "bg-[#e4f4ea] text-[#24613d]"
                    }`}
                  >
                    {alert.tone === "warning" ? "Revisar" : "OK"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {bottleneckResult.data.map((item, index) => (
              <div
                className="rounded-lg border border-line bg-white p-4"
                key={`${item.process_id}-${item.alert_type}-${item.subject_name}-${item.impact_percent}-${index}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                      {getAlertCopy(item.alert_type).label}
                    </p>
                    <p className="mt-1 font-bold text-navy">{item.subject_name}</p>
                  </div>
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-bold ${
                      item.is_gap
                        ? "bg-[#ffe6ca] text-[#86510d]"
                        : "bg-[#e4f4ea] text-[#24613d]"
                    }`}
                  >
                    {item.is_gap ? "Revisar" : "OK"}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {getAlertCopy(item.alert_type).action}
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  {alertMetricLabel(item.alert_type, item.impact_percent)}
                </p>
              </div>
            ))}
            {bottleneckResult.data.length === 0 ? (
              <p className="text-sm text-slate-600">No hay alertas calculadas para este proceso.</p>
            ) : null}
          </div>
        </div>
      </details>
    </DashboardShell>
  );
}
