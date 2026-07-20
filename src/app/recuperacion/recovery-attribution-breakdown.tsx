import { BarChart3 } from "lucide-react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import type {
  RecoveryAttributionBreakdown as RecoveryAttributionBreakdownData,
  RecoveryAttributionBreakdownItem,
} from "@/lib/dashboard/data";

type RecoveryAttributionBreakdownProps = {
  breakdown: RecoveryAttributionBreakdownData | null;
  error?: string | null;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}

function formatCurrency(value: number) {
  return `$${formatNumber(Math.round(value))}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function toneForLabel(label: string): BadgeTone {
  if (label === "high" || label === "MPV") return "success";
  if (label === "medium" || label === "canceled") return "warning";
  if (label === "low" || label === "abandoned") return "info";

  return "neutral";
}

function BreakdownCard({ items, title }: { items: RecoveryAttributionBreakdownItem[]; title: string }) {
  const maxCount = Math.max(...items.map((item) => item.count), 1);

  return (
    <article className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4">
      <div className="flex items-center gap-2 text-navy">
        <BarChart3 className="h-4 w-4 text-sea" />
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <div className="rounded-lg border border-[#edf2f6] bg-white px-3 py-3" key={item.label}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-navy">{item.label}</p>
                {item.segment_total !== undefined && item.recovery_rate !== undefined ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {formatNumber(item.count)} recuperados de {formatNumber(item.segment_total)} · tasa{" "}
                    {formatPercent(item.recovery_rate)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    {formatNumber(item.count)} casos · {formatPercent(item.percentage ?? 0)} de recuperados
                  </p>
                )}
                <p className="mt-1 text-xs font-medium text-navy">{formatCurrency(item.amount)}</p>
              </div>
              <div className="text-right">
                <ValueBadge tone={toneForLabel(item.label)}>{formatNumber(item.count)}</ValueBadge>
                {item.segment_total !== undefined && item.recovery_rate !== undefined ? (
                  <p className="mt-1 text-xs text-slate-500">{formatPercent(item.recovery_rate)}</p>
                ) : item.percentage !== undefined ? (
                  <p className="mt-1 text-xs text-slate-500">{formatPercent(item.percentage)}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#edf2f6]">
              <div
                className="h-full rounded-full bg-sea"
                style={{ width: `${Math.max((item.count / maxCount) * 100, 4)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function RecoveryAttributionBreakdown({ breakdown, error }: RecoveryAttributionBreakdownProps) {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">Desglose de recuperación</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Carritos de los últimos 7 días y compras atribuidas hasta 7 días después.
          </p>
        </div>
        <ValueBadge tone="info">Solo agregados</ValueBadge>
      </div>

      {error ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
            No se pudo cargar el desglose de recuperación: {error}
          </p>
        </div>
      ) : null}

      {!error && (!breakdown || breakdown.total_recovered === 0) ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
            No hay desglose de recuperación disponible todavía.
          </p>
        </div>
      ) : null}

      {!error && breakdown && breakdown.total_recovered > 0 ? (
        <div className="grid gap-5 p-5 lg:grid-cols-3">
          <BreakdownCard items={breakdown.by_type} title="Por tipo de carrito" />
          <BreakdownCard items={breakdown.by_confidence} title="Por confianza" />
          <BreakdownCard items={breakdown.by_parking} title="Por parking" />
        </div>
      ) : null}
    </section>
  );
}
