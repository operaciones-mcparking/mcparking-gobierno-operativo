import Link from "next/link";
import { PlusCircle } from "lucide-react";

import { ValueBadge } from "@/components/dashboard/badge";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  getProcessCatalogV2,
  getProcessMatrixV2,
  getProcessStageOwnerRoles,
  getRoleDictionary,
  type ProcessCatalogV2Item,
} from "@/lib/dashboard/data";
import { getActiveProcessOperationTypeOptions } from "@/lib/procesos/process-company-options";
import { ProcessCatalogClient } from "./process-catalog-client";
import { ProcessMacroMap } from "./process-macro-map";

type IdNameOption = {
  id: string;
  name: string;
};

function uniqueIdNameOptions(pairs: Array<{ id: string; name: string }>) {
  const byId = new Map<string, string>();

  for (const pair of pairs) {
    if (pair.id && pair.name && !byId.has(pair.id)) {
      byId.set(pair.id, pair.name);
    }
  }

  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}


type ProcesosPageProps = {
  searchParams?: Promise<{
    country_id?: string;
    site_id?: string;
  }>;
};

export default async function ProcesosPage({ searchParams }: ProcesosPageProps) {
  const params = searchParams ? await searchParams : {};
  const context = {
    countryId: params.country_id ?? null,
    siteId: params.site_id ?? null,
  };
  const [catalogResult, matrixResult, roleDictionaryResult, stageOwnerRolesResult, operationTypeResult] = await Promise.all([
    getProcessCatalogV2(context),
    getProcessMatrixV2(),
    getRoleDictionary(context),
    getProcessStageOwnerRoles(),
    getActiveProcessOperationTypeOptions(),
  ]);
  const activeProcesses = catalogResult.data;
  const companyOptions = Array.from(
    new Set(
      activeProcesses
        .map((process) => process.owner_company_name ?? process.company_name)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const ownerRoleOptions = uniqueIdNameOptions(
    activeProcesses.flatMap((process) =>
      process.owner_role_ids.map((id, index) => ({
        id,
        name: process.owner_role_names[index] ?? id,
      })),
    ),
  );
  const personOptions = uniqueIdNameOptions(
    activeProcesses.flatMap((process) =>
      process.current_person_ids.map((id, index) => ({
        id,
        name: process.current_person_names[index] ?? id,
      })),
    ),
  );
  const supportRoleOptions = uniqueIdNameOptions(
    activeProcesses.flatMap((process) =>
      process.support_role_ids.map((id, index) => ({
        id,
        name: process.support_role_names[index] ?? id,
      })),
    ),
  );
  const macroMapProcesses = activeProcesses.filter((process: ProcessCatalogV2Item) => {
    const ownerCompany = process.owner_company_name ?? process.company_name;

    return ownerCompany === "McParking";
  });

  return (
    <DashboardShell
      description="Catalogo de procesos oficiales con responsables, etapas activas y roles de apoyo."
      eyebrow={`${activeProcesses.length} Procesos`}
      title="Procesos oficiales"
    >
      <div className="mb-4 mt-5 flex justify-end">
        <Link
          className="inline-flex items-center justify-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-bold text-white shadow-[0_10px_22px_rgba(2,53,116,0.12)] transition hover:bg-[#075077]"
          href="/procesos/nuevo"
        >
          <PlusCircle className="h-4 w-4 text-clay" />
          Nuevo proceso
        </Link>
      </div>

      {!catalogResult.error ? <ProcessMacroMap processes={macroMapProcesses} /> : null}

      <section className="mt-4 border-b border-[#d6e1ea] bg-transparent pb-6">
        <div className="flex flex-col gap-3 px-1 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-medium tracking-tight text-navy">Diccionario de procesos</h2>
              <ValueBadge tone="info">{activeProcesses.length} procesos</ValueBadge>
            </div>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Procesos organizados por tipo, responsables y etapas.
            </p>
          </div>
        </div>
        {catalogResult.error || matrixResult.error || operationTypeResult.error ? (
          <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm font-medium text-[#86510d]">
            {catalogResult.error?.message ?? matrixResult.error?.message ?? operationTypeResult.error?.message}
          </div>
        ) : (
          <ProcessCatalogClient
            activeProcesses={activeProcesses}
            companyOptions={companyOptions}
            matrixRows={matrixResult.data}
            ownerRoleOptions={ownerRoleOptions}
            personOptions={personOptions}
            roleDictionary={roleDictionaryResult.data}
            stageOwnerRoles={stageOwnerRolesResult.data}
            supportRoleOptions={supportRoleOptions}
            typeOptions={operationTypeResult.data}
          />
        )}
      </section>
    </DashboardShell>
  );
}
