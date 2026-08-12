import Link from "next/link";
import { ArrowLeft, FileText, Gauge, Pencil, ShieldCheck, Target, UsersRound, Workflow } from "lucide-react";

import { TypedBadge, ValueBadge } from "@/components/dashboard/badge";
import type { ProcessMasterDto, ProcessMasterMode, ProcessMasterStage } from "./process-master-types";
import type { ProcessActivationCompleteness, ProcessActivationValidation } from "./process-master-validation";

type ProcessMasterSheetProps = {
  actions?: React.ReactNode;
  activationPanel?: React.ReactNode;
  basicsEditor?: React.ReactNode;
  completeness?: ProcessActivationCompleteness;
  mode: ProcessMasterMode;
  process: ProcessMasterDto;
  stageEditor?: React.ReactNode;
  validation?: ProcessActivationValidation;
};

const processTypeLabels: Record<ProcessMasterDto["process"]["process_type"], string> = {
  operational: "Operativo / Clave",
  strategic: "Estrategico",
  support: "Soporte",
};

function text(value: string | null | undefined, fallback = "No documentado") {
  return value && value.trim().length > 0 ? value : fallback;
}

function splitList(value: string | null | undefined) {
  return value ? value.split(/, |\|/).map((item) => item.trim()).filter(Boolean) : [];
}

function Card({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className="mt-2 text-sm leading-7 text-slate-700">{children}</div>
    </div>
  );
}

function Section({ children, description, icon: Icon, title }: { children: React.ReactNode; description: string; icon: React.ElementType; title: string }) {
  return (
    <section className="rounded-xl border border-line bg-white shadow-[0_10px_30px_rgba(0,59,92,0.05)]">
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef7fb] text-sea">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-navy">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function CompactMetadataLine() {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-line bg-[#fbfdfe] px-4 py-3 text-sm text-slate-600">
      <span className="font-semibold text-navy">Codigo:</span> No documentado
      <span className="mx-2 text-slate-300">|</span>
      <span className="font-semibold text-navy">Version:</span> No documentada
      <span className="mx-2 text-slate-300">|</span>
      <span className="font-semibold text-navy">Vigencia:</span> No documentada
    </div>
  );
}

function FutureSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-[#fbfdfe] px-4 py-3 text-sm leading-6 text-slate-600">
      {children}
    </div>
  );
}

function CompletenessStrip({
  completeness,
  processStatus,
  validation,
}: {
  completeness?: ProcessActivationCompleteness;
  processStatus: ProcessMasterDto["process"]["status"];
  validation?: ProcessActivationValidation;
}) {
  if (!completeness || !validation) return null;

  const title = processStatus === "active"
    ? `Activo - Ficha documental ${completeness.completionPercent}% completa`
    : validation.isValid
      ? "Listo para activar"
      : `Borrador - ${completeness.completionPercent}% completo`;

  return (
    <details className="rounded-xl border border-[#d6e1ea] bg-white px-5 py-4 shadow-[0_10px_30px_rgba(0,59,92,0.05)]">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold text-navy">{title}</p>
            <p className="mt-1 text-sm text-slate-600">
              {completeness.blockingCount} requisitos pendientes - {completeness.warningCount} advertencias
            </p>
          </div>
          <span className="text-sm font-semibold text-sea">Ver detalles</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8eef4]" aria-hidden="true">
          <div className="h-full rounded-full bg-navy" style={{ width: `${completeness.completionPercent}%` }} />
        </div>
      </summary>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card label="Requisitos bloqueantes">
          {validation.missingFields.length ? validation.missingFields.map((field) => <p key={field.key}>- {field.label}</p>) : "Sin faltantes bloqueantes."}
        </Card>
        <Card label="Advertencias">
          {validation.warnings.length ? validation.warnings.map((warning) => <p key={warning.key}>- {warning.label}</p>) : "Sin advertencias."}
        </Card>
      </div>
    </details>
  );
}

