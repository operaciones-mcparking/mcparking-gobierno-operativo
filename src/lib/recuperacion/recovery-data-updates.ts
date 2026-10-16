import "server-only";

import { unstable_cache } from "next/cache";

export type RecoveryDataUpdateStatus = {
  description: string;
  lastObservedAt: string | null;
  name: string;
  schedule: string;
  workflowUrl: string;
};

type N8nExecution = {
  finished?: boolean;
  startedAt?: string;
  status?: string;
};

type RecoveryDataUpdateDefinition = Omit<RecoveryDataUpdateStatus, "lastObservedAt" | "workflowUrl"> & {
  workflowId: string;
};

const N8N_WORKFLOW_BASE_URL = "https://n8n.mcparking.cl/workflow";
const N8N_EXECUTIONS_API_URL = "https://n8n.mcparking.cl/api/v1/executions";
const N8N_EXECUTIONS_TIMEOUT_MS = 2500;

// The targeted attribution RPC remains server-side documentation, not a workflow row or browser action.
export const RECOVERY_TARGETED_ATTRIBUTION_RPC =
  "public.refresh_recovery_cart_recovery_status_v2_for_purchases(uuid[])";

// Fixed server-side allowlist. No workflow ID or query comes from the client.
export const RECOVERY_DATA_UPDATE_DEFINITIONS: readonly RecoveryDataUpdateDefinition[] = [
  {
    description: "Importa compras nuevas y actualiza sus atribuciones.",
    name: "Importar compras",
    schedule: "Cada 15 minutos",
    workflowId: "16OMJ9MvjhyWEeWB",
  },
  {
    description: "Revisa cambios de estado, pago y monto.",
    name: "Reconciliar compras",
    schedule: "Cada 15 minutos",
    workflowId: "fi2Q8oXQL0Y7hwY0",
  },
  {
    description: "Sincroniza carritos nuevos o modificados.",
    name: "Sincronizar carritos",
    schedule: "Cada 5 minutos",
    workflowId: "f9ExZ4etVzMixUru",
  },
  {
    description: "Revisa cambios de los últimos 10 días.",
    name: "Reconciliar carritos recientes",
    schedule: "Diario a las 03:30 (Chile)",
    workflowId: "wJy3N0v5qUtZKecj",
  },
] as const;

function toStatus(
  definition: RecoveryDataUpdateDefinition,
  lastObservedAt: string | null,
): RecoveryDataUpdateStatus {
  return {
    description: definition.description,
    lastObservedAt,
    name: definition.name,
    schedule: definition.schedule,
    workflowUrl: `${N8N_WORKFLOW_BASE_URL}/${definition.workflowId}`,
  };
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

async function getLatestSuccessfulExecution(workflowId: string, apiKey: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), N8N_EXECUTIONS_TIMEOUT_MS);

  try {
    const query = new URLSearchParams({ includeData: "false", limit: "1", status: "success", workflowId });
    const response = await fetch(`${N8N_EXECUTIONS_API_URL}?${query}`, {
      cache: "no-store",
      headers: { "X-N8N-API-KEY": apiKey },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const payload = await response.json() as { data?: N8nExecution[] };
    const execution = payload.data?.[0];

    return execution?.status === "success" && execution.finished !== false && isValidDate(execution.startedAt)
      ? execution.startedAt
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const getCachedLatestSuccessfulExecutions = unstable_cache(
  async (): Promise<Array<string | null>> => {
    const apiKey = process.env.N8N_API_KEY?.trim();
    if (!apiKey) return RECOVERY_DATA_UPDATE_DEFINITIONS.map(() => null);

    return Promise.all(
      RECOVERY_DATA_UPDATE_DEFINITIONS.map((definition) =>
        getLatestSuccessfulExecution(definition.workflowId, apiKey),
      ),
    );
  },
  ["recovery-data-update-last-successful-executions-v1"],
  { revalidate: 60 },
);

export async function getRecoveryDataUpdateStatuses(): Promise<RecoveryDataUpdateStatus[]> {
  const lastExecutions = await getCachedLatestSuccessfulExecutions();

  return RECOVERY_DATA_UPDATE_DEFINITIONS.map((definition, index) =>
    toStatus(definition, lastExecutions[index] ?? null),
  );
}
