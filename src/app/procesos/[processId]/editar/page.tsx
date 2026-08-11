import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Save } from "lucide-react";

import { criticalityOptions } from "@/components/dashboard/badge";
import { DashboardShell } from "@/components/dashboard/shell";
import { activateProcess, updateProcessBasics } from "@/app/admin/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEditableProcessCatalogItem, getProcessMatrix, getRoleDictionary } from "@/lib/dashboard/data";
import { mapProcessMasterDto } from "@/app/procesos/process-master/process-master-mapper";
import {
  getProcessActivationCompleteness,
  validateProcessForActivation,
} from "@/app/procesos/process-master/process-master-validation";
import { ArchiveProcessPanel } from "./archive-process-panel";
import { ProcessActivationPanel } from "./process-activation-panel";
import { StageEditor } from "./stage-editor";

type Params = Promise<{
  processId: string;
}>;

type SearchParams = Promise<{
  error?: string;
  ok?: string;
}>;

type ProcessRoleRow = {
  responsibility_type: string | null;
  role_id: string | null;
  subprocess_id: string | null;
};

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function StatePill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#d6e1ea] bg-[#f6f9fc] px-3 py-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-navy">{value}</p>
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

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-bold text-white transition hover:bg-[#075077]"
      type="submit"
    >
      <Save className="h-4 w-4 text-clay" />
      {children}
    </button>
  );
}

