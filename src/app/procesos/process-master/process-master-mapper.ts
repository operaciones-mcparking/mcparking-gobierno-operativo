import type {
  ProcessCatalogV2Item,
  ProcessStageV2Row,
} from "@/lib/dashboard/data";
import type {
  ProcessMasterCriticality,
  ProcessMasterDocumentationStatus,
  ProcessMasterDto,
  ProcessMasterProcessType,
  ProcessMasterStatus,
} from "./process-master-types";

type StageRoleIds = {
  backup_role_id?: string | null;
  support_role_ids?: string[];
  user_role_id?: string | null;
};

type MapProcessMasterInput = {
  ownerRoleBySubprocess?: Record<string, string>;
  process: ProcessCatalogV2Item;
  stageRoleIdsBySubprocess?: Record<string, StageRoleIds>;
  stages: ProcessStageV2Row[];
};

function processType(value: ProcessCatalogV2Item["process_type"]): ProcessMasterProcessType {
  if (value === "strategic" || value === "support") {
    return value;
  }

  return "operational";
}

function criticality(value: string): ProcessMasterCriticality {
  if (value === "low" || value === "high" || value === "critical") {
    return value;
  }

  return "medium";
}

function status(value: string): ProcessMasterStatus {
  if (value === "inactive" || value === "archived") {
    return value;
  }

  return "active";
}

function documentationStatus(value: string): ProcessMasterDocumentationStatus {
  if (value === "not_started" || value === "documented" || value === "needs_update") {
    return value;
  }

  return "draft";
}

export function mapProcessMasterDto({
  ownerRoleBySubprocess = {},
  process,
  stageRoleIdsBySubprocess = {},
  stages,
}: MapProcessMasterInput): ProcessMasterDto {
  const activeStages = stages.filter((stage) => status(stage.subprocess_status) === "active");
  const firstOwnerStage = activeStages.find((stage) => ownerRoleBySubprocess[stage.subprocess_id] || stage.owner_role_name);

  return {
    process: {
      id: process.process_id,
      name: process.process_name,
      description: process.definition,
      objective: process.objective,
      expected_result: process.expected_result,
      inputs_providers: process.inputs_providers,
      outputs_clients: process.outputs_clients,
      basic_kpi: process.basic_kpi,
      company_id: process.company_id ?? "",
      company_name: process.owner_company_name ?? process.company_name ?? process.operating_company_name,
      area_id: process.area_id,
      area_name: process.area_name,
      process_type: processType(process.process_type),
      criticality: criticality(process.criticality),
      status: status(process.status),
      documentation_status: documentationStatus(process.documentation_status),
    },
    responsibility: {
      owner_role_id:
        (firstOwnerStage ? ownerRoleBySubprocess[firstOwnerStage.subprocess_id] : null) ??
        process.owner_role_ids[0] ??
        null,
      owner_role_name: firstOwnerStage?.owner_role_name ?? process.owner_role_names[0] ?? null,
      owner_person_id: process.current_person_ids[0] ?? null,
      owner_person_name: firstOwnerStage?.owner_person_name ?? process.current_person_names[0] ?? null,
    },
    stages: activeStages.map((stage, index) => {
      const roleIds = stageRoleIdsBySubprocess[stage.subprocess_id] ?? {};

      return {
        id: stage.subprocess_id,
        name: stage.subprocess_name,
        description: stage.subprocess_description,
        criticality: criticality(stage.criticality),
        impact_percent: stage.impact_percent,
        sort_order: stage.sort_order ?? index + 1,
        status: status(stage.subprocess_status),
        owner_role_id: ownerRoleBySubprocess[stage.subprocess_id] ?? null,
        owner_role_name: stage.owner_role_name,
        owner_person_name: stage.owner_person_name,
        user_role_id: roleIds.user_role_id ?? null,
        user_role_name: stage.user_role_name,
        user_person_name: stage.user_person_name,
        support_role_ids: roleIds.support_role_ids ?? [],
        support_role_names: stage.support_role_name ? [stage.support_role_name] : [],
        support_person_names: stage.support_person_name ? [stage.support_person_name] : [],
        backup_role_id: roleIds.backup_role_id ?? null,
        backup_role_name: stage.backup_role_name,
        backup_person_name: stage.backup_person_name,
        systems: stage.systems,
        risks: stage.risks,
        controls: stage.controls,
      };
    }),
  };
}
