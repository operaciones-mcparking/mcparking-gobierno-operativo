import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DashboardShell } from "@/components/dashboard/shell";
import {
  getAreaDirectory,
  getProcessCatalogV2,
  getRoleDictionary,
  type AreaDirectoryItem,
  type ProcessCatalogV2Item,
  type RoleDictionaryItem,
} from "@/lib/dashboard/data";
import { ProcessMasterSheet } from "../process-master/process-master-sheet";
import type { ProcessMasterDto } from "../process-master/process-master-types";
import {
  CreateProcessDraftForm,
  type DraftAreaOption,
  type DraftCompanyOption,
} from "./create-process-draft-form";

type NewProcessPageProps = {
  searchParams?: Promise<{
    country_id?: string;
    error?: string;
    ok?: string;
    site_id?: string;
  }>;
};

function uniqueCompanies(options: DraftCompanyOption[]) {
  const byId = new Map<string, string>();

  for (const option of options) {
    if (option.id && option.name && !byId.has(option.id)) {
      byId.set(option.id, option.name);
    }
  }

  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function uniqueAreas(options: DraftAreaOption[]) {
  const byId = new Map<string, DraftAreaOption>();

  for (const option of options) {
    if (option.id && option.name && !byId.has(option.id)) {
      byId.set(option.id, option);
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function processCompanyOptions(process: ProcessCatalogV2Item) {
  const options: DraftCompanyOption[] = [];

  if (process.owner_company_id && process.owner_company_name) {
    options.push({ id: process.owner_company_id, name: process.owner_company_name });
  } else if (process.owner_company_id && process.company_name) {
    options.push({ id: process.owner_company_id, name: process.company_name });
  }

  if (process.operating_company_id && process.operating_company_name) {
    options.push({ id: process.operating_company_id, name: process.operating_company_name });
  }

  return options;
}

function draftMasterProcess(companyName: string | null): ProcessMasterDto {
  return {
    process: {
      id: null,
      name: "Nuevo proceso",
      description: "Ficha inicial como borrador inactivo.",
      objective: null,
      expected_result: null,
      inputs_providers: null,
      outputs_clients: null,
      basic_kpi: null,
      company_id: "",
      company_name: companyName,
      area_id: null,
      area_name: null,
      process_type: "operational",
      criticality: "medium",
      status: "inactive",
      documentation_status: "draft",
    },
    responsibility: {
      owner_role_id: null,
      owner_role_name: null,
      owner_person_id: null,
      owner_person_name: null,
    },
    stages: [],
  };
}

export default async function NewProcessPage({ searchParams }: NewProcessPageProps) {
  const params = searchParams ? await searchParams : {};
  const context = {
    countryId: params.country_id ?? null,
    siteId: params.site_id ?? null,
  };
  const [catalogResult, areaDirectoryResult, roleDictionaryResult] = await Promise.all([
    getProcessCatalogV2(context),
    getAreaDirectory(context),
    getRoleDictionary(context),
  ]);
  const companies = uniqueCompanies([
    ...catalogResult.data.flatMap((process) => processCompanyOptions(process)),
    ...(areaDirectoryResult.data ?? [])
      .filter((area: AreaDirectoryItem) => area.company_id && area.company_name)
      .map((area: AreaDirectoryItem) => ({
        id: area.company_id as string,
        name: area.company_name as string,
      })),
  ]);
  const areas = uniqueAreas([
    ...(areaDirectoryResult.data ?? []).map((area: AreaDirectoryItem) => ({
      company_id: area.company_id,
      company_name: area.company_name,
      id: area.id,
      name: area.name,
    })),
    ...roleDictionaryResult.data
      .filter((role: RoleDictionaryItem) => role.area_id && role.area_name)
      .map((role: RoleDictionaryItem) => ({
        company_id: role.company_id,
        company_name: role.company_name,
        id: role.area_id as string,
        name: role.area_name as string,
      })),
  ]);
  const firstCompanyName = companies[0]?.name ?? null;

  return (
    <DashboardShell
      background="white"
      description="Crea una ficha maestra inicial como borrador inactivo antes de completarla y activarla."
      eyebrow="Nuevo proceso"
      title="Nuevo proceso"
    >
      {params.ok ? (
        <div className="mt-5 rounded-lg border border-[#c8e6d0] bg-[#e4f4ea] p-4 text-sm font-semibold text-[#24613d]">
          {params.ok}
        </div>
      ) : null}
      {params.error ? (
        <div className="mt-5 rounded-lg border border-[#ffd6b0] bg-[#ffe6ca] p-4 text-sm font-semibold text-[#86510d]">
          {params.error}
        </div>
      ) : null}

      <ProcessMasterSheet
        actions={
          <Link
            className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-bold text-navy transition hover:border-sea hover:bg-[#eef4f8]"
            href="/procesos"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a procesos
          </Link>
        }
        basicsEditor={
          <CreateProcessDraftForm
            areas={areas}
            companies={companies}
            optionsError={
              catalogResult.error?.message ??
              areaDirectoryResult.error?.message ??
              roleDictionaryResult.error?.message ??
              null
            }
          />
        }
        mode="create"
        process={draftMasterProcess(firstCompanyName)}
      />
    </DashboardShell>
  );
}
