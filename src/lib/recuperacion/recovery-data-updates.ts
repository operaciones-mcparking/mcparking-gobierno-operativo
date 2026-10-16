import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type RecoveryDataUpdateStatus = {
  description: string;
  lastObservedAt: string | null;
  name: string;
  schedule: string;
  workflowUrl: string;
};

type RecoveryImportBatchRow = {
  confirmed_at: string | null;
  created_at: string;
  import_type: string;
};

type RecoveryDataUpdateDefinition = Omit<RecoveryDataUpdateStatus, "lastObservedAt" | "workflowUrl"> & {
  importType: string | null;
  workflowId: string;
};

const N8N_WORKFLOW_BASE_URL = "https://n8n.mcparking.cl/workflow";

// The targeted attribution RPC remains server-side documentation, not a workflow row or browser action.
export const RECOVERY_TARGETED_ATTRIBUTION_RPC =
  "public.refresh_recovery_cart_recovery_status_v2_for_purchases(uuid[])";

// Fixed server-side allowlist. No workflow ID or query comes from the client.
export const RECOVERY_DATA_UPDATE_DEFINITIONS: readonly RecoveryDataUpdateDefinition[] = [
  {
    description: "Importa compras nuevas y actualiza sus atribuciones.",
    importType: null,
    name: "Importar compras",
    schedule: "Cada 15 minutos",
    workflowId: "16OMJ9MvjhyWEeWB",
  },
  {
    description: "Revisa cambios de estado, pago y monto.",
    importType: null,
    name: "Reconciliar compras",
    schedule: "Cada 15 minutos",
    workflowId: "fi2Q8oXQL0Y7hwY0",
  },
  {
    description: "Sincroniza carritos nuevos o modificados.",
    importType: "incomplete_bookings_v2_incremental",
    name: "Sincronizar carritos",
    schedule: "Cada 5 minutos",
    workflowId: "f9ExZ4etVzMixUru",
  },
  {
    description: "Revisa cambios de los últimos 10 días.",
    importType: "incomplete_bookings_v2_recent_reconcile",
    name: "Reconciliar carritos recientes",
    schedule: "Diario a las 03:30 (Chile)",
    workflowId: "wJy3N0v5qUtZKecj",
  },
] as const;

function toStatus(
  definition: RecoveryDataUpdateDefinition,
  batch?: RecoveryImportBatchRow,
): RecoveryDataUpdateStatus {
  return {
    description: definition.description,
    lastObservedAt: batch ? batch.confirmed_at ?? batch.created_at : null,
    name: definition.name,
    schedule: definition.schedule,
    workflowUrl: `${N8N_WORKFLOW_BASE_URL}/${definition.workflowId}`,
  };
}

export async function getRecoveryDataUpdateStatuses(): Promise<RecoveryDataUpdateStatus[]> {
  const importTypes = RECOVERY_DATA_UPDATE_DEFINITIONS.flatMap((definition) =>
    definition.importType ? [definition.importType] : [],
  );

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("recovery_import_batches")
      .select("import_type,created_at,confirmed_at")
      .in("import_type", importTypes)
      .eq("status", "imported")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return RECOVERY_DATA_UPDATE_DEFINITIONS.map((definition) => toStatus(definition));
    }

    const latestByType = new Map<string, RecoveryImportBatchRow>();
    for (const batch of (data ?? []) as RecoveryImportBatchRow[]) {
      if (!latestByType.has(batch.import_type)) {
        latestByType.set(batch.import_type, batch);
      }
    }

    return RECOVERY_DATA_UPDATE_DEFINITIONS.map((definition) =>
      toStatus(definition, definition.importType ? latestByType.get(definition.importType) : undefined),
    );
  } catch {
    return RECOVERY_DATA_UPDATE_DEFINITIONS.map((definition) => toStatus(definition));
  }
}
