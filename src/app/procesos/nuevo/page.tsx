import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DashboardShell } from "@/components/dashboard/shell";
import {
  getRoleDictionary,
  type RoleDictionaryItem,
} from "@/lib/dashboard/data";
import {
  getActiveProcessCompanyOptions,
  getActiveProcessOperationTypeOptions,
} from "@/lib/procesos/process-company-options";
import { ProcessMasterSheet } from "../process-master/process-master-sheet";
import type { ProcessMasterDto } from "../process-master/process-master-types";
import {
  CreateProcessDraftForm,
  type DraftRoleOption,
} from "./create-process-draft-form";

type NewProcessPageProps = {
  searchParams?: Promise<{
    error?: string;
    ok?: string;
  }>;
};

function draftMasterProcess(): ProcessMasterDto {
  return {
    process: {
      id: null,
      name: "Nuevo proceso",
      processCode: null,
      version: null,
      masterUpdatedAt: null,
      createdAt: null,
      effectiveDate: null,
      description: "Ficha inicial como borrador inactivo.",
      objective: null,
      expected_result: null,
      processStart: null,
      processEnd: null,
      scope: null,
      inputs_providers: null,
      outputs_clients: null,
      supplier_origin: null,
      process_inputs: null,
      process_outputs: null,
      client_destination: null,
      basic_kpi: null,
      pdca: {
        plan: null,
        do: null,
        check: null,
        act: null,
      },
      company_id: "",
      company_name: null,
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
    roleProfiles: [],
    metrics: [],
    risks: [],
  };
}

export default async function NewProcessPage({ searchParams }: NewProcessPageProps) {
  const params = searchParams ? await searchParams : {};
  const [companyResult, operationTypeResult, roleDictionaryResult] = await Promise.all([
    getActiveProcessCompanyOptions(),
    getActiveProcessOperationTypeOptions(),
    getRoleDictionary(),
  ]);
  const roles: DraftRoleOption[] = roleDictionaryResult.data
    .filter((role: RoleDictionaryItem) => role.role_status === "active")
    .map((role: RoleDictionaryItem) => ({
      id: role.role_id,
      companyId: role.company_id,
      name: role.role_name,
    }));

  return (
    <DashboardShell
      background="white"
      description="Crea una ficha maestra inicial como borrador inactivo antes de completarla y activarla."
      eyebrow="Procesos"
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
            href="/estructura#procesos"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a procesos
          </Link>
        }
        headerEditor={
          <CreateProcessDraftForm
            companies={companyResult.data}
            operationTypes={operationTypeResult.data}
            optionsError={companyResult.error?.message ?? operationTypeResult.error?.message ?? roleDictionaryResult.error?.message ?? null}
            roles={roles}
          />
        }
        mode="create"
        process={draftMasterProcess()}
      />
    </DashboardShell>
  );
}