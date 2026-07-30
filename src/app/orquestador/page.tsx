export const dynamic = "force-dynamic";

import { DashboardShell } from "@/components/dashboard/shell";
import { requireAdminAccess } from "@/lib/auth/admin";
import { OrchestratorControlCenter } from "./orchestrator-control-center";
import { OrchestratorDashboardView } from "./orchestrator-dashboard-view";
import { OrchestratorViewTabs, type OrchestratorView } from "./orchestrator-view-tabs";

type OrquestadorPageProps = {
  searchParams?: {
    view?: string | string[];
  };
};

function resolveView(value?: string | string[]): OrchestratorView {
  const requestedView = Array.isArray(value) ? value[0] : value;

  return requestedView === "control" ? "control" : "dashboard";
}

export default async function OrquestadorPage({ searchParams }: OrquestadorPageProps) {
  await requireAdminAccess();
  const activeView = resolveView(searchParams?.view);

  return (
    <DashboardShell
      activePath="/orquestador"
      description="Dashboard operacional y centro de control seguro del orquestador existente."
      eyebrow="Operaciones McParking"
      title="McParking Orquestador"
    >
      <OrchestratorViewTabs activeView={activeView} />
      {activeView === "control" ? <OrchestratorControlCenter /> : <OrchestratorDashboardView />}
    </DashboardShell>
  );
}