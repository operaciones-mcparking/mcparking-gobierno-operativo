import { Clock3, DollarSign, ShieldCheck, TrendingUp } from "lucide-react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import type { RecoveryAttributionKpis as RecoveryAttributionKpisData } from "@/lib/dashboard/data";

type RecoveryAttributionKpisProps = {
  error?: string | null;
  kpis: RecoveryAttributionKpisData | null;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}

function formatCurrency(value: number) {
  return `$${formatNumber(Math.round(value))}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(2).replace(".", ",")}%`;
}

const metricTone: Record<string, BadgeTone> = {
  amount: "success",
  conversion: "warning",
  count: "info",
  trust: "success",
};

export function RecoveryAttributionKpis({ error, kpis }: RecoveryAttributionKpisProps) {
  const metrics = kpis
    ? [
        {
          icon: Clock3,
          label: "Recuperados 24h",
          tone: metricTone.count,
          value: formatNumber(kpis.recuperados_24h),
        },
        {
          icon: Clock3,
          label: "Recuperados 48h",
          tone: metricTone.count,
          value: formatNumber(kpis.recuperados_48h),
        },
        {
          icon: TrendingUp,
          label: "Recuperados 7 dias",
          tone: metricTone.conversion,
          value: formatNumber(kpis.recuperados_7d),
        },
        {
          icon: TrendingUp,
          label: "Tasa recuperacion 7d",
          tone: metricTone.conversion,
          value: formatPercent(kpis.tasa_7d),
        },
        {
          icon: DollarSign,
          label: "Monto recuperado 7d",
          tone: metricTone.amount,
          value: formatCurrency(kpis.monto_7d),
        },
        {
          icon: ShieldCheck,
          label: "Alta confianza",
          tone: metricTone.trust,
          value: formatNumber(kpis.high_confidence_cases),
        },
      ]
    : [];

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">Recuperacion atribuida</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Cruce entre carritos perdidos/cancelados y compras validas posteriores dentro de 7 dias.
          </p>
        </div>
        <ValueBadge tone="success">Vista real</ValueBadge>
      </div>

      {error ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
            No se pudieron cargar los KPIs de recuperacion: {error}
          </p>
        </div>
      ) : null}

      {!error && !kpis ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
            No hay recuperaciones atribuidas todavia.
          </p>
        </div>
      ) : null}

      {!error && kpis ? (
        <div className="grid gap-5 p-5 xl:grid-cols-[1fr_280px]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.map((metric) => {
              const Icon = metric.icon;

              return (
                <article className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4" key={metric.label}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d6e1ea] bg-white text-sea">
                      <Icon className="h-4 w-4" />
                    </span>
                    <ValueBadge tone={metric.tone}>{metric.label.includes("7d") ? "7d" : "Real"}</ValueBadge>
                  </div>
                  <p className="mt-4 text-sm leading-5 text-slate-600">{metric.label}</p>
                  <p className="mt-2 text-xl font-medium tracking-tight text-navy">{metric.value}</p>
                </article>
              );
            })}
          </div>

          <aside className="rounded-xl border border-[#d6e1ea] bg-[#fbfdfe] p-4">
            <h3 className="text-sm font-medium text-navy">Confianza de atribucion</h3>
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between rounded-lg border border-[#edf2f6] bg-white px-3 py-2">
                <span className="text-sm text-slate-700">High</span>
                <ValueBadge tone="success">{formatNumber(kpis.high_confidence_cases)}</ValueBadge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[#edf2f6] bg-white px-3 py-2">
                <span className="text-sm text-slate-700">Medium</span>
                <ValueBadge tone="warning">{formatNumber(kpis.medium_confidence_cases)}</ValueBadge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[#edf2f6] bg-white px-3 py-2">
                <span className="text-sm text-slate-700">Low</span>
                <ValueBadge tone="neutral">{formatNumber(kpis.low_confidence_cases)}</ValueBadge>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Total carritos analizados: {formatNumber(kpis.total_carritos)}. No se muestran casos ni datos
              personales.
            </p>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
