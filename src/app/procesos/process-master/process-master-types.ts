export type ProcessMasterMode = "create" | "edit" | "readonly";

export type ProcessMasterCriticality = "low" | "medium" | "high" | "critical";

export type ProcessMasterStatus = "active" | "inactive" | "archived";

export type ProcessMasterDocumentationStatus =
  | "not_started"
  | "draft"
  | "documented"
  | "needs_update";

export type ProcessMasterProcessType = "strategic" | "operational" | "support";

export type ProcessMasterStage = {
  id: string | null;
  name: string;
  description: string | null;
  criticality: ProcessMasterCriticality;
  impact_percent: number | null;
  sort_order: number;
  status: ProcessMasterStatus;
  owner_role_id: string | null;
  owner_role_name: string | null;
  owner_person_name: string | null;
  user_role_id: string | null;
  support_role_ids: string[];
  backup_role_id: string | null;
};

export type ProcessMasterDto = {
  process: {
    id: string | null;
    name: string;
    description: string | null;
    objective: string | null;
    expected_result: string | null;
    inputs_providers: string | null;
    outputs_clients: string | null;
    basic_kpi: string | null;
    company_id: string;
    company_name?: string | null;
    area_id: string | null;
    area_name?: string | null;
    process_type: ProcessMasterProcessType;
    criticality: ProcessMasterCriticality;
    status: ProcessMasterStatus;
    documentation_status: ProcessMasterDocumentationStatus;
  };
  responsibility: {
    owner_role_id: string | null;
    owner_role_name: string | null;
    owner_person_id: string | null;
    owner_person_name: string | null;
  };
  stages: ProcessMasterStage[];
};
