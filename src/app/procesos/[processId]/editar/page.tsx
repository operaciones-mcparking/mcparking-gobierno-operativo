import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Save } from "lucide-react";

import {
  criticalityOptions,
  documentationOptions,
  statusOptions,
} from "@/components/dashboard/badge";
import { DashboardShell } from "@/components/dashboard/shell";
import { updateProcessBasics } from "@/app/admin/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProcessCatalogItem, getProcessMatrix, getRoleDictionary } from "@/lib/dashboard/data";
import { ArchiveProcessPanel } from "./archive-process-panel";
import { StageEditor } from "./stage-editor";

type Params = Promise<{
  processId: string;
}>;

type SearchParams = Promise<{
  error?: string;
  ok?: string;
}>;

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

const inputClass =
  "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]";

const processTypeOptions = [
  { label: "Estratégico", value: "strategic" },
  { label: "Operativo / Clave", value: "operational" },
  { label: "Soporte", value: "support" },
];

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
  const [processResult, matrixResult, rolesResult, systemsResult, roleDictionaryResult] = await Promise.all([
    getProcessCatalogItem(processId),
    getProcessMatrix(processId),
    supabase.from("roles").select("id,name").order("name"),
    supabase.from("systems").select("id,name").order("name"),
    getRoleDictionary(),
  ]);

  if (!processResult.data) {
    notFound();
  }

  const process = processResult.data;
  const rows = matrixResult.data;
  const roles = rolesResult.data ?? [];
  const systems = systemsResult.data ?? [];
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
            <Field label="Estado">
              <select className={inputClass} name="status" defaultValue={process.status}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Documentacion">
              <select
                className={inputClass}
                name="documentation_status"
                defaultValue={process.documentation_status}
              >
                {documentationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
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
        roles={roles}
        roleDictionary={roleDictionaryResult.data}
        systems={systems}
      />

      {process.status === "active" ? <ArchiveProcessPanel processId={process.process_id} /> : null}
    </DashboardShell>
  );
}
