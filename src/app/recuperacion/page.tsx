import {
  getRecoveryCartAuditRows,
  getRecoveryAttributionDashboardData,
  getRecoveryImportHistory,
  getRecoveryLatestImportsSummary,
} from "@/lib/dashboard/data";
import { IncompleteBookingsUploadMock } from "./incomplete-bookings-upload-mock";
import { MessageMemoryUploadCard } from "./message-memory-upload-card";
import { PurchasesUploadMock } from "./purchases-upload-mock";
import { RecoveryAttributionBreakdown } from "./recovery-attribution-breakdown";
import { RecoveryCartAuditTable } from "./recovery-cart-audit-table";
import { RecoveryImportHistory } from "./recovery-import-history";
import { RecoveryLatestImportsSummary } from "./recovery-latest-imports-summary";
import { TrackingUploadCard } from "./tracking-upload-card";

export default async function RecuperacionPage() {
  const [
    { data: importHistory, error: importHistoryError },
    { data: attributionDashboard, error: attributionDashboardError },
    { data: latestImportsSummary, error: latestImportsSummaryError },
    { data: cartAuditRows, error: cartAuditRowsError },
  ] = await Promise.all([
    getRecoveryImportHistory(),
    getRecoveryAttributionDashboardData(),
    getRecoveryLatestImportsSummary(),
    getRecoveryCartAuditRows(),
  ]);

  return (
    <main className="min-h-screen bg-[#f6f8fa] text-ink">
      <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <header className="border-b border-[#cbd8e3] pb-5">
          <div className="border-l-4 border-clay px-5 py-1 sm:px-6">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <h1 className="text-2xl font-medium leading-tight tracking-tight text-navy sm:text-[1.9rem]">
                  Recuperación de carritos
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  Seguimiento de WhatsApp, respuestas de clientes y compras posteriores.
                </p>
              </div>
            </div>
          </div>
        </header>

        <RecoveryAttributionBreakdown
          breakdown={attributionDashboard?.breakdown ?? null}
          error={attributionDashboardError?.message ?? null}
        />

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
      </div>
    </main>
  );
}
