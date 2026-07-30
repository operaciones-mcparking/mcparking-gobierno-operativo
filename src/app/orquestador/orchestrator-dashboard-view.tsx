import { normalizeOperationalDashboardRpcResult, type OperationalDashboardQuery } from "@/lib/dashboard/operacional";
import { getOperationalDashboardRpcData } from "@/lib/orquestador/supabase-admin";
import { DashboardOperacionalClient } from "../dashboard-operacional/dashboard-operacional-client";

async function loadDashboard() {
  const query: OperationalDashboardQuery = {
    date: null,
    from: null,
    parking_codigo: null,
    sistema_grupo: null,
    source_run_id: null,
    to: null,
  };

  const result = await getOperationalDashboardRpcData(query);
  if (result.error) {
    return { dashboard: null, error: "No fue posible consultar el dashboard operacional." };
  }

  const dashboard = normalizeOperationalDashboardRpcResult(result.data);
  if (!dashboard) {
    return { dashboard: null, error: "No fue posible consultar el dashboard operacional." };
  }

  return { dashboard, error: null };
}

export async function OrchestratorDashboardView() {
  const { dashboard, error } = await loadDashboard();

  return <DashboardOperacionalClient initialDashboard={dashboard} initialError={error} />;
}