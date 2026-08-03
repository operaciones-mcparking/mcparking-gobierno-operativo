"use client";

import { AlertCircle, CheckCircle2, ChevronRight, X } from "lucide-react";

const RECOVERY_TIME_ZONE = "America/Santiago";

type SnapshotSummary = {
  idShort: string | null;
  recoveredAmount: number;
  recoveredConfirmed: number;
  recoveryRate: number;
  snapshotAt: string;
};

export type RecoverySnapshotComparison = {
  available: boolean;
  reason: "ok" | "missing_current" | "missing_previous" | "no_changes";
  weekStart: string;
  weekEnd: string;
  calculationVersion: "v1-intended-arrival";
  previousSnapshot: SnapshotSummary | null;
  currentSnapshot: SnapshotSummary | null;
  delta: {
    recoveryRatePoints: number;
    recoveredConfirmed: number;
    recoveredAmount: number;
    cartsChanged: number;
  } | null;
  counts: {
    totalRows: number;
    unchanged: number;
    statusChanged: number;
    purchaseChanged: number;
    amountChanged: number;
    purchaseDataChanged: number;
    added: number;
    removed: number;
  } | null;
  explanation: {
    text: string;
    triggerBatchShort: string | null;
    confidence: "high" | "medium" | "low" | null;
  } | null;
  changes: Array<{
    cartIdShort: string | null;
    previousStatus: string | null;
    currentStatus: string | null;
    purchaseIdShort: string | null;
    previousAmount: number | null;
    currentAmount: number | null;
    amountDelta: number;
    probableChangeReason: string;
    triggerBatchShort: string | null;
    triggerBatchConfidence: "high" | "medium" | "low" | null;
    triggerOperation: "inserted" | "updated" | null;
    triggerChangedFields: string[];
  }>;
};

type RecoverySnapshotComparisonDrawerProps = {
  activeWeekStart: string;
  comparison: RecoverySnapshotComparison | null;
  error: string | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const statusLabels: Record<string, string> = {
  payment_review: "Pago en revisión",
  recovered_pack: "Recuperado con pack",
  recovered_with_amount: "Recuperado con monto",
  unrecovered: "No recuperado",
};

const operationLabels: Record<string, string> = {
  inserted: "Insertada",
  updated: "Actualizada",
};

const fieldLabels: Record<string, string> = {
  booking_created_at: "Fecha de compra",
  booking_status: "Estado de reserva",
  cms_url: "URL CMS",
  form_datetime: "Fecha del carrito",
  intended_arrival_at: "Llegada estimada",
  intended_arrival_date: "Fecha estimada de llegada",
  intended_days: "Días estimados",
  intended_departure_at: "Salida estimada",
  intended_departure_date: "Fecha estimada de salida",
  is_valid_purchase: "Validez de compra",
  message_sent: "Mensaje enviado",
  parking_code: "Parking",
  paying_status: "Estado de pago",
  price: "Monto",
  type: "Tipo de carrito",
  updated_at_source: "Actualización de origen",
};

function addDateKeyDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatDateKey(value: string | null | undefined) {
  if (!value) return "-";

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return "-";

  return `${day}/${month}/${year}`;
}

function formatWeekRange(comparison: RecoverySnapshotComparison | null, activeWeekStart: string) {
  const start = comparison?.weekStart ?? activeWeekStart;
  const exclusiveEnd = comparison?.weekEnd ?? addDateKeyDays(activeWeekStart, 7);
  const visibleEnd = addDateKeyDays(exclusiveEnd, -1);

  return `${formatDateKey(start)} - ${formatDateKey(visibleEnd)}`;
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";

  return `${value.toFixed(1).replace(".", ",")}%`;
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";

  return new Intl.NumberFormat("es-CL").format(value);
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";

  return `$${new Intl.NumberFormat("es-CL").format(Math.round(value))}`;
}

function formatSignedCurrency(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";

  return `${sign}${formatCurrency(Math.abs(value))}`;
}

function formatSignedNumber(value: number | null | undefined, singular: string, plural: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const label = absolute === 1 ? singular : plural;

  return `${sign}${formatNumber(absolute)} ${label}`;
}

function formatSignedPoints(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";

  return `${sign}${Math.abs(value).toFixed(1).replace(".", ",")} pts`;
}

function formatSnapshotDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: RECOVERY_TIME_ZONE,
  }).format(date);
}

