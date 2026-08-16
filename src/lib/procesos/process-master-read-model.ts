import "server-only";

import { mapProcessMasterDto } from "@/app/procesos/process-master/process-master-mapper";
import type { ProcessMasterDto } from "@/app/procesos/process-master/process-master-types";
import { getProcessCatalogV2Item, getProcessMatrixV2 } from "@/lib/dashboard/data";
import { getProcessMetricsForMaster, getProcessRisksForMaster } from "@/lib/procesos/process-master-relations";
import { getProcessRoleProfilesForMaster } from "@/lib/procesos/process-role-profiles";

export type ProcessMasterReadModelResult = {
  data: ProcessMasterDto | null;
  error: Error | null;
};

function asError(value: unknown) {
  return value instanceof Error ? value : value ? new Error("No se pudo cargar la ficha del proceso.") : null;
}

export async function getProcessMasterReadModel(processId: string): Promise<ProcessMasterReadModelResult> {
  const [processResult, matrixResult] = await Promise.all([
    getProcessCatalogV2Item(processId),
    getProcessMatrixV2(processId),
  ]);

  if (!processResult.data) {
    return { data: null, error: asError(processResult.error) };
  }

  const process = mapProcessMasterDto({
    process: processResult.data,
    stages: matrixResult.data,
  });
  const [roleProfilesResult, metricsResult, risksResult] = await Promise.all([
    getProcessRoleProfilesForMaster({ processId: processResult.data.process_id }),
    getProcessMetricsForMaster(processResult.data.process_id),
    getProcessRisksForMaster(processResult.data.process_id),
  ]);

  process.roleProfiles = roleProfilesResult.data;
  process.metrics = metricsResult.data;
  process.risks = risksResult.data;

  return {
    data: process,
    error:
      asError(processResult.error) ??
      asError(matrixResult.error) ??
      asError(roleProfilesResult.error) ??
      asError(metricsResult.error) ??
      asError(risksResult.error),
  };
}