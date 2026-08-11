import type { ProcessMasterDto, ProcessMasterStage } from "./process-master-types";

export type ProcessActivationValidation = {
  isValid: boolean;
  missingFields: Array<{
    key: string;
    label: string;
    section: string;
    severity: "blocking";
  }>;
  warnings: Array<{
    key: string;
    label: string;
    section: string;
    severity: "warning";
  }>;
};

export type ProcessActivationCompleteness = {
  blockingCount: number;
  completionPercent: number;
  warningCount: number;
};

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function activeStages(process: ProcessMasterDto) {
  return process.stages.filter((stage) => stage.status === "active");
}

function hasOwner(stage: ProcessMasterStage) {
  return hasText(stage.owner_role_id);
}

function impactCents(value: number) {
  return Math.round(value * 100);
}

export function validateProcessForActivation(process: ProcessMasterDto): ProcessActivationValidation {
  const missingFields: ProcessActivationValidation["missingFields"] = [];
  const warnings: ProcessActivationValidation["warnings"] = [];
  const stages = activeStages(process);

  const requiredFields = [
    { key: "name", label: "Nombre", section: "Informacion general", value: process.process.name },
    { key: "company_id", label: "Empresa", section: "Informacion general", value: process.process.company_id },
    { key: "process_type", label: "Tipo de proceso", section: "Informacion general", value: process.process.process_type },
    { key: "objective", label: "Objetivo", section: "Definicion del proceso", value: process.process.objective },
    {
      key: "inputs_providers",
      label: "Entradas y proveedores",
      section: "Definicion del proceso",
      value: process.process.inputs_providers,
    },
    {
      key: "outputs_clients",
      label: "Salidas y clientes",
      section: "Definicion del proceso",
      value: process.process.outputs_clients,
    },
    { key: "basic_kpi", label: "KPI basico", section: "Definicion del proceso", value: process.process.basic_kpi },
  ];

  for (const field of requiredFields) {
    if (!hasText(field.value)) {
      missingFields.push({
        key: field.key,
        label: field.label,
        section: field.section,
        severity: "blocking",
      });
    }
  }

  if (stages.length === 0) {
    missingFields.push({
      key: "active_stage",
      label: "Al menos una etapa activa",
      section: "Etapas / subprocesos",
      severity: "blocking",
    });
  }

  if (!hasText(process.process.area_id)) {
    warnings.push({
      key: "area_id",
      label: "Area no asignada",
      section: "Informacion general",
      severity: "warning",
    });
  }

  if (!hasText(process.responsibility.owner_person_name)) {
    warnings.push({
      key: "owner_person",
      label: "Persona actual no asignada",
      section: "Responsabilidad",
      severity: "warning",
    });
  }

  if (!hasText(process.process.expected_result)) {
    warnings.push({
      key: "expected_result",
      label: "Resultado esperado vacio",
      section: "Definicion del proceso",
      severity: "warning",
    });
  }

  for (const stage of stages) {
    if (!hasOwner(stage)) {
      missingFields.push({
        key: `stage_owner:${stage.id ?? stage.sort_order}`,
        label: `Rol dueno en etapa: ${stage.name}`,
        section: "Etapas / subprocesos",
        severity: "blocking",
      });
    }

    if (stage.impact_percent === null) {
      missingFields.push({
        key: `stage_impact:${stage.id ?? stage.sort_order}`,
        label: `Impacto no definido: ${stage.name}`,
        section: "Etapas / subprocesos",
        severity: "blocking",
      });
    } else if (stage.impact_percent < 0 || stage.impact_percent > 100) {
      missingFields.push({
        key: `stage_impact_range:${stage.id ?? stage.sort_order}`,
        label: `Impacto fuera de rango: ${stage.name}`,
        section: "Etapas / subprocesos",
        severity: "blocking",
      });
    }

    if (stage.criticality === "critical" && !hasText(stage.backup_role_id)) {
      warnings.push({
        key: `stage_backup:${stage.id ?? stage.sort_order}`,
        label: `Etapa critica sin respaldo: ${stage.name}`,
        section: "Etapas / subprocesos",
        severity: "warning",
      });
    }

    if (stage.support_role_ids.length === 0) {
      warnings.push({
        key: `stage_support:${stage.id ?? stage.sort_order}`,
        label: `Sin roles de apoyo: ${stage.name}`,
        section: "Etapas / subprocesos",
        severity: "warning",
      });
    }
  }

  const impactTotalCents = stages.reduce(
    (total, stage) => total + (stage.impact_percent === null ? 0 : impactCents(stage.impact_percent)),
    0,
  );
  if (stages.length > 0 && impactTotalCents !== 10000) {
    missingFields.push({
      key: "impact_total",
      label: `Impacto total: ${impactTotalCents / 100}%`,
      section: "Etapas / subprocesos",
      severity: "blocking",
    });
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
    warnings,
  };
}

export function getProcessActivationCompleteness(
  validation: ProcessActivationValidation,
): ProcessActivationCompleteness {
  const totalRequirements = 10;
  const blockingCount = validation.missingFields.length;
  const satisfiedRequirements = Math.max(totalRequirements - blockingCount, 0);

  return {
    blockingCount,
    completionPercent: Math.round((satisfiedRequirements / totalRequirements) * 100),
    warningCount: validation.warnings.length,
  };
}