function StageActivities({ stages }: { stages: ProcessMasterStage[] }) {
  if (stages.length === 0) return <p className="text-sm text-slate-600">Sin actividades o etapas activas documentadas.</p>;

  return (
    <div className="grid gap-3">
      {stages.map((stage, index) => (
        <article className="rounded-lg border border-line bg-[#fbfdfe] p-4" key={stage.id ?? `${stage.name}-${index}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-bold text-navy">{stage.sort_order ?? index + 1}. {stage.name}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{text(stage.description)}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <TypedBadge type="criticality" value={stage.criticality} />
              <ValueBadge tone="neutral">Impacto {stage.impact_percent === null ? "-" : `${stage.impact_percent}%`}</ValueBadge>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function roleRows(stages: ProcessMasterStage[]) {
  return stages.flatMap((stage) => [
    { key: `${stage.id}-owner`, participation: "Dueno", person: stage.owner_person_name, role: stage.owner_role_name, stage: stage.name },
    { key: `${stage.id}-user`, participation: "Usuario", person: stage.user_person_name, role: stage.user_role_name, stage: stage.name },
    ...(stage.support_role_names ?? []).map((role, index) => ({ key: `${stage.id}-support-${index}`, participation: "Apoyo", person: stage.support_person_names?.[index] ?? null, role, stage: stage.name })),
    { key: `${stage.id}-backup`, participation: "Respaldo", person: stage.backup_person_name, role: stage.backup_role_name, stage: stage.name },
  ]).filter((row) => row.role && row.role !== "No definido");
}

function RolesTable({ stages }: { stages: ProcessMasterStage[] }) {
  const rows = roleRows(stages);

  if (rows.length === 0) return <p className="text-sm text-slate-600">Sin roles documentados en las etapas activas.</p>;

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="hidden grid-cols-[1fr_1fr_120px_1fr] gap-3 border-b border-line bg-[#f8fafb] px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500 lg:grid">
        <span>Rol</span><span>Persona actual</span><span>Participacion</span><span>Etapa</span>
      </div>
      {rows.map((row) => (
        <div className="grid gap-2 border-b border-line px-4 py-3 text-sm last:border-b-0 lg:grid-cols-[1fr_1fr_120px_1fr] lg:items-center" key={row.key}>
          <p className="font-bold text-navy">{row.role}</p>
          <p className={row.person ? "text-slate-700" : "text-[#86510d]"}>{row.person ?? "Sin persona asignada"}</p>
          <ValueBadge tone={row.participation === "Dueno" ? "info" : "neutral"}>{row.participation}</ValueBadge>
          <p className="text-slate-600">{row.stage}</p>
        </div>
      ))}
    </div>
  );
}

function RiskControls({ stages }: { stages: ProcessMasterStage[] }) {
  const rows = stages.flatMap((stage) => {
    const risks = splitList(stage.risks);
    const controls = splitList(stage.controls);
    return risks.length || controls.length ? [{ controls, risks, stage: stage.name }] : [];
  });

  if (rows.length === 0) return <p className="text-sm text-slate-600">Sin riesgos o controles documentados.</p>;

  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <div className="rounded-lg border border-line bg-[#fbfdfe] p-4" key={row.stage}>
          <p className="font-bold text-navy">{row.stage}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Card label="Riesgo / oportunidad">{row.risks.length ? row.risks.join(", ") : "No documentado"}</Card>
            <Card label="Control">{row.controls.length ? row.controls.join(", ") : "No documentado"}</Card>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProcessMasterSheet({ actions, activationPanel, basicsEditor, completeness, mode, process, stageEditor, validation }: ProcessMasterSheetProps) {
  const stages = process.stages.filter((stage) => stage.status === "active");
  const ownerRole = process.responsibility.owner_role_name;
  const ownerPerson = process.responsibility.owner_person_name;
  const modeLabel = mode === "create" ? "Ficha de proceso" : mode === "edit" ? "Editor maestro" : "Ficha maestra";

  return (
    <div className="mt-5 grid gap-5">
      <section className="rounded-xl border border-line bg-white p-5 shadow-[0_10px_30px_rgba(0,59,92,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sea">{modeLabel}</p>
            <h1 className="mt-2 text-2xl font-bold text-navy">{process.process.name}</h1>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-700">{text(process.process.description)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ValueBadge tone="info">{processTypeLabels[process.process.process_type]}</ValueBadge>
              <TypedBadge type="criticality" value={process.process.criticality} />
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-[#fbfdfe] px-3 py-1 text-xs font-bold text-slate-600">
                Estado operativo <TypedBadge type="status" value={process.process.status} />
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-[#fbfdfe] px-3 py-1 text-xs font-bold text-slate-600">
                Estado documental <TypedBadge type="documentation" value={process.process.documentation_status} />
              </span>
            </div>
          </div>
          {actions ? <div className="flex flex-wrap gap-2 xl:justify-end">{actions}</div> : null}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card label="Dueno del proceso">
            <p className="font-bold text-navy">{mode === "create" ? "Se define mediante las etapas" : text(ownerRole)}</p>
          </Card>
          <Card label="Persona actual">
            <p className={ownerPerson ? "font-bold text-navy" : "font-bold text-[#86510d]"}>
              {mode === "create" ? "Deriva del rol oficial" : ownerPerson ?? "Sin persona asignada"}
            </p>
          </Card>
          <Card label="Empresa"><p className="font-bold text-navy">{text(process.process.company_name)}</p></Card>
          <Card label="Area"><p className="font-bold text-navy">{text(process.process.area_name, "Sin area")}</p></Card>
        </div>
        <CompactMetadataLine />
      </section>

      <CompletenessStrip completeness={completeness} processStatus={process.process.status} validation={validation} />
      {activationPanel}
      {mode === "create" && basicsEditor ? basicsEditor : null}

      <Section description="Datos documentales actuales. Inicio, fin y alcance quedan como brecha hasta tener campos especificos." icon={Target} title="1. Proposito y alcance">
        {mode === "create" ? (
          <FutureSection>El borrador inicial registra proposito y documentacion base. Inicio, fin y alcance requieren campos reales futuros.</FutureSection>
        ) : mode === "edit" && basicsEditor ? basicsEditor : (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card label="Proposito">{text(process.process.objective)}</Card>
            <Card label="Descripcion">{text(process.process.description)}</Card>
            <Card label="Resultado esperado">{text(process.process.expected_result)}</Card>
          </div>
        )}
      </Section>

      <Section description="Las actividades clave se derivan automaticamente de etapas/subprocesos activos ordenados por sort_order." icon={Workflow} title="2. Entradas, actividades y salidas">
        {mode === "create" ? (
          <FutureSection>Las etapas, roles, sistemas, riesgos y controles quedan disponibles despues de guardar el borrador.</FutureSection>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card label="Entradas y proveedores">{text(process.process.inputs_providers)}</Card>
              <Card label="Salidas y clientes">{text(process.process.outputs_clients)}</Card>
            </div>
            <div className="mt-4">{mode === "edit" && stageEditor ? stageEditor : <StageActivities stages={stages} />}</div>
          </>
        )}
      </Section>

      <Section description="La persona actual se deriva del rol oficial; no se edita manualmente en la ficha." icon={UsersRound} title="3. Roles, responsabilidades y autoridad">
        {mode === "create" ? <FutureSection>Los roles se asocian en las etapas despues de guardar el borrador.</FutureSection> : <RolesTable stages={stages} />}
      </Section>
      <Section description="Hoy se utiliza el KPI basico existente. Formula, meta, frecuencia y responsable quedan como brecha de modelo." icon={Gauge} title="4. Indicadores y objetivos">
        {mode === "create" ? <FutureSection>El KPI basico puede guardarse en el borrador inicial; metricas avanzadas requieren schema futuro.</FutureSection> : <Card label="Indicador / KPI basico">{text(process.process.basic_kpi)}</Card>}
      </Section>
      <Section description="Se muestran riesgos y controles reales asociados a etapas cuando existen." icon={ShieldCheck} title="5. Riesgos, controles y oportunidades">
        {mode === "create" ? <FutureSection>Riesgos y controles se documentan por etapa despues de crear el proceso.</FutureSection> : <RiskControls stages={stages} />}
      </Section>
      <Section description="Seccion preparada para un modelo futuro de documentos, registros y evidencias." icon={FileText} title="6. Documentos y registros asociados"><p className="text-sm text-slate-600">Sin documentos o registros asociados.</p></Section>
      <Section description="No existen campos PDCA todavia; se deja documentada la brecha sin inventar contenido." icon={Workflow} title="7. Ciclo de mejora"><p className="text-sm text-slate-600">Sin ciclo Plan / Do / Check / Act documentado.</p></Section>
    </div>
  );
}

export function ProcessMasterReadonlyActions({ processId }: { processId: string }) {
  return (
    <>
      <Link className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef4f8]" href="/procesos"><ArrowLeft className="h-4 w-4" />Volver a procesos</Link>
      <Link className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077]" href={`/procesos/${processId}/editar`}><Pencil className="h-4 w-4 text-clay" />Editar proceso</Link>
    </>
  );
}
