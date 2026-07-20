import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import type { RecoveryImportHistoryItem } from "@/lib/dashboard/data";

const RECOVERY_TIME_ZONE = "America/Santiago";

type RecoveryImportHistoryProps = {
  error?: string | null;
  imports: RecoveryImportHistoryItem[];
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}

function formatCurrency(value: number) {
  return `$${formatNumber(value)}`;
}

function formatDateParts(value: string | null) {
  if (!value) {
    return {
      date: "Pendiente",
      time: null,
    };
  }

  const date = new Date(value);

  return {
    date: new Intl.DateTimeFormat("es-CL", {
      day: "2-digit",
      month: "2-digit",
      timeZone: RECOVERY_TIME_ZONE,
      year: "2-digit",
    }).format(date),
    time: new Intl.DateTimeFormat("es-CL", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: RECOVERY_TIME_ZONE,
    }).format(date),
  };
}

function statusTone(status: string): BadgeTone {
  if (status === "imported") return "success";
  if (status === "importing") return "warning";
  if (status === "failed") return "danger";
  if (status === "discarded") return "neutral";

  return "info";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    discarded: "Descartado",
    failed: "Fallido",
    imported: "Importado",
    importing: "Importando",
    validated: "Validado",
  };

  return labels[status] ?? status;
}

function importTypeLabel(importType: string) {
  const labels: Record<string, string> = {
    incomplete_bookings_csv: "Carritos perdidos",
    purchases_csv: "Compras",
  };

  return labels[importType] ?? importType;
}

function importTypeTone(importType: string): BadgeTone {
  if (importType === "incomplete_bookings_csv") return "warning";
  if (importType === "purchases_csv") return "success";

  return "neutral";
}

function shortBatchId(id: string) {
  return id.slice(0, 8);
}

export function RecoveryImportHistory({ error, imports }: RecoveryImportHistoryProps) {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">Historial de importaciones</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            Batches importados al staging de recuperación.
          </p>
        </div>
        <ValueBadge tone="info">Solo agregados</ValueBadge>
      </div>

      {error ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
            No se pudo cargar el historial de importaciones: {error}
          </p>
        </div>
      ) : null}

      {!error && imports.length === 0 ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
            No hay importaciones registradas todavía.
          </p>
        </div>
      ) : null}

      {!error && imports.length > 0 ? (
        <div className="overflow-x-auto px-5 py-5">
          <table className="min-w-[960px] w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-[#d6e1ea] text-sm">
            <thead className="bg-[#f8fafb] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="min-w-[96px] border-b border-[#d6e1ea] px-3 py-3">Fecha</th>
                <th className="border-b border-[#d6e1ea] px-3 py-3">Tipo</th>
                <th className="border-b border-[#d6e1ea] px-3 py-3">Archivo</th>
                <th className="border-b border-[#d6e1ea] px-3 py-3">Estado</th>
                <th className="border-b border-[#d6e1ea] px-3 py-3">Filas archivo</th>
                <th className="border-b border-[#d6e1ea] px-3 py-3">Filas importadas</th>
                <th className="border-b border-[#d6e1ea] px-3 py-3">Compras válidas</th>
                <th className="border-b border-[#d6e1ea] px-3 py-3">Monto válido</th>
                <th className="min-w-[96px] border-b border-[#d6e1ea] px-3 py-3">Confirmado</th>
                <th className="border-b border-[#d6e1ea] px-3 py-3">Batch</th>
              </tr>
            </thead>
            <tbody>
              {imports.map((item) => {
                const createdAt = formatDateParts(item.created_at);
                const confirmedAt = formatDateParts(item.confirmed_at);

                return (
                  <tr className="bg-white odd:bg-[#fbfdfe]" key={item.id}>
                    <td className="min-w-[96px] border-b border-[#edf2f6] px-3 py-3 text-slate-700">
                      <div className="whitespace-nowrap text-sm">{createdAt.date}</div>
                      {createdAt.time ? (
                        <div className="whitespace-nowrap text-xs leading-5 text-slate-500">{createdAt.time}</div>
                      ) : null}
                    </td>
                  <td className="border-b border-[#edf2f6] px-3 py-3">
                    <ValueBadge tone={importTypeTone(item.import_type)}>{importTypeLabel(item.import_type)}</ValueBadge>
                  </td>
                  <td className="border-b border-[#edf2f6] px-3 py-3 font-medium text-navy">
                    {item.file_name}
                    {item.import_type === "incomplete_bookings_csv" ? (
                      <p className="mt-1 text-xs font-normal text-slate-500">Carga de carritos perdidos</p>
                    ) : null}
                  </td>
                  <td className="border-b border-[#edf2f6] px-3 py-3">
                    <ValueBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</ValueBadge>
                  </td>
                  <td className="border-b border-[#edf2f6] px-3 py-3 text-slate-700">
                    {formatNumber(item.rows_total)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-3 py-3 text-slate-700">
                    {formatNumber(item.imported_rows)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-3 py-3 text-slate-700">
                    {item.import_type === "purchases_csv" ? formatNumber(item.valid_purchase_rows) : "—"}
                  </td>
                  <td className="border-b border-[#edf2f6] px-3 py-3 font-medium text-navy">
                    {item.import_type === "purchases_csv" ? formatCurrency(item.valid_purchase_amount) : "—"}
                  </td>
                    <td className="min-w-[96px] border-b border-[#edf2f6] px-3 py-3 text-slate-700">
                      <div className="whitespace-nowrap text-sm">{confirmedAt.date}</div>
                      {confirmedAt.time ? (
                        <div className="whitespace-nowrap text-xs leading-5 text-slate-500">{confirmedAt.time}</div>
                      ) : null}
                    </td>
                  <td className="border-b border-[#edf2f6] px-3 py-3 font-mono text-xs text-slate-600">
                    {shortBatchId(item.id)}
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
