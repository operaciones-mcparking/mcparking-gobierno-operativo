import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { requireAdminAccess } from "@/lib/auth/admin";
import { getRecoveryDataUpdateStatuses } from "@/lib/recuperacion/recovery-data-updates";
import { getRecoveryCartAuditRows } from "@/lib/dashboard/data";
import { RecoveryCartAuditTable } from "./recovery-cart-audit-table";
import { RecoveryLoadingCard } from "./recovery-loading-card";
import { RecoveryConversationSessions } from "./recovery-conversation-sessions";
import { RecoveryDataUpdateAccordion } from "./recovery-data-update-accordion";
import { RecoveryViewTabs, type RecoveryView } from "./recovery-view-tabs";

type RecuperacionPageProps = {
  searchParams?: Promise<{
    view?: string | string[];
  }>;
};

function resolveView(value?: string | string[]): RecoveryView {
  const requestedView = Array.isArray(value) ? value[0] : value;

  return requestedView === "conversaciones" ? "conversaciones" : "carritos";
}

function logRecoveryTiming(label: string, startedAt: number) {
  console.info(`[recuperacion] ${label}: ${Date.now() - startedAt}ms`);
}

function RecoveryCompactLoading({ label }: { label: string }) {
  return (
    <section className="mt-5 rounded-xl border border-[#d6e1ea] bg-white px-5 py-4 shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[#d6e1ea] border-t-sea" />
        <span>{label}</span>
      </div>
    </section>
  );
}

async function RecoveryCartAuditBlock() {
  const startedAt = Date.now();
  const { data: cartAuditRows, error: cartAuditRowsError } = await getRecoveryCartAuditRows();
  logRecoveryTiming("getRecoveryCartAuditRows", startedAt);

  return <RecoveryCartAuditTable error={cartAuditRowsError?.message ?? null} rows={cartAuditRows} />;
}

async function RecoveryDataUpdateBlock() {
  const processes = await getRecoveryDataUpdateStatuses();

  return <RecoveryDataUpdateAccordion processes={processes} />;
}

export default async function RecuperacionPage({ searchParams }: RecuperacionPageProps) {
  const authStartedAt = Date.now();
  await requireAdminAccess();
  logRecoveryTiming("requireAdminAccess", authStartedAt);
  const resolvedSearchParams = await searchParams;
  const activeView = resolveView(resolvedSearchParams?.view);

  return (
    <DashboardShell
      activePath="/recuperacion"
      description="Seguimiento de WhatsApp, respuestas de clientes y compras posteriores."
      eyebrow="Recuperacion"
      title="Recuperacion de carritos"
    >
      <RecoveryViewTabs activeView={activeView} />

      {activeView === "conversaciones" ? (
        <RecoveryConversationSessions />
      ) : (
        <>
          <Suspense fallback={<RecoveryLoadingCard label="Cargando seguimiento y auditoria..." />}>
            <RecoveryCartAuditBlock />
          </Suspense>

          <Suspense fallback={<RecoveryCompactLoading label="Cargando estado de sincronizaciones..." />}>
            <RecoveryDataUpdateBlock />
          </Suspense>

        </>
      )}
    </DashboardShell>
  );
}
