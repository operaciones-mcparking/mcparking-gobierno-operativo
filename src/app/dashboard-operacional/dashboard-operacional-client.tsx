"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  OperationalDashboardRow,
  OperationalDashboardTotals,
  OperationalDashboardViewModel,
} from "@/lib/dashboard/operacional";
import { ActualizarDatosOperacionalesControl } from "../orquestador/actualizar-datos-operacionales-control";
import {
  formatAdrCurrency,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDays,
  formatInteger,
  formatPercent,
} from "./dashboard-operacional-formatters";

type DashboardOperacionalClientProps = {
  initialDashboard: OperationalDashboardViewModel | null;
  initialError: string | null;
};

type EndpointResponse = {
  dashboard?: OperationalDashboardViewModel;
  error?: string;
  ok: boolean;
};

type DateRangePreset = "today" | "yesterday" | "last7" | "last14" | "thisMonth" | "previousMonth" | "custom";

type DateRange = {
  from: string;
  preset: DateRangePreset;
  to: string;
};

const dateRangePresets: Array<{ label: string; value: DateRangePreset }> = [
  { label: "Hoy", value: "today" },
  { label: "Ayer", value: "yesterday" },
  { label: "\u00daltimos 7 d\u00edas", value: "last7" },
  { label: "\u00daltimos 14 d\u00edas", value: "last14" },
  { label: "Este mes", value: "thisMonth" },
  { label: "Mes anterior", value: "previousMonth" },
  { label: "Personalizado", value: "custom" },
];

const emptyTotals: OperationalDashboardTotals = {
  advanced_book_days_boleta_avg: null,
  advanced_book_days_pack_avg: null,
  advanced_book_days_total_avg: null,
  avg_order_value_boleta: null,
  duration_stay_boleta_avg: null,
  duration_stay_pack_avg: null,
  duration_stay_total_avg: null,
  pack_vendido_dbi: 0,
  pack_vendido_precio_lista_avg: null,
  pack_vendido_precio_pagado_avg: null,
  pack_vendido_q: 0,
  pack_vendido_venta: 0,
  precio_lista_boleta_avg: null,
  precio_pagado_boleta_avg: null,
  reserva_boleta_dbi: 0,
  reserva_boleta_q: 0,
  reserva_boleta_venta: 0,
  reserva_pack_dbi: 0,
  reserva_pack_q: 0,
  reserva_total_dbi: 0,
  reserva_total_q: 0,
  venta_total_operacional: 0,
};

function getTodayLocalDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function fromLocalDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function addLocalDays(dateKey: string, days: number) {
  const date = fromLocalDateKey(dateKey);
  date.setDate(date.getDate() + days);

  return toLocalDateKey(date);
}

function firstDayOfMonth(dateKey: string) {
  const date = fromLocalDateKey(dateKey);

  return toLocalDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

function previousMonthRange(dateKey: string) {
  const date = fromLocalDateKey(dateKey);
  const first = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const last = new Date(date.getFullYear(), date.getMonth(), 0);

  return {
    from: toLocalDateKey(first),
    to: toLocalDateKey(last),
  };
}

function getPresetDateRange(preset: DateRangePreset, todayKey = getTodayLocalDate()): DateRange {
  if (preset === "yesterday") {
    const yesterday = addLocalDays(todayKey, -1);

    return { from: yesterday, preset, to: yesterday };
  }

  if (preset === "last7") {
    return { from: addLocalDays(todayKey, -6), preset, to: todayKey };
  }

  if (preset === "last14") {
    return { from: addLocalDays(todayKey, -13), preset, to: todayKey };
  }

  if (preset === "thisMonth") {
    return { from: firstDayOfMonth(todayKey), preset, to: todayKey };
  }

  if (preset === "previousMonth") {
    return { ...previousMonthRange(todayKey), preset };
  }

  return { from: todayKey, preset: "today", to: todayKey };
}

function getDateRangeLabel(preset: DateRangePreset) {
  return dateRangePresets.find((item) => item.value === preset)?.label ?? "Personalizado";
}

function isValidDateRange(range: Pick<DateRange, "from" | "to">) {
  return Boolean(range.from && range.to && range.from <= range.to);
}

function buildDashboardRangeQuery(range: DateRange) {
  return `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
}

function updateStatusLabel(status: string | null | undefined) {
  if (status === "succeeded") return "Actualizado correctamente";
  if (status === "failed") return "Actualizacion con error";
  if (status === "cancelled") return "Actualizacion cancelada";
  if (status === "running") return "Actualizacion en curso";
  if (status === "waiting" || status === "queued" || status === "claimed") return "Actualizacion pendiente";

  return "Estado no disponible";
}

function LastUpdateSummary({ dashboard }: { dashboard: OperationalDashboardViewModel | null }) {
  const lastUpdate = dashboard?.lastUpdate;

  if (!lastUpdate) {
    return <p className="mt-2 text-sm text-slate-600">Sin actualizaciones registradas</p>;
  }

  const updateDate = formatDateTime(lastUpdate.calculated_at ?? lastUpdate.updated_at ?? lastUpdate.created_at);
  return (
    <div className="mt-2 grid gap-1 text-sm text-slate-600">
      <p>Ultima actualizacion: {updateDate}</p>
      <p>Estado: {updateStatusLabel(lastUpdate.estado)}</p>
    </div>
  );
}

function groupTotals(dashboard: OperationalDashboardViewModel | null, group: "MCP" | "OKP") {
  return dashboard?.totalsByGroup[group] ?? emptyTotals;
}

type MetricLayout = "normal" | "mirror";
type TextAlignment = "left" | "right";
type ParkingSummaryTotals = Pick<
  OperationalDashboardTotals,
  | "duration_stay_boleta_avg"
  | "precio_lista_boleta_avg"
  | "precio_pagado_boleta_avg"
  | "reserva_total_dbi"
  | "reserva_total_q"
  | "venta_total_operacional"
>;

function KpiLine({ label, layout = "normal", value }: { label: string; layout?: MetricLayout; value: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-b border-[#e4edf4] py-2 last:border-b-0 ${layout === "mirror" ? "flex-row-reverse" : ""}`}>
      <dt className={`text-xs font-medium uppercase tracking-[0.08em] text-slate-500 ${layout === "mirror" ? "text-right" : ""}`}>{label}</dt>
      <dd className={`text-sm font-semibold text-navy ${layout === "mirror" ? "text-left" : "text-right"}`}>{value}</dd>
    </div>
  );
}

