"use client";

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

  const updateDate = lastUpdate.periodo_hasta ? formatDate(lastUpdate.periodo_hasta) : "Sin fecha";
  const hasRange = Boolean(lastUpdate.periodo_desde && lastUpdate.periodo_hasta);

  return (
    <div className="mt-2 grid gap-1 text-sm text-slate-600">
      <p>Ultima actualizacion: {updateDate}</p>
      <p>Estado: {updateStatusLabel(lastUpdate.estado)}</p>
      {hasRange ? (
        <p className="text-xs">Datos disponibles: {formatDate(lastUpdate.periodo_desde)} al {formatDate(lastUpdate.periodo_hasta)}</p>
      ) : null}
    </div>
  );
}

function groupTotals(dashboard: OperationalDashboardViewModel | null, group: "MCP" | "OKP") {
  return dashboard?.totalsByGroup[group] ?? emptyTotals;
}

type MetricLayout = "normal" | "mirror";
type TextAlignment = "left" | "right";
type ParkingSummaryTotals = Pick<
  OperationalDashboardRow,
  "pack_vendido_q" | "reserva_total_dbi" | "reserva_total_q" | "venta_total_operacional"
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

function SystemColumn({ label, totals }: { label: "MCP" | "OKP"; totals: OperationalDashboardTotals }) {
  const layout: MetricLayout = label === "MCP" ? "mirror" : "normal";
  const averageAlignment: TextAlignment = label === "OKP" ? "right" : "left";

  return (
    <section className="rounded-xl border border-[#d6e1ea] bg-white p-4 shadow-sm">
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

function calculateParkingSummaryTotals(rows: OperationalDashboardRow[]): ParkingSummaryTotals {
  const totals: ParkingSummaryTotals = {
    pack_vendido_q: 0,
    reserva_total_dbi: 0,
    reserva_total_q: 0,
    venta_total_operacional: 0,
  };

  for (const row of rows) {
    totals.pack_vendido_q += row.pack_vendido_q;
    totals.reserva_total_dbi += row.reserva_total_dbi;
    totals.reserva_total_q += row.reserva_total_q;
    totals.venta_total_operacional += row.venta_total_operacional;
  }

  return totals;
}

function ParkingDetailSection({ items, title }: { items: Array<[string, string]>; title: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</h4>
      <dl className="mt-2 grid gap-1 text-sm">
        {items.map(([label, value]) => (
          <div className="flex items-center justify-between gap-3" key={label}>
            <dt className="text-slate-600">{label}</dt>
            <dd className="font-medium text-navy">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ParkingDetail({ row }: { row: OperationalDashboardRow }) {
  return (
    <div className="grid gap-4 rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4 sm:grid-cols-2 lg:grid-cols-5">
      <ParkingDetailSection
        items={[
          ["Venta boleta", formatCurrency(row.reserva_boleta_venta)],
          ["Venta packs", formatCurrency(row.pack_vendido_venta)],
        ]}
        title="Ventas"
      />
      <ParkingDetailSection
        items={[
          ["Q boleta", formatInteger(row.reserva_boleta_q)],
          ["Q reservas pack", formatInteger(row.reserva_pack_q)],
          ["Q total reservas", formatInteger(row.reserva_total_q)],
        ]}
        title="Reservas"
      />
      <ParkingDetailSection
        items={[
          ["DBI boleta", formatInteger(row.reserva_boleta_dbi)],
          ["DBI reservas pack", formatInteger(row.reserva_pack_dbi)],
          ["DBI total reservas", formatInteger(row.reserva_total_dbi)],
        ]}
        title="DBI"
      />
      <ParkingDetailSection items={[["Q packs vendidos", formatInteger(row.pack_vendido_q)]]} title="Packs" />
      <ParkingDetailSection items={[["Fecha del registro", formatDate(row.fecha)]]} title="Fecha" />
    </div>
  );
}

function ParkingSummaryToggle({
  detailId,
  isExpanded,
  onToggle,
  parkingName,
}: {
  detailId: string;
  isExpanded: boolean;
  onToggle: () => void;
  parkingName: string;
}) {
  return (
    <button
      aria-controls={detailId}
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? "Ocultar" : "Ver"} detalle de ${parkingName}`}
      className="rounded-md border border-[#d7e3ec] bg-white px-2.5 py-1 text-xs font-medium text-navy transition hover:bg-[#f8fbfd]"
      onClick={onToggle}
      type="button"
    >
      {isExpanded ? "Ocultar detalle" : "Ver detalle"}
    </button>
  );
}

function ParkingSummaryTable({
  expandedKeys,
  onToggle,
  rows,
  totals,
}: {
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  rows: OperationalDashboardRow[];
  totals: ParkingSummaryTotals;
}) {
  return (
    <div className="mt-5 hidden lg:block">
      <table className="w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-[0.08em] text-slate-500">
            {["Estacionamiento", "Sistema", "Venta", "Reservas", "DBI", "Packs vendidos", "Acción"].map((header) => (
              <th className="border-b border-[#d6e1ea] bg-[#f8fbfd] px-3 py-3 font-semibold" key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = getParkingSummaryKey(row);
            const detailId = getParkingDetailId("parking-detail", key);
            const isExpanded = expandedKeys.has(key);

            return (
              <Fragment key={key}>
                <tr>
                  <td className="border-b border-[#e4edf4] px-3 py-3 font-medium text-navy">{row.parking_nombre}</td>
                  <td className="border-b border-[#e4edf4] px-3 py-3">
                    <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2 py-1 text-xs font-medium text-slate-600">{row.sistema_grupo}</span>
                  </td>
                  <td className="border-b border-[#e4edf4] px-3 py-3">{formatCurrency(row.venta_total_operacional)}</td>
                  <td className="border-b border-[#e4edf4] px-3 py-3">{formatInteger(row.reserva_total_q)}</td>
                  <td className="border-b border-[#e4edf4] px-3 py-3">{formatInteger(row.reserva_total_dbi)}</td>
                  <td className="border-b border-[#e4edf4] px-3 py-3">{formatInteger(row.pack_vendido_q)}</td>
                  <td className="border-b border-[#e4edf4] px-3 py-3">
                    <ParkingSummaryToggle
                      detailId={detailId}
                      isExpanded={isExpanded}
                      onToggle={() => onToggle(key)}
                      parkingName={row.parking_nombre}
                    />
                  </td>
                </tr>
                {isExpanded ? (
                  <tr>
                    <td className="border-b border-[#e4edf4] px-3 py-3" colSpan={7}>
                      <div id={detailId}>
                        <ParkingDetail row={row} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
          <tr className="font-semibold text-navy">
            <td className="border-t border-[#cbd8e3] px-3 py-3">TOTAL</td>
            <td className="border-t border-[#cbd8e3] px-3 py-3 text-slate-500">-</td>
            <td className="border-t border-[#cbd8e3] px-3 py-3">{formatCurrency(totals.venta_total_operacional)}</td>
            <td className="border-t border-[#cbd8e3] px-3 py-3">{formatInteger(totals.reserva_total_q)}</td>
            <td className="border-t border-[#cbd8e3] px-3 py-3">{formatInteger(totals.reserva_total_dbi)}</td>
            <td className="border-t border-[#cbd8e3] px-3 py-3">{formatInteger(totals.pack_vendido_q)}</td>
            <td className="border-t border-[#cbd8e3] px-3 py-3" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ParkingSummaryCard({
  isExpanded,
  onToggle,
  row,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  row: OperationalDashboardRow;
}) {
  const key = getParkingSummaryKey(row);
  const detailId = getParkingDetailId("parking-card-detail", key);

  return (
    <article className="rounded-xl border border-[#e4edf4] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-navy">{row.parking_nombre}</h3>
          <span className="mt-2 inline-flex rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2 py-1 text-xs font-medium text-slate-600">{row.sistema_grupo}</span>
        </div>
        <ParkingSummaryToggle detailId={detailId} isExpanded={isExpanded} onToggle={onToggle} parkingName={row.parking_nombre} />
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
          <dt className="text-xs uppercase tracking-[0.08em] text-slate-500">Packs vendidos</dt>
          <dd className="mt-1 font-semibold text-navy">{formatInteger(row.pack_vendido_q)}</dd>
        </div>
      </dl>
      {isExpanded ? (
        <div className="mt-4" id={detailId}>
          <ParkingDetail row={row} />
        </div>
      ) : null}
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
          <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Packs vendidos</dt>
          <dd className="mt-1">{formatInteger(totals.pack_vendido_q)}</dd>
        </div>
      </dl>
    </article>
  );
}

function ParkingSummaryCards({
  expandedKeys,
  onToggle,
  rows,
  totals,
}: {
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  rows: OperationalDashboardRow[];
  totals: ParkingSummaryTotals;
}) {
  return (
    <div className="mt-5 grid gap-3 lg:hidden">
      {rows.map((row) => {
        const key = getParkingSummaryKey(row);
        return <ParkingSummaryCard isExpanded={expandedKeys.has(key)} key={key} onToggle={() => onToggle(key)} row={row} />;
      })}
      <ParkingTotalsCard totals={totals} />
    </div>
  );
}

export function DashboardOperacionalClient({ initialDashboard, initialError }: DashboardOperacionalClientProps) {
  const initialDateRef = useRef(getTodayLocalDate());
  const activeRequestRef = useRef(0);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedDate, setSelectedDate] = useState(initialDateRef.current);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [expandedParkingKeys, setExpandedParkingKeys] = useState<Set<string>>(() => new Set());

  const rows = useMemo(() => {
    return [...(dashboard?.rows ?? [])].sort((left, right) => {
      const dateCompare = right.fecha.localeCompare(left.fecha);
      if (dateCompare !== 0) return dateCompare;
      const systemCompare = left.sistema_grupo.localeCompare(right.sistema_grupo);
      if (systemCompare !== 0) return systemCompare;
      return left.parking_nombre.localeCompare(right.parking_nombre);
    });
  }, [dashboard]);
  const parkingSummaryTotals = useMemo(() => calculateParkingSummaryTotals(rows), [rows]);
  const toggleParkingDetail = useCallback((key: string) => {
    setExpandedParkingKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const loadByDate = useCallback(async (date: string) => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    setSelectedDate(date);
    setIsLoading(true);
    setError(null);

    const query = date ? `?date=${encodeURIComponent(date)}` : "";

    try {
      const response = await fetch(`/api/dashboard/operacional${query}`, {
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
    void loadByDate(initialDateRef.current);
  }, [loadByDate]);

  useEffect(() => {
    setExpandedParkingKeys(new Set());
  }, [selectedDate]);

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
          <div className="grid gap-3 sm:grid-cols-[minmax(180px,220px)_auto] sm:items-end">
            <label className="grid gap-1 text-sm font-medium text-navy">
              Filtro Fecha
              <input
                className="h-10 rounded-lg border border-[#cbd8e3] bg-white px-3 text-sm text-navy outline-none focus:border-sea focus:ring-2 focus:ring-[#9bcbdc]/40"
                onChange={(event) => loadByDate(event.target.value)}
                type="date"
                value={selectedDate}
              />
            </label>

            <ActualizarDatosOperacionalesControl
              controlHref="/orquestador?view=control"
              onSucceeded={() => loadByDate(selectedDate)}
              presentation="overlay"
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
            <p className="mt-1 text-sm text-slate-600">{rows.length} estacionamientos para la fecha seleccionada.</p>
          </div>
          <span className="w-fit rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2.5 py-1 text-xs font-medium text-slate-600">Solo lectura</span>
        </div>

        {rows.length === 0 ? (
          <p className="mt-5 rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4 text-sm text-slate-600">No hay estacionamientos para la fecha seleccionada.</p>
        ) : (
          <>
            <ParkingSummaryTable expandedKeys={expandedParkingKeys} onToggle={toggleParkingDetail} rows={rows} totals={parkingSummaryTotals} />
            <ParkingSummaryCards expandedKeys={expandedParkingKeys} onToggle={toggleParkingDetail} rows={rows} totals={parkingSummaryTotals} />
          </>
        )}
      </section>
    </>
  );
}
