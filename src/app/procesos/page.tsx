import { ValueBadge } from "@/components/dashboard/badge";
import { DashboardShell } from "@/components/dashboard/shell";
import {
  getAreaDirectory,
  getProcessCatalogV2,
  getProcessMatrixV2,
  getProcessStageOwnerRoles,
  getRoleDictionary,
  type ProcessCatalogV2Item,
} from "@/lib/dashboard/data";
import { CreateProcessModal } from "./create-process-modal";
import { ProcessCatalogClient } from "./process-catalog-client";
import { ProcessMacroMap } from "./process-macro-map";

type CreateProcessOption = {
  id: string;
  name: string;
};

type CreateProcessAreaOption = CreateProcessOption & {
  company_id: string | null;
  company_name: string | null;
};

type IdNameOption = {
  id: string;
  name: string;
};

function uniqueCreateProcessOptions(options: CreateProcessOption[]) {
  const seen = new Set<string>();

  return options
    .filter((option) => {
      if (!option.id || seen.has(option.id)) {
        return false;
      }

      seen.add(option.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function uniqueCreateProcessAreas(options: CreateProcessAreaOption[]) {
  const seen = new Set<string>();

  return options
    .filter((option) => {
      if (!option.id || seen.has(option.id)) {
        return false;
      }

      seen.add(option.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

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
  const [catalogResult, matrixResult, areaDirectoryResult, roleDictionaryResult, stageOwnerRolesResult] = await Promise.all([
    getProcessCatalogV2(context),
    getProcessMatrixV2(),
    getAreaDirectory(context),
    getRoleDictionary(context),
    getProcessStageOwnerRoles(),
  ]);
  const activeProcesses = catalogResult.data;
  const createProcessSource = activeProcesses.length > 0 ? activeProcesses : catalogResult.data;
  const createProcessCompanies = uniqueCreateProcessOptions([
    ...createProcessSource.flatMap((process) => {
      const options: CreateProcessOption[] = [];

      if (process.owner_company_id && process.owner_company_name) {
        options.push({ id: process.owner_company_id, name: process.owner_company_name });
      } else if (process.owner_company_id && process.company_name) {
        options.push({ id: process.owner_company_id, name: process.company_name });
      }

      if (process.operating_company_id && process.operating_company_name) {
        options.push({ id: process.operating_company_id, name: process.operating_company_name });
      }

      return options;
    }),
    ...(areaDirectoryResult.data ?? [])
      .filter((area) => area.company_id && area.company_name)
      .map((area) => ({
        id: area.company_id as string,
        name: area.company_name as string,
      })),
  ]);
  const createProcessAreas = uniqueCreateProcessAreas([
    ...(areaDirectoryResult.data ?? []).map((area) => ({
      company_id: area.company_id,
      company_name: area.company_name,
      id: area.id,
      name: area.name,
    })),
    ...roleDictionaryResult.data
      .filter((role) => role.area_id && role.area_name)
      .map((role) => ({
        company_id: role.company_id,
        company_name: role.company_name,
        id: role.area_id as string,
        name: role.area_name as string,
      })),
  ]);

  const companyOptions = Array.from(
    new Set(
      activeProcesses
        .map((process) => process.owner_company_name ?? process.company_name)
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const typeOptions = Array.from(
    new Set(activeProcesses.map((process) => process.area_name ?? "Sin tipo")),
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
        <CreateProcessModal
          areas={createProcessAreas}
          companies={createProcessCompanies}
          optionsError={areaDirectoryResult.error?.message ?? roleDictionaryResult.error?.message ?? null}
        />
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
              19 procesos organizados por tipo, responsables y etapas.
            </p>
          </div>
        </div>
        {catalogResult.error || matrixResult.error ? (
          <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm font-medium text-[#86510d]">
            {catalogResult.error?.message ?? matrixResult.error?.message}
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
            typeOptions={typeOptions}
          />
        )}
      </section>
    </DashboardShell>
  );
}