function SecondaryMetricCard({ alignment = "left", label, value }: { alignment?: TextAlignment; label: string; value: string }) {
  const textAlignment = alignment === "right" ? "text-right" : "text-left";

  return (
    <div className="rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-3">
      <p className={`text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 ${textAlignment}`}>{label}</p>
      <p className={`mt-1 text-sm font-semibold text-navy ${textAlignment}`}>{value}</p>
    </div>
  );
}

function GroupedMetricBlock({
  leftLabel,
  leftValue,
  layout = "normal",
  mainValue,
  rightLabel,
  rightValue,
  title,
}: {
  leftLabel: string;
  leftValue: string;
  layout?: MetricLayout;
  mainValue: string;
  rightLabel: string;
  rightValue: string;
  title: string;
}) {
  const secondaryAlignment: TextAlignment = layout === "mirror" ? "left" : "right";

  return (
    <section className="border-b border-[#e4edf4] py-3 last:border-b-0">
      <div className={`flex items-start justify-between gap-3 ${layout === "mirror" ? "flex-row-reverse" : ""}`}>
        <h3 className={`text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 ${layout === "mirror" ? "text-right" : ""}`}>{title}</h3>
        <p className={`text-base font-semibold text-navy ${layout === "mirror" ? "text-left" : "text-right"}`}>{mainValue}</p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {layout === "mirror" ? (
          <>
            <SecondaryMetricCard alignment={secondaryAlignment} label={rightLabel} value={rightValue} />
            <SecondaryMetricCard alignment={secondaryAlignment} label={leftLabel} value={leftValue} />
          </>
        ) : (
          <>
            <SecondaryMetricCard alignment={secondaryAlignment} label={leftLabel} value={leftValue} />
            <SecondaryMetricCard alignment={secondaryAlignment} label={rightLabel} value={rightValue} />
          </>
        )}
      </div>
    </section>
  );
}

function AverageBlock({ alignment = "left", label, main, pack, ticket, ticketLabel = "Boleta" }: { alignment?: TextAlignment; label: string; main: number | null; pack: number | null; ticket: number | null; ticketLabel?: string }) {
  const textAlignment = alignment === "right" ? "text-right" : "text-left";

  return (
    <div className="rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-3">
      <p className={`text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 ${textAlignment}`}>{label}</p>
      <p className={`mt-1 text-lg font-semibold text-navy ${textAlignment}`}>{formatDays(main)}</p>
      <div className={`mt-2 grid gap-1 text-xs text-slate-600 ${textAlignment}`}>
        <span>{ticketLabel}: {formatDays(ticket)}</span>
        <span>Pack: {formatDays(pack)}</span>
      </div>
    </div>
  );
}

function CompactMetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#e4edf4] py-2 last:border-b-0">
      <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-semibold text-navy">{value}</dd>
    </div>
  );
}

function MobileGroupedMetricBlock({
  leftLabel,
  leftValue,
  mainValue,
  rightLabel,
  rightValue,
  title,
}: {
  leftLabel: string;
  leftValue: string;
  mainValue: string;
  rightLabel: string;
  rightValue: string;
  title: string;
}) {
  return (
    <section className="border-b border-[#e4edf4] py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</h3>
        <p className="text-right text-base font-semibold text-navy">{mainValue}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SecondaryMetricCard label={leftLabel} value={leftValue} />
        <SecondaryMetricCard label={rightLabel} value={rightValue} />
      </div>
    </section>
  );
}

