import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { DashboardShell } from "@/components/dashboard/shell";
import { activateProcess, saveProcessBasicsInline, saveProcessMetrics, saveProcessRisksAndControls, saveProcessRoleProfiles } from "@/app/admin/actions";
import { getEditableProcessCatalogItem, getProcessMatrix, getRoleDictionary } from "@/lib/dashboard/data";
import { mapProcessMasterDto } from "@/app/procesos/process-master/process-master-mapper";
import { createProcessActivationSnapshot } from "@/app/procesos/process-master/process-master-validation";
import { ProcessMasterSheet } from "@/app/procesos/process-master/process-master-sheet";
import { ProcessDocumentRow } from "@/app/procesos/process-master/process-document-layout";
import { ProcessSectionForm } from "@/app/procesos/process-master/process-section-form";
import { ProcessMasterSaveCoordinator } from "@/app/procesos/process-master/process-master-save-coordinator";
import { ArchiveProcessPanel } from "./archive-process-panel";
import { ProcessActivationPanel } from "./process-activation-panel";
import { StageEditor } from "./stage-editor";

import { ProcessMetricsEditor } from '@/app/procesos/process-master/process-metrics-editor';
import { ProcessRisksControlsEditor } from '@/app/procesos/process-master/process-risks-controls-editor';
import { ProcessRoleProfilesEditor } from '@/app/procesos/process-master/process-role-profiles-editor';
import { getProcessMetricsForMaster, getProcessRisksForMaster } from '@/lib/procesos/process-master-relations';
import { getProcessRoleProfilesForMaster } from '@/lib/procesos/process-role-profiles';
import { getActiveProcessOperationTypeOptions } from "@/lib/procesos/process-company-options";

