"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { autoCreateProcessDraft, type ExistingProcessConflict } from "@/app/admin/actions";
import { ProcessDocumentRow, ProcessDocumentSection } from "@/app/procesos/process-master/process-document-layout";
import { ProcessWizardShell, type ProcessWizardStep } from "@/app/procesos/process-master/process-wizard-shell";

export type DraftCompanyOption = {
  id: string;
  name: string;
};

export type DraftOperationTypeOption = {
  companyId: string;
  id: string;
  name: string;
};

export type DraftRoleOption = {
  companyId: string | null;
  id: string;
  name: string;
};

const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

const processTypeOptions = [
  { label: "Estrategico", value: "strategic" },
  { label: "Operativo / Clave", value: "operational" },
  { label: "Soporte", value: "support" },
];

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function CreateProcessDraftForm({
  companies,
  operationTypes,
  optionsError,
  roles,
}: {
  companies: DraftCompanyOption[];
  operationTypes: DraftOperationTypeOption[];
  optionsError?: string | null;
  roles: DraftRoleOption[];
}) {
  const defaultCompanyId =
    companies.find((company) => company.name.trim().toLocaleLowerCase("es") === "mcparking")?.id ?? "";
  const [selectedCompanyId, setSelectedCompanyId] = useState(defaultCompanyId);
  const [selectedOperationTypeId, setSelectedOperationTypeId] = useState("");
  const [selectedOwnerRoleId, setSelectedOwnerRoleId] = useState("");
  const [autoSaveMessage, setAutoSaveMessage] = useState<string | null>(null);
  const [existingProcess, setExistingProcess] = useState<ExistingProcessConflict | null>(null);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const autoSaveInFlightRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const visibleOperationTypes = useMemo(
    () => operationTypes.filter((operationType) => operationType.companyId === selectedCompanyId),
    [operationTypes, selectedCompanyId],
  );
  const visibleRoles = useMemo(
    () => roles.filter((role) => role.companyId === selectedCompanyId),
    [roles, selectedCompanyId],
  );

  async function prepareDraftForWizard({ currentStep, nextStep }: { currentStep: number; nextStep: number }) {
    if (currentStep !== 1 || nextStep !== 2) return true;
    if (!formRef.current || isCreatingDraft || autoSaveInFlightRef.current) return false;

    const formData = new FormData(formRef.current);
    const hasName = String(formData.get("name") ?? "").trim().length > 0;
    const hasCompany = String(formData.get("company_id") ?? "").trim().length > 0;
    const hasProcessType = String(formData.get("process_type") ?? "").trim().length > 0;

    if (!hasName || !hasCompany || !hasProcessType) {
      setAutoSaveMessage("Completa Proceso, Empresa y Tipo para continuar.");
      return false;
    }

    autoSaveInFlightRef.current = true;
    setIsCreatingDraft(true);
    setAutoSaveMessage("Guardando borrador...");
    try {
      const result = await autoCreateProcessDraft(formData, "wizard_next");
      if (result?.existingProcess) {
        autoSaveInFlightRef.current = false;
        setIsCreatingDraft(false);
        setAutoSaveMessage(null);
        setExistingProcess(result.existingProcess);
        return false;
      }
      if (!result?.processId) {
        autoSaveInFlightRef.current = false;
        setIsCreatingDraft(false);
        setAutoSaveMessage(result?.error ?? "No se pudo guardar el borrador.");
        return false;
      }

      setAutoSaveMessage("Borrador guardado automaticamente");
      sessionStorage.setItem(`process-wizard-scroll:${result.processId}`, String(window.scrollY));
      router.replace(`/procesos/${result.processId}/editar?wizard=create&step=2`, { scroll: false });
      return false;
    } catch {
      autoSaveInFlightRef.current = false;
      setIsCreatingDraft(false);
      setAutoSaveMessage("No se pudo guardar el borrador.");
      return false;
    }
  }

  const steps: ProcessWizardStep[] = [
    {
      id: "header",
      label: "Cabecera",
      content: (
        <section aria-labelledby="new-process-header-title" className="overflow-hidden rounded-lg border border-[#dbe4eb] bg-white">
          <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-sea">Ficha de proceso</p>
              <h2 className="mt-1 text-lg font-bold text-navy" id="new-process-header-title">Cabecera documental</h2>
            </div>
            <span className="inline-flex rounded-full border border-[#cbd8e3] bg-[#f6f8fa] px-2.5 py-1 text-xs font-bold text-slate-600">Borrador</span>
          </div>
          <div className="grid gap-4 bg-[#f8fafc] px-5 py-4 sm:grid-cols-2">
            {optionsError ? (
              <div className="rounded-md border border-[#ffd6b0] bg-[#fff4e8] px-3 py-2 text-sm font-medium text-[#86510d] sm:col-span-2">
                No se pudieron cargar todas las opciones de la cabecera: {optionsError}
              </div>
            ) : null}
            {!defaultCompanyId ? (
              <div className="rounded-md border border-[#ffd6b0] bg-[#fff4e8] px-3 py-2 text-sm font-medium text-[#86510d] sm:col-span-2">
                No se encontro una empresa estructural activa llamada McParking. No es posible crear el borrador.
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Field label="Proceso"><input className={`${inputClass} text-base font-bold text-navy`} name="name" onChange={() => setExistingProcess(null)} placeholder="Nombre del proceso" required /></Field>
            </div>
            <Field label="Empresa">
              <select
                className={inputClass}
                name="company_id"
                onChange={(event) => {
                  setSelectedCompanyId(event.target.value);
                  setSelectedOperationTypeId("");
                  setSelectedOwnerRoleId("");
                  setExistingProcess(null);
                }}
                required
                value={selectedCompanyId}
              >
                <option disabled value="">Selecciona una empresa</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="Tipo de proceso">
              <select className={inputClass} defaultValue="operational" name="process_type" required>
                {processTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <div>
              <Field label="Dueno del proceso">
                <select className={inputClass} name="owner_role_id" onChange={(event) => setSelectedOwnerRoleId(event.target.value)} value={selectedOwnerRoleId}>
                  <option value="">Sin rol dueno</option>
                  {visibleRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
              </Field>
              <p className="mt-1 text-xs text-slate-500">La persona actual se deriva del rol oficial.</p>
            </div>
            <Field label="Tipo de operación">
              <select className={inputClass} name="area_id" onChange={(event) => setSelectedOperationTypeId(event.target.value)} value={selectedOperationTypeId}>
                <option value="">Sin tipo de operación</option>
                {visibleOperationTypes.map((operationType) => <option key={operationType.id} value={operationType.id}>{operationType.name}</option>)}
              </select>
            </Field>
            {autoSaveMessage ? <p aria-live="polite" className="text-xs font-medium text-slate-600 sm:col-span-2">{autoSaveMessage}</p> : null}
            {existingProcess ? (
              <div className="rounded-md border border-[#ffd6b0] bg-[#fff4e8] px-3 py-3 text-sm text-[#86510d] sm:col-span-2">
                <p className="font-semibold">
                  {existingProcess.action === "continue"
                    ? `Ya existe un borrador con este nombre para ${existingProcess.companyName}.`
                    : `Ya existe un proceso activo con este nombre para ${existingProcess.companyName}.`}
                </p>
                <p className="mt-1 text-xs">
                  {existingProcess.processCode ?? "Sin codigo"}
                  {existingProcess.ownerRoleName ? ` · ${existingProcess.ownerRoleName}` : ""}
                  {existingProcess.lastEditedAt ? ` · Ultima edicion ${new Intl.DateTimeFormat("es-CL").format(new Date(existingProcess.lastEditedAt))}` : ""}
                </p>
                {existingProcess.action !== "none" ? (
                  <Link
                    className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-[#d6a65c] bg-white px-3 text-sm font-bold text-navy transition hover:bg-[#fffaf2] focus:outline-none focus-visible:ring-2 focus-visible:ring-sea"
                    href={existingProcess.action === "continue" ? `/procesos/${existingProcess.id}/editar` : `/procesos/${existingProcess.id}`}
                  >
                    {existingProcess.action === "continue" ? "Continuar borrador" : "Ver proceso"}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ),
    },
    {
      id: "purpose",
      label: "Proposito y alcance",
      content: (
        <ProcessDocumentSection title={"1. PROP\u00d3SITO Y ALCANCE"}>
          <div className="divide-y divide-line">
            <ProcessDocumentRow label={"PROP\u00d3SITO"}><textarea aria-label="Proposito" className={`${inputClass} min-h-24`} name="purpose" /></ProcessDocumentRow>
            <ProcessDocumentRow label="INICIO"><textarea aria-label="Inicio" className={`${inputClass} min-h-20`} name="process_start" /></ProcessDocumentRow>
            <ProcessDocumentRow label="FIN"><textarea aria-label="Fin" className={`${inputClass} min-h-20`} name="process_end" /></ProcessDocumentRow>
            <ProcessDocumentRow label="ALCANCE"><textarea aria-label="Alcance" className={`${inputClass} min-h-20`} name="scope" /></ProcessDocumentRow>
          </div>
        </ProcessDocumentSection>
      ),
    },
    {
      id: "flow",
      label: "Entradas y salidas",
      content: (
        <ProcessDocumentSection title={"2. ENTRADAS, ACTIVIDADES Y SALIDAS"}>
          <div className="divide-y divide-line">
            <ProcessDocumentRow label="PROVEEDOR / ORIGEN"><textarea aria-label="Proveedor / Origen" className={`${inputClass} min-h-24`} name="supplier_origin" /></ProcessDocumentRow>
            <ProcessDocumentRow label="ENTRADAS"><textarea aria-label="Entradas" className={`${inputClass} min-h-24`} name="process_inputs" /></ProcessDocumentRow>
            <ProcessDocumentRow label="ACTIVIDADES CLAVE / ETAPAS"><p className="text-sm text-slate-500">El editor de etapas se habilita al crear el borrador.</p></ProcessDocumentRow>
            <ProcessDocumentRow label="SALIDAS"><textarea aria-label="Salidas" className={`${inputClass} min-h-24`} name="process_outputs" /></ProcessDocumentRow>
            <ProcessDocumentRow label="CLIENTE / DESTINO"><textarea aria-label="Cliente / Destino" className={`${inputClass} min-h-24`} name="client_destination" /></ProcessDocumentRow>
          </div>
        </ProcessDocumentSection>
      ),
    },
    {
      id: "roles",
      label: "Roles y responsabilidades",
      content: <ProcessDocumentSection title={"3. ROLES, RESPONSABILIDADES Y AUTORIDAD"}><div className="px-4 py-4 text-sm text-slate-600">Disponible en el borrador del proceso.</div></ProcessDocumentSection>,
    },
    {
      id: "metrics",
      label: "Indicadores y objetivos",
      content: <ProcessDocumentSection title={"4. INDICADORES Y OBJETIVOS"}><div className="px-4 py-4 text-sm text-slate-600">Disponible en el borrador del proceso.</div></ProcessDocumentSection>,
    },
    {
      id: "risks",
      label: "Riesgos y controles",
      content: <ProcessDocumentSection title={"5. RIESGOS, CONTROLES Y OPORTUNIDADES"}><div className="px-4 py-4 text-sm text-slate-600">Disponible en el borrador del proceso.</div></ProcessDocumentSection>,
    },
  ];

  return (
    <form onSubmit={(event) => event.preventDefault()} ref={formRef}>
      <ProcessWizardShell
        mode="create"
        onBeforeNavigate={prepareDraftForWizard}
        pending={isCreatingDraft}
        pendingNextLabel="Guardando borrador..."
        steps={steps}
      />
    </form>
  );
}