import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";

import { ValueBadge } from "@/components/dashboard/badge";
import type { ProcessMasterControl, ProcessMasterDto, ProcessMasterMode, ProcessMasterRisk, ProcessMasterStage } from "./process-master-types";
import { ProcessDocumentRow, ProcessDocumentSection } from "./process-document-layout";
import { ProcessWizardShell } from "./process-wizard-shell";

import { ProcessRoleProfilesReadonly } from './process-role-profiles-table';

type ProcessMasterSheetProps = {
  actions?: React.ReactNode;
  flowEditor?: React.ReactNode;
  headerEditor?: React.ReactNode;
  mode: ProcessMasterMode;
  process: ProcessMasterDto;
  metricsEditor?: React.ReactNode;
  purposeEditor?: React.ReactNode;
  risksEditor?: React.ReactNode;
  rolesEditor?: React.ReactNode;
  stageEditor?: React.ReactNode;
  wizardInitialStep?: number;
  wizardMode?: "create" | "edit";
  wizardScrollKey?: string;
};

const processTypeLabels: Record<ProcessMasterDto["process"]["process_type"], string> = {
  operational: "Operativo / Clave",
  strategic: "Estrategico",
  support: "Soporte",
};

function text(value: string | null | undefined, fallback = "No documentado") {
  return value && value.trim().length > 0 ? value : fallback;
}

function documentaryDate(value: string | null | undefined) {
  if (!value) return "No documentada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No documentada";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Santiago",
    year: "numeric",
  }).format(date).replaceAll("/", "-");
}

function DocumentaryField({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</p><div className="mt-1 text-sm leading-5 text-slate-700">{children}</div></div>;
}


function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3 text-sm leading-6 text-slate-500">{children}</div>;
}

function StageList({ stages }: { stages: ProcessMasterStage[] }) {
  if (!stages.length) return <span className="text-slate-500">Sin actividades activas</span>;
  return <ol className="grid gap-2">{stages.map((stage, index) => <li key={stage.id ?? `${stage.name}-${index}`}><p className="font-semibold text-navy">{stage.sort_order ?? index + 1}. {stage.name}</p>{stage.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{stage.description}</p> : null}</li>)}</ol>;
}

function FlowTable({ process, stages }: { process: ProcessMasterDto["process"]; stages: ProcessMasterStage[] }) {
  return (
    <div className="divide-y divide-line">
      <ProcessDocumentRow label="PROVEEDOR / ORIGEN">{text(process.supplier_origin)}</ProcessDocumentRow>
      <ProcessDocumentRow label="ENTRADAS">{text(process.process_inputs)}</ProcessDocumentRow>
      <ProcessDocumentRow label="ACTIVIDADES CLAVE / ETAPAS"><StageList stages={stages} /></ProcessDocumentRow>
      <ProcessDocumentRow label="SALIDAS">{text(process.process_outputs)}</ProcessDocumentRow>
      <ProcessDocumentRow label="CLIENTE / DESTINO">{text(process.client_destination)}</ProcessDocumentRow>
    </div>
  );
}

function RolesTable({ process }: { process: ProcessMasterDto }) {
  return <ProcessRoleProfilesReadonly rows={process.roleProfiles} />;
}

function MetricsTable({ process }: { process: ProcessMasterDto }) {
  const rows = process.metrics.length ? process.metrics : process.process.basic_kpi ? [{ id: "legacy-kpi", name: process.process.basic_kpi, formula: null, target: null, frequency: null, owner_role_id: null, owner_role_name: null, owner_person_name: null, responsible_roles: [], sort_order: 1 }] : [];
  if (!rows.length) return <EmptyState>Sin indicadores documentados para este proceso.</EmptyState>;
  return <div className="overflow-hidden rounded-lg border border-line"><div className="hidden grid-cols-5 gap-3 border-b border-line bg-[#f8fafb] px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>Indicador</span><span>Formula / criterio</span><span>Meta</span><span>Frecuencia</span><span>Responsable</span></div>{rows.map((row) => <div className="grid gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0 lg:grid-cols-5" key={row.id}><p className="font-bold text-navy">{row.name}</p><p>{text(row.formula)}</p><p>{text(row.target)}</p><p>{text(row.frequency)}</p><p>{text(row.responsible_roles.map((role) => role.role_name).join(" \u00b7 "))}</p></div>)}</div>;
}

