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
import { RecoveryCartAuditTable } from "./recovery-cart-audit-table";
import { RecoveryImportHistory } from "./recovery-import-history";
import { RecoveryLatestImportsSummary } from "./recovery-latest-imports-summary";
import { TrackingUploadCard } from "./tracking-upload-card";

export default async function RecuperacionPage() {
  await requireAdminAccess();

  const [
    { data: importHistory, error: importHistoryError },
    { data: latestImportsSummary, error: latestImportsSummaryError },
    { data: cartAuditRows, error: cartAuditRowsError },
  ] = await Promise.all([
    getRecoveryImportHistory(),
    getRecoveryLatestImportsSummary(),
    getRecoveryCartAuditRows(),
  ]);

  return (
    <DashboardShell
      activePath="/recuperacion"
      description="Seguimiento de WhatsApp, respuestas de clientes y compras posteriores."
      eyebrow="Recuperación"
      title="Recuperación de carritos"
    >

      <RecoveryCartAuditTable
        error={cartAuditRowsError?.message ?? null}
        rows={cartAuditRows}
      />
      <RecoveryLatestImportsSummary
        error={latestImportsSummaryError?.message ?? null}
        summary={latestImportsSummary}
      />
      <PurchasesUploadMock />
      <IncompleteBookingsUploadMock />
      <TrackingUploadCard />
      <MessageMemoryUploadCard />
      <RecoveryImportHistory
        error={importHistoryError?.message ?? null}
        imports={importHistory}
      />
    </DashboardShell>
  );
}