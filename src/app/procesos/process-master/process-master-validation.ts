import type { ProcessMasterDto } from "./process-master-types";

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

export type ProcessActivationSnapshot = {
  activeStageCount: number;
  areaId: string | null;
  clientDestination: string | null;
  companyId: string | null;
  name: string | null;
  objective: string | null;
  ownerPersonName: string | null;
  processInputs: string | null;
  processOutputs: string | null;
  processType: string | null;
  supplierOrigin: string | null;
};

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

export function createProcessActivationSnapshot(process: ProcessMasterDto): ProcessActivationSnapshot {
  return {
    activeStageCount: process.stages.filter((stage) => stage.status === "active").length,
    areaId: process.process.area_id,
    clientDestination: process.process.client_destination,
    companyId: process.process.company_id,
    name: process.process.name,
    objective: process.process.objective,
    ownerPersonName: process.responsibility.owner_person_name,
    processInputs: process.process.process_inputs,
    processOutputs: process.process.process_outputs,
    processType: process.process.process_type,
    supplierOrigin: process.process.supplier_origin,
  };
}

export function evaluateProcessActivationReadiness(snapshot: ProcessActivationSnapshot): ProcessActivationValidation {
  const missingFields: ProcessActivationValidation["missingFields"] = [];
  const warnings: ProcessActivationValidation["warnings"] = [];

  const requiredFields = [
    { key: "name", label: "Nombre", section: "Informacion general", value: snapshot.name },
    { key: "company_id", label: "Empresa", section: "Informacion general", value: snapshot.companyId },
    { key: "process_type", label: "Tipo de proceso", section: "Informacion general", value: snapshot.processType },
    { key: "objective", label: "Proposito", section: "Proposito y alcance", value: snapshot.objective },
    { key: "supplier_origin", label: "Proveedor / Origen", section: "Entradas, actividades y salidas", value: snapshot.supplierOrigin },
    { key: "process_inputs", label: "Entradas", section: "Entradas, actividades y salidas", value: snapshot.processInputs },
    { key: "process_outputs", label: "Salidas", section: "Entradas, actividades y salidas", value: snapshot.processOutputs },
    { key: "client_destination", label: "Cliente / Destino", section: "Entradas, actividades y salidas", value: snapshot.clientDestination },
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

  if (snapshot.activeStageCount === 0) {
    missingFields.push({
      key: "active_stage",
      label: "Al menos una etapa activa",
      section: "Etapas / subprocesos",
      severity: "blocking",
    });
  }

  if (!hasText(snapshot.areaId)) {
    warnings.push({
      key: "area_id",
      label: "Tipo de operación no asignado",
      section: "Informacion general",
      severity: "warning",
    });
  }

  if (!hasText(snapshot.ownerPersonName)) {
    warnings.push({
      key: "owner_person",
      label: "Persona actual no asignada",
      section: "Responsabilidad",
      severity: "warning",
    });
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
    warnings,
  };
}

export function validateProcessForActivation(process: ProcessMasterDto): ProcessActivationValidation {
  return evaluateProcessActivationReadiness(createProcessActivationSnapshot(process));
}
export function getProcessActivationCompleteness(
  validation: ProcessActivationValidation,
): ProcessActivationCompleteness {
  const totalRequirements = 9;
  const blockingCount = validation.missingFields.length;
  const satisfiedRequirements = Math.max(totalRequirements - blockingCount, 0);

  return {
    blockingCount,
    completionPercent: Math.round((satisfiedRequirements / totalRequirements) * 100),
    warningCount: validation.warnings.length,
  };
}
