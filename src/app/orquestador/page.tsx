export const dynamic = "force-dynamic";

import { DashboardShell } from "@/components/dashboard/shell";
import { requireAdminAccess } from "@/lib/auth/admin";
import { OrchestratorControlCenter } from "./orchestrator-control-center";
import { CustomerWindowView } from "./customer-window-view";
import { OrchestratorDashboardView } from "./orchestrator-dashboard-view";
import { OrchestratorViewTabs, type OrchestratorView } from "./orchestrator-view-tabs";

type OrquestadorPageProps = {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
};

function resolveView(value?: string | string[]): OrchestratorView {
  const requestedView = Array.isArray(value) ? value[0] : value;

  if (requestedView === "control" || requestedView === "customer-window") return requestedView;
  return "dashboard";
}

export default async function OrquestadorPage({ searchParams }: OrquestadorPageProps) {
  await requireAdminAccess();
  const resolvedSearchParams = await searchParams;
  const activeView = resolveView(resolvedSearchParams?.view);

  return (
    <DashboardShell
      activePath="/orquestador"
      description="Monitoreo operacional y control de procesos."
      eyebrow="Operaciones McParking"
      title="McParking Dashboard"
    >
      <OrchestratorViewTabs activeView={activeView} />
      {activeView === "control" ? <OrchestratorControlCenter /> : null}
      {activeView === "customer-window" ? <CustomerWindowView /> : null}
      {activeView === "dashboard" ? <OrchestratorDashboardView /> : null}
    </DashboardShell>
  );
}
