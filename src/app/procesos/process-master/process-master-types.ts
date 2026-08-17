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
  user_role_name?: string | null;
  user_person_name?: string | null;
  support_role_ids: string[];
  support_role_names?: string[];
  support_person_names?: string[];
  backup_role_id: string | null;
  backup_role_name?: string | null;
  backup_person_name?: string | null;
  systems?: string | null;
  risks?: string | null;
  controls?: string | null;
};

export type ProcessMasterDto = {
  process: {
    id: string | null;
    name: string;
    processCode: string | null;
    version: string | null;
    masterUpdatedAt: string | null;
    createdAt: string | null;
    effectiveDate: string | null;
    description: string | null;
    objective: string | null;
    expected_result: string | null;
    processStart: string | null;
    processEnd: string | null;
    scope: string | null;
    inputs_providers: string | null;
    outputs_clients: string | null;
    supplier_origin: string | null;
    process_inputs: string | null;
    process_outputs: string | null;
    client_destination: string | null;
    basic_kpi: string | null;
    pdca: {
      plan: string | null;
      do: string | null;
      check: string | null;
      act: string | null;
    };
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
  roleProfiles: ProcessMasterRoleProfile[];
  metrics: ProcessMasterMetric[];
  risks: ProcessMasterRisk[];
};
export type ProcessMasterRoleProfile = {
  id: string;
  sort_order: number;
  role_id: string;
  role_name: string;
  current_person_name: string | null;
  responsibility: string | null;
  authority: string | null;
  accountability: string | null;
  is_process_owner: boolean;
  participations: ProcessRoleParticipation[];
};

export type ProcessRoleParticipation = 'owner' | 'user' | 'consulted' | 'backup';

export type ProcessMasterResponsibleRole = {
  role_id: string;
  role_name: string;
  sort_order: number;
};

export type ProcessMasterMetric = {
  id: string;
  name: string;
  formula: string | null;
  target: string | null;
  frequency: string | null;
  owner_role_id: string | null;
  owner_role_name: string | null;
  owner_person_name: string | null;
  responsible_roles: ProcessMasterResponsibleRole[];
  sort_order: number;
};

export type ProcessMasterControl = {
  id: string;
  name: string;
  evidence: string | null;
  owner_role_id: string | null;
  owner_role_name: string | null;
  owner_person_name: string | null;
  responsible_roles: ProcessMasterResponsibleRole[];
};

export type ProcessMasterRisk = {
  id: string;
  name: string;
  risk_type: "risk" | "opportunity";
  controls: ProcessMasterControl[];
};

export type ProcessMetricSaveRow = {
  formula: string;
  frequency: string;
  id: string | null;
  name: string;
  responsibleRoleIds: string[];
  target: string;
};

export type ProcessRiskControlSaveRow = {
  controlId: string | null;
  controlName: string;
  evidence: string;
  responsibleRoleIds: string[];
  riskId: string | null;
  riskName: string;
  riskType: "risk" | "opportunity";
};
