import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard/shell";
import { requireAdminAccess } from "@/lib/auth/admin";
import {
  getRecoveryCartAuditRows,
  getRecoveryImportHistory,
  getRecoveryLatestImportsSummary,
} from "@/lib/dashboard/data";
import { IncompleteBookingsUploadMock } from "./incomplete-bookings-upload-mock";
import { MessageMemoryUploadCard } from "./message-memory-upload-card";
import { PurchasesUploadMock } from "./purchases-upload-mock";
import { RecoveryAdminDataAccordion } from "./recovery-admin-data-accordion";
import { RecoveryCartAuditTable } from "./recovery-cart-audit-table";
import { RecoveryImportHistory } from "./recovery-import-history";
import { RecoveryLatestImportsSummary } from "./recovery-latest-imports-summary";
import { RecoveryLoadingCard } from "./recovery-loading-card";
import { TrackingUploadCard } from "./tracking-upload-card";

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

async function RecoveryLatestImportsBlock() {
  const startedAt = Date.now();
  const { data: latestImportsSummary, error: latestImportsSummaryError } = await getRecoveryLatestImportsSummary();
  logRecoveryTiming("getRecoveryLatestImportsSummary", startedAt);

  return <RecoveryLatestImportsSummary error={latestImportsSummaryError?.message ?? null} summary={latestImportsSummary} />;
}

async function RecoveryImportHistoryBlock() {
  const startedAt = Date.now();
  const { data: importHistory, error: importHistoryError } = await getRecoveryImportHistory();
  logRecoveryTiming("getRecoveryImportHistory", startedAt);

  return <RecoveryImportHistory error={importHistoryError?.message ?? null} imports={importHistory} />;
}

export default async function RecuperacionPage() {
  const authStartedAt = Date.now();
  await requireAdminAccess();
  logRecoveryTiming("requireAdminAccess", authStartedAt);

  return (
    <DashboardShell
      activePath="/recuperacion"
      description="Seguimiento de WhatsApp, respuestas de clientes y compras posteriores."
      eyebrow="Recuperacion"
      title="Recuperacion de carritos"
    >
      <Suspense fallback={<RecoveryLoadingCard label="Cargando seguimiento y auditoria..." />}>
        <RecoveryCartAuditBlock />
      </Suspense>

      <RecoveryAdminDataAccordion>
        <Suspense fallback={<RecoveryCompactLoading label="Cargando ultima carga..." />}>
          <RecoveryLatestImportsBlock />
        </Suspense>

        <PurchasesUploadMock />
        <IncompleteBookingsUploadMock />
        <TrackingUploadCard />
        <MessageMemoryUploadCard />

        <Suspense fallback={<RecoveryCompactLoading label="Cargando historial de importaciones..." />}>
          <RecoveryImportHistoryBlock />
        </Suspense>
      </RecoveryAdminDataAccordion>
    </DashboardShell>
  );
}