function SystemColumnMobile({ label, totals }: { label: "MCP" | "OKP"; totals: OperationalDashboardTotals }) {
  return (
    <div className="xl:hidden">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-navy">{label}</h2>
        <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2.5 py-1 text-xs font-medium text-slate-600">Sistema</span>
      </div>

      <div className="mt-4 grid gap-2">
        <MobileGroupedMetricBlock
          leftLabel="Venta boleta"
          leftValue={formatCurrency(totals.reserva_boleta_venta)}
          mainValue={formatCurrency(totals.venta_total_operacional)}
          rightLabel="Venta pack"
          rightValue={formatCurrency(totals.pack_vendido_venta)}
          title="Venta total"
        />
        <MobileGroupedMetricBlock
          leftLabel="DBI boleta"
          leftValue={formatInteger(totals.reserva_boleta_dbi)}
          mainValue={formatInteger(totals.reserva_total_dbi)}
          rightLabel="DBI pack"
          rightValue={formatInteger(totals.reserva_pack_dbi)}
          title="DBI total reservas"
        />
        <MobileGroupedMetricBlock
          leftLabel="Q boleta"
          leftValue={formatInteger(totals.reserva_boleta_q)}
          mainValue={formatInteger(totals.reserva_total_q)}
          rightLabel="Q pack"
          rightValue={formatInteger(totals.reserva_pack_q)}
          title="Q reservas total"
        />
      </div>

      <dl className="mt-4">
        <CompactMetricLine label="Anticipacion promedio" value={formatDays(totals.advanced_book_days_total_avg)} />
        <CompactMetricLine label="Estadia promedio" value={formatDays(totals.duration_stay_total_avg)} />
        <CompactMetricLine label="ADR pagado" value={formatAdrCurrency(totals.precio_pagado_boleta_avg, totals.duration_stay_boleta_avg)} />
        <CompactMetricLine label="ADR lista" value={formatAdrCurrency(totals.precio_lista_boleta_avg, totals.duration_stay_boleta_avg)} />
        <CompactMetricLine label="Ticket pagado" value={formatCurrency(totals.precio_pagado_boleta_avg)} />
        <CompactMetricLine label="Ticket lista" value={formatCurrency(totals.precio_lista_boleta_avg)} />
        <CompactMetricLine label="Pack pagado prom." value={formatCurrency(totals.pack_vendido_precio_pagado_avg)} />
        <CompactMetricLine label="Pack lista prom." value={formatCurrency(totals.pack_vendido_precio_lista_avg)} />
      </dl>
    </div>
  );
}

function SystemColumnDesktop({ label, totals }: { label: "MCP" | "OKP"; totals: OperationalDashboardTotals }) {
  const layout: MetricLayout = label === "MCP" ? "mirror" : "normal";
  const averageAlignment: TextAlignment = label === "OKP" ? "right" : "left";

  return (
    <div className="hidden xl:block">
      <div className={`flex items-center justify-between gap-3 ${layout === "mirror" ? "flex-row-reverse" : ""}`}>
        <h2 className="text-lg font-semibold text-navy">{label}</h2>
        <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2.5 py-1 text-xs font-medium text-slate-600">Sistema</span>
      </div>

      <div className="mt-4 grid gap-2">
        <GroupedMetricBlock
          leftLabel="Venta boleta"
          leftValue={formatCurrency(totals.reserva_boleta_venta)}
          layout={layout}
          mainValue={formatCurrency(totals.venta_total_operacional)}
          rightLabel="Venta pack"
          rightValue={formatCurrency(totals.pack_vendido_venta)}
          title="Venta total"
        />
        <GroupedMetricBlock
          leftLabel="DBI boleta"
          leftValue={formatInteger(totals.reserva_boleta_dbi)}
          layout={layout}
          mainValue={formatInteger(totals.reserva_total_dbi)}
          rightLabel="DBI pack"
          rightValue={formatInteger(totals.reserva_pack_dbi)}
          title="DBI total reservas"
        />
        <GroupedMetricBlock
          leftLabel="Q boleta"
          leftValue={formatInteger(totals.reserva_boleta_q)}
          layout={layout}
          mainValue={formatInteger(totals.reserva_total_q)}
          rightLabel="Q pack"
          rightValue={formatInteger(totals.reserva_pack_q)}
          title="Q reservas total"
        />
      </div>

      <div className="mt-4 grid gap-3">
        <AverageBlock alignment={averageAlignment} label="Anticipacion promedio" main={totals.advanced_book_days_total_avg} pack={totals.advanced_book_days_pack_avg} ticket={totals.advanced_book_days_boleta_avg} />
        <AverageBlock alignment={averageAlignment} label="Estadia promedio" main={totals.duration_stay_total_avg} pack={totals.duration_stay_pack_avg} ticket={totals.duration_stay_boleta_avg} />
      </div>

      <dl className="mt-4">
        <KpiLine label="ADR pagado" layout={layout} value={formatAdrCurrency(totals.precio_pagado_boleta_avg, totals.duration_stay_boleta_avg)} />
        <KpiLine label="ADR lista" layout={layout} value={formatAdrCurrency(totals.precio_lista_boleta_avg, totals.duration_stay_boleta_avg)} />
        <KpiLine label="Ticket pagado" layout={layout} value={formatCurrency(totals.precio_pagado_boleta_avg)} />
        <KpiLine label="Ticket lista" layout={layout} value={formatCurrency(totals.precio_lista_boleta_avg)} />
        <KpiLine label="Pack pagado prom." layout={layout} value={formatCurrency(totals.pack_vendido_precio_pagado_avg)} />
        <KpiLine label="Pack lista prom." layout={layout} value={formatCurrency(totals.pack_vendido_precio_lista_avg)} />
      </dl>
    </div>
  );
}