function translateStatus(value: string | null) {
  if (!value) return "Sin estado";

  return statusLabels[value] ?? "Estado no clasificado";
}

function translateOperation(value: string | null) {
  if (!value) return null;

  return operationLabels[value] ?? null;
}

function translateConfidence(value: "high" | "medium" | "low" | null) {
  if (value === "high") return "Confirmado";
  if (value === "medium") return "Probable";
  if (value === "low") return "Relacionado";

  return null;
}

function translateField(value: string) {
  return fieldLabels[value] ?? null;
}

function toneClasses(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) return "border-slate-200 bg-slate-50 text-slate-700";
  if (value > 0) return "border-emerald-200 bg-emerald-50 text-emerald-700";

  return "border-rose-200 bg-rose-50 text-rose-700";
}

function relevantChanges(comparison: RecoverySnapshotComparison) {
  const operationalChanges = comparison.changes.filter((change) => change.probableChangeReason !== "purchase_data_changed");

  return operationalChanges.length > 0 ? operationalChanges : comparison.changes;
}

function SummaryMetric({ after, before, label }: { after: string; before: string; label: string }) {
  return (
    <div className="rounded-lg border border-[#edf2f6] bg-white px-3 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Antes</p>
          <p className="mt-1 font-medium text-slate-700">{before}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Ahora</p>
          <p className="mt-1 font-medium text-navy">{after}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] px-4 py-4 text-sm text-slate-600">
      {children}
    </div>
  );
}

