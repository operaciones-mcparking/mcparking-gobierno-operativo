import { CalendarClock, FileText } from "lucide-react";

import { ValueBadge } from "@/components/dashboard/badge";
import type {
  RecoveryLatestImportSummaryItem,
  RecoveryLatestImportsSummary,
} from "@/lib/dashboard/data";

const RECOVERY_TIME_ZONE = "America/Santiago";

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
    timeZone: RECOVERY_TIME_ZONE,
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

function OptionalDetailRow({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;

  return <DetailRow label={label} value={formatNumber(value)} />;
}

function TrackingStatusRows({ counts }: { counts: Record<string, number> | null }) {
  if (!counts) return null;

  return (
    <>
      <OptionalDetailRow label="Leidos" value={counts.read ?? null} />
      <OptionalDetailRow label="Entregados" value={counts.delivered ?? null} />
      <OptionalDetailRow label="Enviados" value={counts.sent ?? null} />
      <OptionalDetailRow label="Fallidos" value={counts.failed ?? null} />
      <OptionalDetailRow label="Unknown" value={counts.unknown ?? null} />
    </>
  );
}

function LatestImportCard({
  importItem,
  title,
  type,
}: {
  importItem: RecoveryLatestImportSummaryItem | null;
  title: string;
  type: "carts" | "memory" | "purchases" | "tracking";
}) {
  const hasPersistedResult = importItem
    ? [
        importItem.skipped_duplicate_rows,
        importItem.conflict_rows,
        importItem.invalid_rows,
        importItem.inserted_amount,
        importItem.source_duplicate_rows,
        importItem.booking_duplicate_rows,
        importItem.message_duplicate_rows,
        importItem.inserted_abandoned_rows,
        importItem.inserted_canceled_rows,
        importItem.message_sent_rows,
        importItem.tracking_status_counts,
      ].some((value) => value !== null)
    : false;

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
          <DetailRow label="Filas archivo" value={formatNumber(importItem.rows_total)} />
          <DetailRow label="Filas insertadas" value={formatNumber(importItem.insertedRows)} />
          {type === "purchases" ? (
            <>
              <DetailRow label="Compras validas" value={formatNumber(importItem.valid_purchase_rows)} />
              <DetailRow label="Monto valido" value={formatCurrency(importItem.valid_purchase_amount)} />
              {importItem.inserted_amount !== null ? (
                <DetailRow label="Monto insertado" value={formatCurrency(importItem.inserted_amount)} />
              ) : null}
            </>
          ) : null}
          <OptionalDetailRow label="Duplicadas omitidas" value={importItem.skipped_duplicate_rows} />
          <OptionalDetailRow label="Conflictos" value={importItem.conflict_rows} />
          <OptionalDetailRow label="Invalidas" value={importItem.invalid_rows} />
          {type === "carts" ? (
            <>
              <OptionalDetailRow label="Duplicadas source" value={importItem.source_duplicate_rows} />
              <OptionalDetailRow label="Duplicadas booking" value={importItem.booking_duplicate_rows} />
              <OptionalDetailRow label="Duplicadas mensaje" value={importItem.message_duplicate_rows} />
              <OptionalDetailRow label="Abandoned insertados" value={importItem.inserted_abandoned_rows} />
              <OptionalDetailRow label="Canceled insertados" value={importItem.inserted_canceled_rows} />
              <OptionalDetailRow label="Con mensaje enviado" value={importItem.message_sent_rows} />
            </>
          ) : null}
          {type === "tracking" ? (
            <>
              <OptionalDetailRow label="Duplicadas source" value={importItem.source_duplicate_rows} />
              <OptionalDetailRow label="Duplicadas mensaje" value={importItem.message_duplicate_rows} />
              <OptionalDetailRow label="Con mensaje enviado" value={importItem.message_sent_rows} />
              <TrackingStatusRows counts={importItem.tracking_status_counts} />
            </>
          ) : null}
          <DetailRow label="Estado" value={importItem.status} />
          <DetailRow label="Batch" value={shortBatchId(importItem.id)} />
          {!hasPersistedResult ? (
            <p className="mt-3 rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-xs leading-5 text-slate-500">
              Duplicadas y conflictos se mostraran cuando queden persistidos en el resultado de importacion.
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}

function MessageMemoryLatestImportCard({
  metadata,
  raw,
}: {
  metadata: RecoveryLatestImportSummaryItem | null;
  raw: RecoveryLatestImportSummaryItem | null;
}) {
  const hasAnyImport = Boolean(metadata || raw);

  return (
    <article className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d6e1ea] bg-white text-sea">
          <FileText className="h-4 w-4" />
        </span>
        <ValueBadge tone={hasAnyImport ? "success" : "neutral"}>
          {hasAnyImport ? "imported" : "Sin carga"}
        </ValueBadge>
      </div>
      <h3 className="mt-4 text-sm font-medium tracking-tight text-navy">Ultima carga de Message Memory</h3>

      {!hasAnyImport ? (
        <p className="mt-3 rounded-lg border border-[#d6e1ea] bg-white px-3 py-3 text-sm leading-5 text-slate-600">
          No hay cargas importadas todavia para este tipo.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          <MessageMemoryStageRows item={metadata} rowsLabel="Filas insertadas" title="Metadata segura" />
          <MessageMemoryStageRows item={raw} rowsLabel="Mensajes insertados" title="Chat real admin-only" />
          <p className="rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-xs leading-5 text-slate-500">
            El texto real solo se usa para Ver chat. No se muestra en reportes ni exportaciones.
          </p>
        </div>
      )}
    </article>
  );
}

function MessageMemoryStageRows({
  item,
  rowsLabel,
  title,
}: {
  item: RecoveryLatestImportSummaryItem | null;
  rowsLabel: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-[#edf2f6] bg-white px-3 py-3">
      <h4 className="mb-2 text-sm font-medium text-navy">{title}</h4>
      {!item ? (
        <p className="text-sm text-slate-600">Sin carga importada.</p>
      ) : (
        <>
          <DetailRow label="Archivo" value={item.file_name} />
          <DetailRow label="Fecha" value={formatDate(item.confirmed_at ?? item.created_at)} />
          <DetailRow label="Filas archivo" value={formatNumber(item.rows_total)} />
          <DetailRow label={rowsLabel} value={formatNumber(item.insertedRows)} />
          <OptionalDetailRow label="Duplicadas omitidas" value={item.skipped_duplicate_rows} />
          <OptionalDetailRow label="Conflictos" value={item.conflict_rows} />
          <OptionalDetailRow label="Invalidas" value={item.invalid_rows} />
          <DetailRow label="Estado" value={item.status} />
          <DetailRow label="Batch" value={shortBatchId(item.id)} />
        </>
      )}
    </div>
  );
}

export function RecoveryLatestImportsSummary({ error, summary }: RecoveryLatestImportsSummaryProps) {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">Ultima carga</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Ultimos batches importados al staging de recuperacion. No se muestran mensajes, telefonos, payloads ni
            datos sensibles en este resumen.
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
        <div className="grid gap-3 p-5 xl:grid-cols-2">
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
          <LatestImportCard
            importItem={summary?.tracking ?? null}
            title="Ultima carga de Seguimiento WhatsApp"
            type="tracking"
          />
          <MessageMemoryLatestImportCard
            metadata={summary?.messageMemory.metadata ?? null}
            raw={summary?.messageMemory.raw ?? null}
          />
        </div>
      ) : null}
    </section>
  );
}