function RisksTable({ process }: { process: ProcessMasterDto }) {
  const rows = process.risks.reduce<Array<{ risk: ProcessMasterRisk; control: ProcessMasterControl | null }>>((items, risk) => {
    if (risk.controls.length === 0) items.push({ risk, control: null });
    else items.push(...risk.controls.map((control) => ({ risk, control })));
    return items;
  }, []);
  if (!rows.length) return <EmptyState>Sin riesgos, controles u oportunidades documentados.</EmptyState>;
  return <div className="overflow-hidden rounded-lg border border-line"><div className="hidden grid-cols-4 gap-3 border-b border-line bg-[#f8fafb] px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>Riesgo / oportunidad</span><span>Control</span><span>Evidencia</span><span>Responsable</span></div>{rows.map(({ risk, control }, index) => <div className="grid gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0 lg:grid-cols-4" key={`${risk.id}-${control?.id ?? index}`}><div><ValueBadge tone={risk.risk_type === "opportunity" ? "success" : "warning"}>{risk.risk_type === "opportunity" ? "Oportunidad" : "Riesgo"}</ValueBadge><p className="mt-2 font-bold text-navy">{risk.name}</p></div><p>{text(control?.name)}</p><p>{text(control?.evidence)}</p><p>{text(control?.responsible_roles.map((role) => role.role_name).join(" \u00b7 "))}</p></div>)}</div>;
}