export function RecoverySnapshotComparisonDrawer({
  activeWeekStart,
  comparison,
  error,
  loading,
  onOpenChange,
  open,
}: RecoverySnapshotComparisonDrawerProps) {
  if (!open) return null;

  const changes = comparison?.available ? relevantChanges(comparison) : [];
  const confidenceLabel = translateConfidence(comparison?.explanation?.confidence ?? null);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#0f172a]/35" onClick={() => onOpenChange(false)}>
      <section
        aria-labelledby="recovery-snapshot-comparison-title"
        aria-modal="true"
        className="absolute inset-0 flex h-[100dvh] w-screen max-w-none flex-col bg-white shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-3xl sm:border-l sm:border-[#d8e7e1]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[#e7f0ec] bg-[#fbfefd] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium tracking-tight text-navy" id="recovery-snapshot-comparison-title">
              Cambios de recuperación
            </h2>
            <p className="mt-1 text-xs text-slate-600">{formatWeekRange(comparison, activeWeekStart)}</p>
            {comparison?.previousSnapshot && comparison.currentSnapshot ? (
              <p className="mt-0.5 truncate text-xs text-slate-500">
                Snapshot {comparison.previousSnapshot.idShort ?? "-"} <ChevronRight className="inline h-3 w-3" /> {comparison.currentSnapshot.idShort ?? "-"}
              </p>
            ) : null}
          </div>
          <button
            aria-label="Cerrar cambios de recuperación"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d8e7e1] bg-white text-slate-600 shadow-sm hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
          {loading ? (
            <EmptyState>
              Cargando comparación histórica...
            </EmptyState>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            </div>
          ) : !comparison || !comparison.available ? (
            <EmptyState>
              Sin comparación histórica para la semana seleccionada.
            </EmptyState>
          ) : comparison.reason === "no_changes" ? (
            <EmptyState>
              Sin cambios desde el snapshot anterior.
            </EmptyState>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryMetric
                  after={formatPercent(comparison.currentSnapshot?.recoveryRate)}
                  before={formatPercent(comparison.previousSnapshot?.recoveryRate)}
                  label="Tasa recuperación"
                />
                <SummaryMetric
                  after={formatNumber(comparison.currentSnapshot?.recoveredConfirmed)}
                  before={formatNumber(comparison.previousSnapshot?.recoveredConfirmed)}
                  label="Recuperados"
                />
                <SummaryMetric
                  after={formatCurrency(comparison.currentSnapshot?.recoveredAmount)}
                  before={formatCurrency(comparison.previousSnapshot?.recoveredAmount)}
                  label="Monto"
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${toneClasses(comparison.delta?.recoveryRatePoints)}`}>
                  {formatSignedPoints(comparison.delta?.recoveryRatePoints)}
                </div>
                <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${toneClasses(comparison.delta?.recoveredConfirmed)}`}>
                  {formatSignedNumber(comparison.delta?.recoveredConfirmed, "recuperado", "recuperados")}
                </div>
                <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${toneClasses(comparison.delta?.recoveredAmount)}`}>
                  {formatSignedCurrency(comparison.delta?.recoveredAmount)}
                </div>
              </div>

              {comparison.explanation ? (
                <div className="rounded-xl border border-[#d8e7e1] bg-[#fbfefd] px-4 py-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">{comparison.explanation.text}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {comparison.explanation.triggerBatchShort ? (
                          <span className="rounded-full border border-[#d6e1ea] bg-white px-2 py-1 text-slate-600">
                            Batch {comparison.explanation.triggerBatchShort}
                          </span>
                        ) : null}
                        {confidenceLabel ? (
                          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-teal-700">
                            {confidenceLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {comparison.counts ? (
                <div className="rounded-xl border border-[#edf2f6] bg-[#fbfdfe] p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Conteos</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      ["Cambios de estado", comparison.counts.statusChanged],
                      ["Cambios de compra", comparison.counts.purchaseChanged],
                      ["Cambios de monto", comparison.counts.amountChanged],
                      ["Datos de compra actualizados", comparison.counts.purchaseDataChanged],
                      ["Agregados", comparison.counts.added],
                      ["Removidos", comparison.counts.removed],
                    ].map(([label, value]) => (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-[#edf2f6] bg-white px-3 py-2 text-sm" key={label}>
                        <span className="text-slate-600">{label}</span>
                        <span className="font-medium text-navy">{formatNumber(value as number)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-[#edf2f6] bg-white p-4">
                <div className="mb-3 flex flex-col justify-between gap-1 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Cambios relevantes</p>
                    <p className="mt-1 text-xs text-slate-500">Los identificadores se muestran abreviados por seguridad.</p>
                  </div>
                  <span className="text-xs text-slate-500">{formatNumber(changes.length)} cambios</span>
                </div>
                {changes.length === 0 ? (
                  <p className="rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
                    No hay cambios relevantes para mostrar.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {changes.map((change, index) => {
                      const operation = translateOperation(change.triggerOperation);
                      const fields = change.triggerChangedFields.map(translateField).filter((field): field is string => Boolean(field));
                      const itemConfidence = translateConfidence(change.triggerBatchConfidence);

                      return (
                        <article className="rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3" key={`${change.cartIdShort ?? "cart"}-${index}`}>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-navy">Carrito {change.cartIdShort ?? "sin identificador"}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {translateStatus(change.previousStatus)} <ChevronRight className="inline h-3 w-3" /> {translateStatus(change.currentStatus)}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs sm:justify-end">
                              {operation ? <span className="rounded-full border border-[#d6e1ea] bg-white px-2 py-1 text-slate-600">{operation}</span> : null}
                              {itemConfidence ? <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-teal-700">{itemConfidence}</span> : null}
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                            <div>
                              <p className="uppercase tracking-[0.08em] text-slate-400">Compra</p>
                              <p className="mt-1 font-medium text-slate-700">{change.purchaseIdShort ?? "Sin compra"}</p>
                            </div>
                            <div>
                              <p className="uppercase tracking-[0.08em] text-slate-400">Monto</p>
                              <p className="mt-1 font-medium text-slate-700">
                                {formatCurrency(change.previousAmount)} <ChevronRight className="inline h-3 w-3" /> {formatCurrency(change.currentAmount)}
                              </p>
                            </div>
                            <div>
                              <p className="uppercase tracking-[0.08em] text-slate-400">Delta</p>
                              <p className="mt-1 font-medium text-slate-700">{formatSignedCurrency(change.amountDelta)}</p>
                            </div>
                          </div>
                          {fields.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {fields.map((field) => (
                                <span className="rounded-full border border-[#d6e1ea] bg-white px-2 py-1 text-[11px] text-slate-600" key={field}>
                                  {field}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