type Params = Promise<{ processId: string }>;
type SearchParams = Promise<{ addRole?: string; addStage?: string; error?: string; ok?: string; step?: string; wizard?: string }>;

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function StatePill({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-slate-500">{label}</p>
      <p className="mt-1.5 text-sm font-bold text-navy">{value}</p>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

const processTypeOptions = [
  { label: "Estrategico", value: "strategic" },
  { label: "Operativo / Clave", value: "operational" },
  { label: "Soporte", value: "support" },
];

const statusLabels: Record<string, string> = {
  active: "Activo",
  archived: "Archivado",
  inactive: "Borrador",
};

const documentationLabels: Record<string, string> = {
  documented: "Documentado",
  draft: "Borrador",
  needs_update: "Requiere actualizacion",
  not_started: "No iniciado",
};

function documentaryDate(value: string | null) {
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
export default async function EditProcessPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { processId } = await params;
  const messages = await searchParams;
  const wizardMode = messages.wizard === "create" ? "create" : "edit";
  const requestedStep = messages.addStage === "1" ? 3 : messages.addRole === "1" ? 4 : Number(messages.step ?? 1);
  const wizardInitialStep = Number.isFinite(requestedStep) ? Math.min(Math.max(Math.trunc(requestedStep), 1), 6) : 1;
  const [processResult, matrixResult, operationTypeResult, roleDictionaryResult] = await Promise.all([
    getEditableProcessCatalogItem(processId),
    getProcessMatrix(processId),
    getActiveProcessOperationTypeOptions(),
    getRoleDictionary(),
  ]);
  if (!processResult.data || processResult.data.status === "archived") {
    notFound();
  }

  const process = processResult.data;
  const rows = matrixResult.data;
  const [roleProfilesResult, metricsResult, risksResult] = await Promise.all([
    getProcessRoleProfilesForMaster({ processId: process.process_id }),
    getProcessMetricsForMaster(process.process_id),
    getProcessRisksForMaster(process.process_id),
  ]);
  const masterProcess = mapProcessMasterDto({
    process,
    stages: rows.map((row) => ({ ...row, subprocess_status: "active" })),
  });
  masterProcess.roleProfiles = roleProfilesResult.data;
  masterProcess.metrics = metricsResult.data;
  masterProcess.risks = risksResult.data;
  const nextSortOrder = rows.reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), 0) + 1;

  const operationTypes = operationTypeResult.data.filter((operationType) => operationType.companyId === process.company_id);
  const currentOperationTypeIsInactive = Boolean(
    process.area_id && !operationTypes.some((operationType) => operationType.id === process.area_id),
  );
  const officialRoles = roleDictionaryResult.data.filter(
    (role) => role.role_status === "active" && role.company_id === process.company_id,
  );
  const lastEditedAt = process.master_updated_at ?? process.created_at;
  const headerEditor = (
    <ProcessSectionForm action={saveProcessBasicsInline} className="grid gap-3" readinessFields={{ area_id: "areaId", name: "name", process_type: "processType" }} sectionId="header" sectionLabel="Cabecera">
      <input name="process_id" type="hidden" value={process.process_id} />
      <div className="rounded-lg bg-[#f8fafc] p-4 sm:p-5">
        <div className="flex flex-col gap-3 border-b border-[#dbe4eb] pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <Field label="Proceso"><input className={`${inputClass} text-base font-bold text-navy`} name="name" required defaultValue={process.process_name} /></Field>
          </div>
          <span className="inline-flex w-fit shrink-0 rounded-full border border-[#cbd8e3] bg-white px-2.5 py-1 text-xs font-bold text-slate-600">{process.status === "active" ? "Vigente" : "Borrador"}</span>
        </div>
        <div className="flex flex-wrap gap-x-2 gap-y-1 border-b border-[#dbe4eb] py-3 text-xs font-medium text-slate-500">
          <span>{process.process_code ?? "Sin codigo"}</span><span aria-hidden="true">&middot;</span>
          <span>{process.version ?? "Sin publicar"}</span><span aria-hidden="true">&middot;</span>
          <span>Editado {documentaryDate(lastEditedAt)}</span>
        </div>
        <div className="grid gap-x-5 gap-y-4 pt-4 sm:grid-cols-2">
          <div className="min-w-0"><StatePill label="Empresa" value={process.company_name ?? "Sin empresa"} /></div>
          <Field label="Tipo de proceso"><select className={inputClass} name="process_type" defaultValue={process.process_type}>{processTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
          <div className="min-w-0">
            <Field label="Dueno del proceso">
              <select className={inputClass} name="owner_role_id" defaultValue={process.owner_role_id ?? ""}>
                <option value="">Sin rol dueno</option>
                {officialRoles.map((role) => <option key={role.role_id} value={role.role_id}>{role.role_name}</option>)}
              </select>
            </Field>
            {process.owner_person_name ? <p className="mt-1 text-xs text-slate-500">Persona actual: {process.owner_person_name}</p> : null}
          </div>
          <Field label="Tipo de operación">
            <select className={inputClass} name="area_id" defaultValue={process.area_id ?? ""}>
              <option value="">Sin tipo de operación</option>
              {currentOperationTypeIsInactive ? (
                <option disabled value={process.area_id ?? ""}>{process.area_name ?? "Tipo de operación histórico"} (inactivo)</option>
              ) : null}
              {operationTypes.map((operationType) => <option key={operationType.id} value={operationType.id}>{operationType.name}</option>)}
            </select>
            {operationTypeResult.error ? <p className="mt-1 text-xs text-[#86510d]">No se pudieron cargar los tipos de operación.</p> : null}
          </Field>
        </div>
      </div>
    </ProcessSectionForm>
  );
  const purposeEditor = (
    <ProcessSectionForm action={saveProcessBasicsInline} readinessFields={{ purpose: "objective" }} sectionId="purpose" sectionLabel={"Prop\u00f3sito y alcance"}>
      <input name="process_id" type="hidden" value={process.process_id} />
      <div className="divide-y divide-line">
        <ProcessDocumentRow label={"PROP\u00d3SITO"}><textarea aria-label="Propósito" className={`${inputClass} min-h-24`} name="purpose" defaultValue={process.objective ?? ""} /></ProcessDocumentRow>
        <ProcessDocumentRow label="Inicio"><textarea aria-label="Inicio" className={`${inputClass} min-h-20`} name="process_start" defaultValue={process.process_start ?? ""} /></ProcessDocumentRow>
        <ProcessDocumentRow label="Fin"><textarea aria-label="Fin" className={`${inputClass} min-h-20`} name="process_end" defaultValue={process.process_end ?? ""} /></ProcessDocumentRow>
        <ProcessDocumentRow label="Alcance"><textarea aria-label="Alcance" className={`${inputClass} min-h-20`} name="scope" defaultValue={process.scope ?? ""} /></ProcessDocumentRow>
      </div>
    </ProcessSectionForm>
  );

  const flowEditor = (
    <ProcessSectionForm action={saveProcessBasicsInline} className="contents" readinessFields={{ client_destination: "clientDestination", process_inputs: "processInputs", process_outputs: "processOutputs", supplier_origin: "supplierOrigin" }} sectionId="flow" sectionLabel="Entradas y salidas">
      <input name="process_id" type="hidden" value={process.process_id} />
      <ProcessDocumentRow className="order-1" label="PROVEEDOR / ORIGEN"><textarea aria-label="Proveedor / Origen" className={`${inputClass} min-h-24`} name="supplier_origin" defaultValue={process.supplier_origin ?? ""} /></ProcessDocumentRow>
      <ProcessDocumentRow className="order-2" label="ENTRADAS"><textarea aria-label="Entradas" className={`${inputClass} min-h-24`} name="process_inputs" defaultValue={process.process_inputs ?? ""} /></ProcessDocumentRow>
      <ProcessDocumentRow className="order-4" label="SALIDAS"><textarea aria-label="Salidas" className={`${inputClass} min-h-24`} name="process_outputs" defaultValue={process.process_outputs ?? ""} /></ProcessDocumentRow>
      <ProcessDocumentRow className="order-5" label="CLIENTE / DESTINO"><textarea aria-label="Cliente / Destino" className={`${inputClass} min-h-24`} name="client_destination" defaultValue={process.client_destination ?? ""} /></ProcessDocumentRow>
    </ProcessSectionForm>
  );

  return (
    <DashboardShell
      background="white"
      description="Actualiza la ficha documental y sus actividades clave."
      eyebrow="Editar proceso"
      title="Editar ficha de proceso"
    >
      <div className="mt-5 flex flex-wrap gap-2">
        {process.status === "active" ? (
          <Link className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef4f8]" href={`/procesos/${process.process_id}`}>
            <ArrowLeft className="h-4 w-4" />
            Ver ficha
          </Link>
        ) : null}
        <Link className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef4f8]" href="/estructura#procesos">
          <FileText className="h-4 w-4" />
          Procesos
        </Link>
      </div>

      {messages.ok ? <div className="mt-5 rounded-lg border border-[#c8e6d0] bg-[#e4f4ea] p-4 text-sm font-semibold text-[#24613d]">{messages.ok}</div> : null}
      {messages.error ? <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm font-semibold text-[#86510d]">{messages.error}</div> : null}

      <ProcessMasterSaveCoordinator canOfferActivation={process.status === "inactive"} initialActivationSnapshot={createProcessActivationSnapshot(masterProcess)}>
        {process.status === "inactive" ? (
          <ProcessActivationPanel
            action={activateProcess}
            processId={process.process_id}
            processName={process.process_name}
          />
        ) : null}
        <ProcessMasterSheet
          headerEditor={headerEditor}
          metricsEditor={
            <ProcessMetricsEditor
              action={saveProcessMetrics}
              processId={process.process_id}
              roleOptions={officialRoles.map((role) => ({ id: role.role_id, name: role.role_name }))}
              rows={masterProcess.metrics}
            />
          }
          purposeEditor={purposeEditor}
          risksEditor={
            <ProcessRisksControlsEditor
              action={saveProcessRisksAndControls}
              processId={process.process_id}
              roleOptions={officialRoles.map((role) => ({ id: role.role_id, name: role.role_name }))}
              rows={masterProcess.risks}
            />
          }
          rolesEditor={
            <ProcessRoleProfilesEditor
              action={saveProcessRoleProfiles}
              initiallyAddRow={messages.addRole === "1"}
              processId={process.process_id}
              roleOptions={officialRoles.map((role) => ({ id: role.role_id, name: role.role_name }))}
              rows={masterProcess.roleProfiles}
            />
          }
          flowEditor={flowEditor}
          mode="edit"
          process={masterProcess}
          wizardInitialStep={wizardInitialStep}
          wizardMode={wizardMode}
          wizardScrollKey={wizardMode === "create" ? `process-wizard-scroll:${process.process_id}` : undefined}
          stageEditor={
            <StageEditor
              initiallyOpen={messages.addStage === "1"}
              initialRows={rows}
              nextSortOrder={nextSortOrder}
              processId={process.process_id}
            />
          }
        />
      </ProcessMasterSaveCoordinator>
      <ArchiveProcessPanel
        canArchive={process.status === "active"}
        processId={process.process_id}
        processName={process.process_name}
      />
    </DashboardShell>
  );
}