export function ProcessMasterSheet({ actions, flowEditor, headerEditor, metricsEditor, mode, process, purposeEditor, risksEditor, rolesEditor, stageEditor, wizardInitialStep = 1, wizardMode = "edit", wizardScrollKey }: ProcessMasterSheetProps) {
  if (mode === "create") {
    return <div className="mt-5 grid gap-6">{actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}{headerEditor}</div>;
  }
  if (mode === "readonly") {
    const readonlyStages = process.stages.filter((stage) => stage.status === "active");
    const statusLabel = process.process.status === "active"
      ? "Vigente"
      : process.process.status === "archived"
        ? "Archivado"
        : "Borrador";
    const statusTone: "success" | "warning" | "neutral" = process.process.status === "active"
      ? "success"
      : process.process.status === "archived"
        ? "warning"
        : "neutral";
    return (
      <div className="mt-5 grid gap-6">
        <section className="rounded-lg border border-[#dbe4eb] border-t-2 border-t-clay bg-white px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="min-w-0 text-2xl font-bold leading-tight text-navy sm:text-[28px]">
                  {process.process.name}
                </h2>
                <ValueBadge tone={statusTone}>{statusLabel}</ValueBadge>
              </div>
              <p className="mt-1.5 text-sm text-slate-600">
                {processTypeLabels[process.process.process_type]}
                <span className="px-1.5" aria-hidden="true">&middot;</span>
                {text(process.process.company_name, "Sin empresa")}
              </p>
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{actions}</div> : null}
          </div>

          <div className="mt-4 grid gap-x-6 gap-y-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.5fr)_minmax(140px,0.8fr)_minmax(160px,0.9fr)]">
            <DocumentaryField label="Dueno del proceso">
              <p className="font-semibold text-navy">{text(process.responsibility.owner_role_name, "Sin rol dueno")}</p>
              <p className="mt-0.5 text-xs text-slate-500">{text(process.responsibility.owner_person_name, "Sin persona asignada")}</p>
            </DocumentaryField>
            <DocumentaryField label="Codigo">
              <p className="font-semibold text-navy">{text(process.process.processCode, "Sin codigo")}</p>
            </DocumentaryField>
            <DocumentaryField label="Ultima edicion">
              <p className="font-semibold text-navy">{documentaryDate(process.process.masterUpdatedAt ?? process.process.createdAt)}</p>
            </DocumentaryField>
          </div>
        </section>
        <ProcessDocumentSection title={"1. PROP\u00d3SITO Y ALCANCE"}><div className="divide-y divide-line"><ProcessDocumentRow label={"PROP\u00d3SITO"}>{text(process.process.objective)}</ProcessDocumentRow><ProcessDocumentRow label="Inicio">{text(process.process.processStart)}</ProcessDocumentRow><ProcessDocumentRow label="Fin">{text(process.process.processEnd)}</ProcessDocumentRow><ProcessDocumentRow label="Alcance">{text(process.process.scope)}</ProcessDocumentRow></div></ProcessDocumentSection>
        <ProcessDocumentSection title={"2. ENTRADAS, ACTIVIDADES Y SALIDAS"}><FlowTable process={process.process} stages={readonlyStages} /></ProcessDocumentSection>
        <ProcessDocumentSection title={"3. ROLES, RESPONSABILIDADES Y AUTORIDAD"}><RolesTable process={process} /></ProcessDocumentSection>
        <ProcessDocumentSection title={"4. INDICADORES Y OBJETIVOS"}><MetricsTable process={process} /></ProcessDocumentSection>
        <ProcessDocumentSection title={"5. RIESGOS, CONTROLES Y OPORTUNIDADES"}><RisksTable process={process} /></ProcessDocumentSection>
      </div>
    );
  }

  const stages = process.stages.filter((stage) => stage.status === "active");
  const wizardSteps = [
    {
      id: "header",
      label: "Cabecera",
      content: (
        <section className="overflow-hidden rounded-lg border border-[#dbe4eb] bg-white">
          <div className="flex flex-col gap-2 px-5 pb-3 pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-sea">Ficha de proceso</p>
              <h2 className="mt-1 text-lg font-bold text-navy">Cabecera documental</h2>
            </div>
            {actions ? <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div> : null}
          </div>
          <div className="px-5 pb-5">{headerEditor}</div>
        </section>
      ),
    },
    {
      id: "purpose",
      label: "Prop\u00f3sito y alcance",
      content: <ProcessDocumentSection title={"1. PROP\u00d3SITO Y ALCANCE"}>{purposeEditor ?? <div className="divide-y divide-line"><ProcessDocumentRow label={"PROP\u00d3SITO"}>{text(process.process.objective)}</ProcessDocumentRow><ProcessDocumentRow label="Inicio">{text(process.process.processStart)}</ProcessDocumentRow><ProcessDocumentRow label="Fin">{text(process.process.processEnd)}</ProcessDocumentRow><ProcessDocumentRow label="Alcance">{text(process.process.scope)}</ProcessDocumentRow></div>}</ProcessDocumentSection>,
    },
    {
      id: "flow",
      label: "Entradas y salidas",
      content: <ProcessDocumentSection title={"2. ENTRADAS, ACTIVIDADES Y SALIDAS"}>{flowEditor ? <div className="flex flex-col">{flowEditor}<ProcessDocumentRow className="order-3" label="ACTIVIDADES CLAVE / ETAPAS">{stageEditor}</ProcessDocumentRow></div> : <FlowTable process={process.process} stages={stages} />}</ProcessDocumentSection>,
    },
    {
      id: "roles",
      label: "Roles y responsabilidades",
      content: <ProcessDocumentSection title={"3. ROLES, RESPONSABILIDADES Y AUTORIDAD"}>{rolesEditor ?? <RolesTable process={process} />}</ProcessDocumentSection>,
    },
    {
      id: "metrics",
      label: "Indicadores y objetivos",
      content: <ProcessDocumentSection title={"4. INDICADORES Y OBJETIVOS"}>{metricsEditor ?? <MetricsTable process={process} />}</ProcessDocumentSection>,
    },
    {
      id: "risks",
      label: "Riesgos y controles",
      content: <ProcessDocumentSection title={"5. RIESGOS, CONTROLES Y OPORTUNIDADES"}>{risksEditor ?? <RisksTable process={process} />}</ProcessDocumentSection>,
    },
  ];

  return (
    <ProcessWizardShell
      initialStep={wizardInitialStep}
      mode={wizardMode}
      restoreScrollKey={wizardScrollKey}
      steps={wizardSteps}
    />
  );
}

export function ProcessMasterReadonlyActions({ processId }: { processId: string }) {
  return <><Link className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef4f8]" href="/estructura#procesos"><ArrowLeft className="h-4 w-4" />Volver a procesos</Link><Link className="inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077]" href={`/procesos/${processId}/editar`}><Pencil className="h-4 w-4 text-clay" />Editar proceso</Link></>;
}
