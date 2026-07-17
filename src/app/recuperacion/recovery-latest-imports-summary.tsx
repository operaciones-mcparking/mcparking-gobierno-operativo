import { CalendarClock, FileText } from "lucide-react";

import { ValueBadge } from "@/components/dashboard/badge";
import type {
  RecoveryLatestImportSummaryItem,
  RecoveryLatestImportsSummary,
} from "@/lib/dashboard/data";

type RecoveryLatestImportsSummaryProps = {
  error?: string | null;
  summary: RecoveryLatestImportsSummary | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CL", {
    currency: "CLP",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}

function shortBatchId(value: string) {
  return value.slice(0, 8);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-[#edf2f6] py-2 first:border-t-0 first:pt-0">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <span className="max-w-[62%] text-right text-sm font-medium text-navy">{value}</span>
    </div>
  );
}

function LatestImportCard({
  importItem,
  title,
  type,
}: {
  importItem: RecoveryLatestImportSummaryItem | null;
  title: string;
  type: "carts" | "purchases";
}) {
  return (
    <article className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d6e1ea] bg-white text-sea">
          <FileText className="h-4 w-4" />
        </span>
        <ValueBadge tone={importItem ? "success" : "neutral"}>
          {importItem ? importItem.status : "Sin carga"}
        </ValueBadge>
      </div>
      <h3 className="mt-4 text-sm font-medium tracking-tight text-navy">{title}</h3>

      {!importItem ? (
        <p className="mt-3 rounded-lg border border-[#d6e1ea] bg-white px-3 py-3 text-sm leading-5 text-slate-600">
          No hay cargas importadas todavia para este tipo.
        </p>
      ) : (
        <div className="mt-4">
          <DetailRow label="Archivo" value={importItem.file_name} />
          <DetailRow label="Fecha" value={formatDate(importItem.confirmed_at ?? importItem.created_at)} />
          <DetailRow label="Filas" value={formatNumber(importItem.rows_total)} />
          {type === "purchases" ? (
            <>
              <DetailRow label="Compras validas" value={formatNumber(importItem.valid_purchase_rows)} />
              <DetailRow label="Monto valido" value={formatCurrency(importItem.valid_purchase_amount)} />
            </>
          ) : null}
          <DetailRow label="Estado" value={importItem.status} />
          <DetailRow label="Batch" value={shortBatchId(importItem.id)} />
        </div>
      )}
    </article>
  );
}

export function RecoveryLatestImportsSummary({ error, summary }: RecoveryLatestImportsSummaryProps) {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">Ultima carga</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Ultimos batches importados al staging de recuperacion, sin datos personales ni payloads.
          </p>
        </div>
        <ValueBadge tone="info">
          <CalendarClock className="mr-1 h-3.5 w-3.5" />
          Staging
        </ValueBadge>
      </div>

      {error ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
            No se pudo cargar la ultima carga: {error}
          </p>
        </div>
      ) : null}

      {!error ? (
        <div className="grid gap-3 p-5 lg:grid-cols-2">
          <LatestImportCard
            importItem={summary?.purchases ?? null}
            title="Ultima carga de compras"
            type="purchases"
          />
          <LatestImportCard
            importItem={summary?.carts ?? null}
            title="Ultima carga de carritos"
            type="carts"
          />
        </div>
      ) : null}
    </section>
  );
}