export default async function EditProcessPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { processId } = await params;
  const messages = await searchParams;
  const supabase = createSupabaseServerClient();
  const [processResult, matrixResult, systemsResult, roleDictionaryResult, processRolesResult] = await Promise.all([
    getEditableProcessCatalogItem(processId),
    getProcessMatrix(processId),
    supabase.from("systems").select("id,name").order("name"),
    getRoleDictionary(),
    supabase
      .from("process_roles")
      .select("subprocess_id,role_id,responsibility_type")
      .eq("process_id", processId)
      .not("subprocess_id", "is", null)
      .in("responsibility_type", ["owner", "user", "consulted", "backup"]),
  ]);

  if (!processResult.data || processResult.data.status === "archived") {
    notFound();
  }

  const process = processResult.data;
  const rows = matrixResult.data;
  const systems = systemsResult.data ?? [];
  const processRoles = (processRolesResult.data ?? []) as ProcessRoleRow[];
  const officialActiveRoleIds = new Set(
    roleDictionaryResult.data.filter((role) => role.role_status === "active").map((role) => role.role_id),
  );
  const ownerRoleBySubprocess = Object.fromEntries(
    processRoles
      .filter(
        (role) =>
          role.responsibility_type === "owner" &&
          Boolean(role.subprocess_id) &&
          Boolean(role.role_id) &&
          officialActiveRoleIds.has(role.role_id ?? ""),
      )
      .map((role) => [role.subprocess_id ?? "", role.role_id ?? ""]),
  );
  const stageRoleIdsBySubprocess = processRoles.reduce<
    Record<string, { backup_role_id?: string | null; support_role_ids?: string[]; user_role_id?: string | null }>
  >((acc, role) => {
    if (!role.subprocess_id || !role.role_id || !officialActiveRoleIds.has(role.role_id)) {
      return acc;
    }

    const current = acc[role.subprocess_id] ?? { support_role_ids: [] };

    if (role.responsibility_type === "backup") {
      current.backup_role_id = role.role_id;
    }

    if (role.responsibility_type === "user") {
      current.user_role_id = role.role_id;
    }

    if (role.responsibility_type === "consulted") {
      current.support_role_ids = [...(current.support_role_ids ?? []), role.role_id];
    }

    acc[role.subprocess_id] = current;
    return acc;
  }, {});
  const masterProcess = mapProcessMasterDto({
    ownerRoleBySubprocess,
    process,
    stageRoleIdsBySubprocess,
    stages: rows.map((row) => ({ ...row, subprocess_status: "active" })),
  });
  const activationValidation = validateProcessForActivation(masterProcess);
  const activationCompleteness = getProcessActivationCompleteness(activationValidation);
  const nextSortOrder =
    rows.reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0)), 0) + 1;

  return (
    <DashboardShell
      background="white"
      description="Mantencion del proceso, sus datos base y sus etapas operativas."
      eyebrow="Editar proceso"
      title={process.process_name}
    >
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef4f8]"
          href={`/procesos/${process.process_id}`}
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la ficha
        </Link>
        <Link
          className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef4f8]"
          href="/procesos"
        >
          <FileText className="h-4 w-4" />
          Procesos
        </Link>
      </div>

      {messages.ok ? (
        <div className="mt-5 rounded-lg border border-[#c8e6d0] bg-[#e4f4ea] p-4 text-sm font-semibold text-[#24613d]">
          {messages.ok}
        </div>
      ) : null}
      {messages.error ? (
        <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm font-semibold text-[#86510d]">
          {messages.error}
        </div>
      ) : null}

      {process.status === "inactive" ? (
        <ProcessActivationPanel
          action={activateProcess}
          completeness={activationCompleteness}
          processId={process.process_id}
          processName={process.process_name}
          validation={activationValidation}
        />
      ) : (
        <section className="mt-5 rounded-lg border border-[#c8e6d0] bg-[#f3fbf6] p-5 text-sm font-semibold text-[#24613d]">
          Activo. Este proceso ya forma parte del Diccionario de procesos oficiales.
        </section>
      )}

      <section className="mt-5 rounded-lg border border-line bg-white shadow-[0_10px_30px_rgba(0,59,92,0.06)]">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-xl font-bold text-navy">Datos del proceso</h2>
          <p className="mt-1 text-sm text-slate-600">
            Informacion principal que aparece en la ficha ejecutiva.
          </p>
        </div>

        <form action={updateProcessBasics} className="grid gap-4 px-5 py-5">
          <input name="process_id" type="hidden" value={process.process_id} />
          <Field label="Nombre">
            <input className={inputClass} name="name" required defaultValue={process.process_name} />
          </Field>
          <Field label="Definicion">
            <textarea
              className={`${inputClass} min-h-24`}
              name="description"
              defaultValue={process.definition ?? ""}
            />
          </Field>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Objetivo">
              <textarea
                className={`${inputClass} min-h-28`}
                name="objective"
                defaultValue={process.objective ?? ""}
              />
            </Field>
            <Field label="Resultado esperado">
              <textarea
                className={`${inputClass} min-h-28`}
                name="expected_result"
                defaultValue={process.expected_result ?? ""}
              />
            </Field>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Entradas y proveedores">
              <textarea
                className={`${inputClass} min-h-28`}
                name="inputs_providers"
                defaultValue={process.inputs_providers ?? ""}
              />
            </Field>
            <Field label="Salidas y clientes">
              <textarea
                className={`${inputClass} min-h-28`}
                name="outputs_clients"
                defaultValue={process.outputs_clients ?? ""}
              />
            </Field>
            <Field label="KPI basico">
              <textarea
                className={`${inputClass} min-h-28`}
                name="basic_kpi"
                defaultValue={process.basic_kpi ?? ""}
              />
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Tipo de proceso">
              <select className={inputClass} name="process_type" defaultValue={process.process_type}>
                {processTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Criticidad">
              <select className={inputClass} name="criticality" defaultValue={process.criticality}>
                {criticalityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <StatePill label="Estado" value={statusLabels[process.status] ?? process.status} />
            <StatePill
              label="Documentacion"
              value={documentationLabels[process.documentation_status] ?? process.documentation_status}
            />
          </div>
          <div>
            <PrimaryButton>Guardar proceso</PrimaryButton>
          </div>
        </form>
      </section>

      <StageEditor
        initialRows={rows}
        nextSortOrder={nextSortOrder}
        processId={process.process_id}
        roleDictionary={roleDictionaryResult.data}
        systems={systems}
      />

      {process.status === "active" ? <ArchiveProcessPanel processId={process.process_id} /> : null}
    </DashboardShell>
  );
}