function SystemColumn({ label, totals }: { label: "MCP" | "OKP"; totals: OperationalDashboardTotals }) {
  return (
    <section className="rounded-xl border border-[#d6e1ea] bg-white p-4 shadow-sm">
      <SystemColumnMobile label={label} totals={totals} />
      <SystemColumnDesktop label={label} totals={totals} />
    </section>
  );
}

function ShareBar({ label, mcp, okp, total }: { label: string; mcp: number; okp: number; total: string }) {
  const safeMcp = Number.isFinite(mcp) ? Math.max(0, Math.min(100, mcp)) : 0;
  const safeOkp = Number.isFinite(okp) ? Math.max(0, Math.min(100, okp)) : 0;

  return (
    <div className="rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-navy">{total}</p>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[#dfe9f0]" aria-label={`${label} OKP vs MCP`}>
        <div className="bg-sea" style={{ width: `${safeOkp}%` }} />
        <div className="bg-clay" style={{ width: `${safeMcp}%` }} />
      </div>
      <div className="mt-2 flex w-full items-center justify-between gap-2 text-xs text-slate-500">
        <p className="text-left">OKP {formatPercent(safeOkp)}</p>
        <p className="text-right">MCP {formatPercent(safeMcp)}</p>
      </div>
    </div>
  );
}

function MarketColumn({ dashboard }: { dashboard: OperationalDashboardViewModel | null }) {
  const totals = dashboard?.totals ?? emptyTotals;
  const marketShare = dashboard?.marketShare;

  return (
    <section className="rounded-xl border border-[#d6e1ea] bg-white p-4 shadow-sm">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-navy">Total / Market size</h2>
        <p className="mt-1 text-xs text-slate-500">Barras calculadas solo con MCP + OKP.</p>
      </div>
      <div className="mt-4 grid gap-3">
        <ShareBar label="Venta total operacional" mcp={marketShare?.venta_total_operacional.MCP ?? 0} okp={marketShare?.venta_total_operacional.OKP ?? 0} total={formatCurrency(totals.venta_total_operacional)} />
        <ShareBar label="DBI reservas total" mcp={marketShare?.reserva_total_dbi.MCP ?? 0} okp={marketShare?.reserva_total_dbi.OKP ?? 0} total={formatInteger(totals.reserva_total_dbi)} />
        <ShareBar label="Q reservas total" mcp={marketShare?.reserva_total_q.MCP ?? 0} okp={marketShare?.reserva_total_q.OKP ?? 0} total={formatInteger(totals.reserva_total_q)} />
      </div>
    </section>
  );
}

function LoadingOverlay() {
  return (
    <div className="rounded-lg border border-[#d6e1ea] bg-[#f8fbfd] p-4 text-sm text-slate-600">
      Cargando dashboard operacional...
    </div>
  );
}
function getParkingSummaryKey(row: OperationalDashboardRow) {
  return `${row.fecha}:${row.parking_codigo}:${row.sistema_grupo}:${row.id}`;
}

function getParkingDetailId(prefix: string, key: string) {
  return `${prefix}-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function formatDetailValue(value: string) {
  return value === "No disponible" ? "\u2014" : value;
}

function ParkingDetailSection({ items, title }: { items: Array<[string, string]>; title: string }) {
  return (
    <section className="rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</h4>
      <dl className="mt-3 grid gap-2 text-sm">
        {items.map(([label, value]) => (
          <div className="flex items-start justify-between gap-4" key={label}>
            <dt className="min-w-0 text-slate-600">{label}</dt>
            <dd className="shrink-0 text-right font-semibold text-navy">{formatDetailValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ParkingDetailDrawer({ onClose, row }: { onClose: () => void; row: OperationalDashboardRow | null }) {
  useEffect(() => {
    if (!row) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, row]);

  if (!row) return null;

  return (
    <div aria-modal="true" className="fixed inset-0 z-50 flex justify-end bg-navy/35" role="dialog">
      <button aria-label="Cerrar detalle operacional" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} type="button" />
      <aside className="relative flex h-full w-full max-w-full flex-col overflow-y-auto overflow-x-hidden bg-white shadow-2xl md:max-w-3xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#d6e1ea] bg-white p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sea">Detalle operacional</p>
            <h2 className="mt-2 text-xl font-semibold text-navy">{row.parking_nombre}</h2>
            <p className="mt-1 text-sm text-slate-600">{formatDate(row.fecha)} ? Sistema {row.sistema_grupo}</p>
          </div>
          <button aria-label="Cerrar detalle operacional" className="rounded-lg border border-[#d7e3ec] bg-white px-3 py-2 text-sm font-medium text-navy transition hover:bg-[#f8fbfd]" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <ParkingDetailSection
            items={[
              ["Venta Operacional", formatCurrency(row.venta_total_operacional)],
              ["Venta Boleta", formatCurrency(row.reserva_boleta_venta)],
              ["Venta Packs Vendidos", formatCurrency(row.pack_vendido_venta)],
            ]}
            title="Ventas"
          />
          <ParkingDetailSection
            items={[
              ["Q Boleta", formatInteger(row.reserva_boleta_q)],
              ["Q Reservas Pack", formatInteger(row.reserva_pack_q)],
              ["Q Total Reservas", formatInteger(row.reserva_total_q)],
            ]}
            title="Reservas"
          />
          <ParkingDetailSection
            items={[
              ["DBI Boleta", formatInteger(row.reserva_boleta_dbi)],
              ["DBI Reservas Pack", formatInteger(row.reserva_pack_dbi)],
              ["DBI Total Reservas", formatInteger(row.reserva_total_dbi)],
            ]}
            title="DBI"
          />
          <ParkingDetailSection
            items={[
              ["Q Packs Vendidos", formatInteger(row.pack_vendido_q)],
              ["DBI Packs Vendidos", formatInteger(row.pack_vendido_dbi)],
            ]}
            title="Packs vendidos"
          />
          <ParkingDetailSection
            items={[
              ["Anticipacion Total", formatDays(row.advanced_book_days_total_avg)],
              ["Anticipacion Boleta", formatDays(row.advanced_book_days_boleta_avg)],
              ["Anticipacion Pack", formatDays(row.advanced_book_days_pack_avg)],
            ]}
            title="Anticipacion"
          />
          <ParkingDetailSection
            items={[
              ["Estadia Total", formatDays(row.duration_stay_total_avg)],
              ["Estadia Boleta", formatDays(row.duration_stay_boleta_avg)],
              ["Estadia Pack", formatDays(row.duration_stay_pack_avg)],
            ]}
            title="Estadia"
          />
          <ParkingDetailSection
            items={[
              ["ADR Pagado", formatAdrCurrency(row.precio_pagado_boleta_avg, row.duration_stay_boleta_avg)],
              ["ADR Lista", formatAdrCurrency(row.precio_lista_boleta_avg, row.duration_stay_boleta_avg)],
            ]}
            title="ADR"
          />
          <ParkingDetailSection
            items={[
              ["Ticket Pagado", formatCurrency(row.precio_pagado_boleta_avg)],
              ["Ticket Lista", formatCurrency(row.precio_lista_boleta_avg)],
            ]}
            title="Ticket"
          />
        </div>
      </aside>
    </div>
  );
}

function ParkingSummaryToggle({
  onOpen,
  parkingName,
}: {
  onOpen: () => void;
  parkingName: string;
}) {
  return (
    <button
      aria-label={`Ver detalle de ${parkingName}`}
      className="rounded-md border border-[#d7e3ec] bg-white px-2.5 py-1 text-xs font-medium text-navy transition hover:bg-[#f8fbfd]"
      onClick={onOpen}
      type="button"
    >
      Ver detalle
    </button>
  );
}

function ParkingSummaryTable({
  onOpenDetail,
  rows,
  totals,
}: {
  onOpenDetail: (row: OperationalDashboardRow) => void;
  rows: OperationalDashboardRow[];
  totals: ParkingSummaryTotals;
}) {
  return (
    <div className="mt-5 hidden lg:block">
      <table className="w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-[0.08em] text-slate-500">
            {[
              { label: "Estacionamiento" },
              { label: "Sistema" },
              { label: "Venta" },
              { label: "Reservas" },
              { label: "DBI" },
              { label: "ADR Pagado (CLP)", title: "Promedio por reserva pagado" },
              { label: "ADR Lista (CLP)", title: "Promedio por reserva segun tarifa lista" },
              { label: "Acci\u00f3n" },
            ].map((header) => (
              <th className="border-b border-[#d6e1ea] bg-[#f8fbfd] px-2.5 py-3 font-semibold" key={header.label} title={header.title}>{header.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = getParkingSummaryKey(row);

            return (
              <Fragment key={key}>
                <tr>
                  <td className="border-b border-[#e4edf4] px-2.5 py-3 font-medium text-navy">{row.parking_nombre}</td>
                  <td className="border-b border-[#e4edf4] px-2.5 py-3">
                    <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2 py-1 text-xs font-medium text-slate-600">{row.sistema_grupo}</span>
                  </td>
                  <td className="border-b border-[#e4edf4] px-2.5 py-3">{formatCurrency(row.venta_total_operacional)}</td>
                  <td className="border-b border-[#e4edf4] px-2.5 py-3">{formatInteger(row.reserva_total_q)}</td>
                  <td className="border-b border-[#e4edf4] px-2.5 py-3">{formatInteger(row.reserva_total_dbi)}</td>
                  <td className="border-b border-[#e4edf4] px-2.5 py-3">{formatAdrCurrency(row.precio_pagado_boleta_avg, row.duration_stay_boleta_avg)}</td>
                  <td className="border-b border-[#e4edf4] px-2.5 py-3">{formatAdrCurrency(row.precio_lista_boleta_avg, row.duration_stay_boleta_avg)}</td>
                  <td className="border-b border-[#e4edf4] px-2.5 py-3">
                    <ParkingSummaryToggle onOpen={() => onOpenDetail(row)} parkingName={row.parking_nombre} />
                  </td>
                </tr>
              </Fragment>
            );
          })}
          <tr className="font-semibold text-navy">
            <td className="border-t border-[#cbd8e3] px-2.5 py-3">TOTAL</td>
            <td className="border-t border-[#cbd8e3] px-2.5 py-3 text-slate-500">-</td>
            <td className="border-t border-[#cbd8e3] px-2.5 py-3">{formatCurrency(totals.venta_total_operacional)}</td>
            <td className="border-t border-[#cbd8e3] px-2.5 py-3">{formatInteger(totals.reserva_total_q)}</td>
            <td className="border-t border-[#cbd8e3] px-2.5 py-3">{formatInteger(totals.reserva_total_dbi)}</td>
            <td className="border-t border-[#cbd8e3] px-2.5 py-3">{formatAdrCurrency(totals.precio_pagado_boleta_avg, totals.duration_stay_boleta_avg)}</td>
            <td className="border-t border-[#cbd8e3] px-2.5 py-3">{formatAdrCurrency(totals.precio_lista_boleta_avg, totals.duration_stay_boleta_avg)}</td>
            <td className="border-t border-[#cbd8e3] px-2.5 py-3" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ParkingSummaryCard({
  onOpenDetail,
  row,
}: {
  onOpenDetail: (row: OperationalDashboardRow) => void;
  row: OperationalDashboardRow;
}) {
  return (
    <article className="rounded-xl border border-[#e4edf4] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-navy">{row.parking_nombre}</h3>
          <span className="mt-2 inline-flex rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2 py-1 text-xs font-medium text-slate-600">{row.sistema_grupo}</span>
        </div>
        <ParkingSummaryToggle onOpen={() => onOpenDetail(row)} parkingName={row.parking_nombre} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-[0.08em] text-slate-500">Venta</dt>
          <dd className="mt-1 font-semibold text-navy">{formatCurrency(row.venta_total_operacional)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.08em] text-slate-500">Reservas</dt>
          <dd className="mt-1 font-semibold text-navy">{formatInteger(row.reserva_total_q)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.08em] text-slate-500">DBI</dt>
          <dd className="mt-1 font-semibold text-navy">{formatInteger(row.reserva_total_dbi)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.08em] text-slate-500" title="Promedio por reserva pagado">ADR Pagado</dt>
          <dd className="mt-1 font-semibold text-navy">{formatAdrCurrency(row.precio_pagado_boleta_avg, row.duration_stay_boleta_avg)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.08em] text-slate-500" title="Promedio por reserva segun tarifa lista">ADR Lista</dt>
          <dd className="mt-1 font-semibold text-navy">{formatAdrCurrency(row.precio_lista_boleta_avg, row.duration_stay_boleta_avg)}</dd>
        </div>
      </dl>
    </article>
  );
}

function ParkingTotalsCard({ totals }: { totals: ParkingSummaryTotals }) {
  return (
    <article className="rounded-xl border border-[#cbd8e3] bg-[#f8fbfd] p-4 font-semibold text-navy">
      <h3>TOTAL</h3>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Venta</dt>
          <dd className="mt-1">{formatCurrency(totals.venta_total_operacional)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Reservas</dt>
          <dd className="mt-1">{formatInteger(totals.reserva_total_q)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">DBI</dt>
          <dd className="mt-1">{formatInteger(totals.reserva_total_dbi)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500" title="Promedio por reserva pagado">ADR Pagado</dt>
          <dd className="mt-1">{formatAdrCurrency(totals.precio_pagado_boleta_avg, totals.duration_stay_boleta_avg)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500" title="Promedio por reserva segun tarifa lista">ADR Lista</dt>
          <dd className="mt-1">{formatAdrCurrency(totals.precio_lista_boleta_avg, totals.duration_stay_boleta_avg)}</dd>
        </div>
      </dl>
    </article>
  );
}

function ParkingSummaryCards({
  onOpenDetail,
  rows,
  totals,
}: {
  onOpenDetail: (row: OperationalDashboardRow) => void;
  rows: OperationalDashboardRow[];
  totals: ParkingSummaryTotals;
}) {
  return (
    <div className="mt-5 grid gap-3 lg:hidden">
      {rows.map((row) => {
        const key = getParkingSummaryKey(row);
        return <ParkingSummaryCard key={key} onOpenDetail={onOpenDetail} row={row} />;
      })}
      <ParkingTotalsCard totals={totals} />
    </div>
  );
}

function DateRangeSelector({ onApplyRange, range }: { onApplyRange: (range: DateRange) => void; range: DateRange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);
  const [customError, setCustomError] = useState<string | null>(null);
  const selectedLabel = getDateRangeLabel(range.preset);

  const selectPreset = useCallback((preset: DateRangePreset) => {
    if (preset === "custom") {
      setCustomFrom(range.from);
      setCustomTo(range.to);
      setCustomError(null);
      setIsOpen(true);
      return;
    }

    onApplyRange(getPresetDateRange(preset));
    setCustomError(null);
    setIsOpen(false);
  }, [onApplyRange, range.from, range.to]);

  const applyCustomRange = useCallback(() => {
    const nextRange: DateRange = { from: customFrom, preset: "custom", to: customTo };

    if (!isValidDateRange(nextRange)) {
      setCustomError("El rango personalizado debe tener Desde menor o igual a Hasta.");
      return;
    }

    setCustomError(null);
    setIsOpen(false);
    onApplyRange(nextRange);
  }, [customFrom, customTo, onApplyRange]);

  return (
    <div className="relative grid min-w-0 gap-3 text-sm font-medium text-navy sm:grid-cols-[minmax(180px,220px)_auto] sm:items-end">
      <div className="grid min-w-0 gap-1">
        <span>Periodo</span>
        <button
          aria-expanded={isOpen}
          className="flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-[#cbd8e3] bg-white px-3 text-left text-sm text-navy outline-none transition hover:bg-[#f8fbfd] focus:border-sea focus:ring-2 focus:ring-[#9bcbdc]/40"
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          <span className="min-w-0 truncate">{selectedLabel}</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
        </button>
      </div>
      <div className="grid min-w-0 gap-1">
        <span>Rango seleccionado</span>
        <p className="flex h-10 min-w-0 items-center rounded-lg border border-transparent text-sm font-normal text-slate-500 sm:whitespace-nowrap">{range.from} - {range.to}</p>
      </div>

      {isOpen ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(92vw,34rem)] overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-xl">
          <div className="grid gap-0 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <div className="border-b border-[#e4edf4] p-2 sm:border-b-0 sm:border-r">
              {dateRangePresets.map((preset) => (
                <button
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${range.preset === preset.value ? "bg-[#e8f4f8] font-semibold text-navy" : "text-slate-600 hover:bg-[#f8fbfd]"}`}
                  key={preset.value}
                  onClick={() => selectPreset(preset.value)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="grid min-w-0 gap-3 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Personalizado</p>
              <label className="grid gap-1 text-sm font-medium text-navy">
                Desde
                <input
                  className="h-10 min-w-0 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm text-navy outline-none focus:border-sea focus:ring-2 focus:ring-[#9bcbdc]/40"
                  onChange={(event) => setCustomFrom(event.target.value)}
                  type="date"
                  value={customFrom}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-navy">
                Hasta
                <input
                  className="h-10 min-w-0 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm text-navy outline-none focus:border-sea focus:ring-2 focus:ring-[#9bcbdc]/40"
                  onChange={(event) => setCustomTo(event.target.value)}
                  type="date"
                  value={customTo}
                />
              </label>
              {customError ? <p className="rounded-lg border border-[#ffd4a3] bg-[#fff8ef] p-2 text-xs font-medium text-[#8a4a00]">{customError}</p> : null}
              <button
                className="h-10 rounded-lg bg-navy px-3 text-sm font-semibold text-white transition hover:bg-[#13354b]"
                onClick={applyCustomRange}
                type="button"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DashboardOperacionalClient({ initialDashboard, initialError }: DashboardOperacionalClientProps) {
  const initialDateRangeRef = useRef(getPresetDateRange("today"));
  const activeRequestRef = useRef(0);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [dateRange, setDateRange] = useState<DateRange>(initialDateRangeRef.current);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [selectedParkingDetail, setSelectedParkingDetail] = useState<OperationalDashboardRow | null>(null);

  const rows = useMemo(() => {
    return [...(dashboard?.rows ?? [])].sort((left, right) => {
      const dateCompare = right.fecha.localeCompare(left.fecha);
      if (dateCompare !== 0) return dateCompare;
      const systemCompare = left.sistema_grupo.localeCompare(right.sistema_grupo);
      if (systemCompare !== 0) return systemCompare;
      return left.parking_nombre.localeCompare(right.parking_nombre);
    });
  }, [dashboard]);
  const parkingSummaryTotals = dashboard?.totals ?? emptyTotals;
  const openParkingDetail = useCallback((row: OperationalDashboardRow) => {
    setSelectedParkingDetail(row);
  }, []);
  const closeParkingDetail = useCallback(() => {
    setSelectedParkingDetail(null);
  }, []);

  const loadByRange = useCallback(async (range: DateRange) => {
    if (!isValidDateRange(range)) {
      setError("El periodo seleccionado no es valido.");
      return false;
    }

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    setDateRange(range);
    setIsLoading(true);
    setError(null);

    const query = buildDashboardRangeQuery(range);

    try {
      const response = await fetch(`/api/dashboard/operacional${query}`, {
        cache: "no-store",
        method: "GET",
      });
      const body = (await response.json()) as EndpointResponse;

      if (requestId !== activeRequestRef.current) {
        return false;
      }

      if (!response.ok || !body.ok || !body.dashboard) {
        setError(body.error ?? "No fue posible consultar el dashboard operacional.");
        return false;
      }

      setDashboard(body.dashboard);
      return true;
    } catch {
      if (requestId !== activeRequestRef.current) {
        return false;
      }

      setError("No fue posible consultar el dashboard operacional.");
      return false;
    } finally {
      if (requestId === activeRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadByRange(initialDateRangeRef.current);
  }, [loadByRange]);

  useEffect(() => {
    setSelectedParkingDetail(null);
  }, [dateRange]);

  return (
    <>
      <section className="mt-5 rounded-2xl border border-[#d6e1ea] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sea">Dashboard operacional</p>
            <div className="hidden lg:block">
            <h2 className="mt-2 text-xl font-semibold text-navy">Comparativa operacional MCP vs OKP</h2>
            <LastUpdateSummary dashboard={dashboard} />
            </div>
          </div>
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <DateRangeSelector onApplyRange={loadByRange} range={dateRange} />

            <ActualizarDatosOperacionalesControl
              controlHref="/orquestador?view=control"
              className="w-full sm:w-fit"
              onSucceeded={() => loadByRange(dateRange)}
              presentation="overlay"
              triggerVariant="compact"
            />
          </div>
        </div>
      </section>



      {error ? (
        <div className="mt-5 rounded-lg border border-[#ffd4a3] bg-[#fff8ef] p-4 text-sm font-medium text-[#8a4a00]">{error}</div>
      ) : null}

      {isLoading ? <div className="mt-5"><LoadingOverlay /></div> : null}

      {!dashboard?.lastUpdate && !error ? (
        <div className="mt-5 rounded-lg border border-[#d6e1ea] bg-white p-5 text-sm text-slate-600">No hay una corrida operacional disponible todavia.</div>
      ) : null}

      <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.86fr)_minmax(0,1fr)]">
        <div className="order-2 xl:order-1">
          <SystemColumn label="OKP" totals={groupTotals(dashboard, "OKP")} />
        </div>
        <div className="order-1 xl:order-2">
          <MarketColumn dashboard={dashboard} />
        </div>
        <div className="order-3 xl:order-3">
          <SystemColumn label="MCP" totals={groupTotals(dashboard, "MCP")} />
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-[#d6e1ea] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-navy">Resumen por estacionamiento</h2>
            <p className="mt-1 text-sm text-slate-600">{rows.length} estacionamientos para el periodo seleccionado.</p>
          </div>
          <span className="w-fit rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2.5 py-1 text-xs font-medium text-slate-600">Solo lectura</span>
        </div>

        {rows.length === 0 ? (
          <p className="mt-5 rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4 text-sm text-slate-600">No hay estacionamientos para el periodo seleccionado.</p>
        ) : (
          <>
            <ParkingSummaryTable onOpenDetail={openParkingDetail} rows={rows} totals={parkingSummaryTotals} />
            <ParkingSummaryCards onOpenDetail={openParkingDetail} rows={rows} totals={parkingSummaryTotals} />
          </>
        )}
      </section>

      <ParkingDetailDrawer onClose={closeParkingDetail} row={selectedParkingDetail} />
    </>
  );
}
