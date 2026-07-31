"use client";

import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import type {
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

function groupTotals(dashboard: OperationalDashboardViewModel | null, group: "MCP" | "OKP") {
  return dashboard?.totalsByGroup[group] ?? emptyTotals;
}

function KpiLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#e4edf4] py-2 last:border-b-0">
      <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-semibold text-navy">{value}</dd>
    </div>
  );
}

function AverageBlock({ label, main, pack, ticket, ticketLabel = "Boleta" }: { label: string; main: number | null; pack: number | null; ticket: number | null; ticketLabel?: string }) {
  return (
    <div className="rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-navy">{formatDays(main)}</p>
      <div className="mt-2 grid gap-1 text-xs text-slate-600">
        <span>{ticketLabel}: {formatDays(ticket)}</span>
        <span>Pack: {formatDays(pack)}</span>
      </div>
    </div>
  );
}

function SystemColumn({ label, totals }: { label: "MCP" | "OKP"; totals: OperationalDashboardTotals }) {
  return (
    <section className="rounded-xl border border-[#d6e1ea] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-navy">{label}</h2>
        <span className="rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2.5 py-1 text-xs font-medium text-slate-600">Sistema</span>
      </div>

      <dl className="mt-4">
        <KpiLine label="Venta total" value={formatCurrency(totals.venta_total_operacional)} />
        <KpiLine label="Venta boleta" value={formatCurrency(totals.reserva_boleta_venta)} />
        <KpiLine label="Venta pack" value={formatCurrency(totals.pack_vendido_venta)} />
        <KpiLine label="DBI total reservas" value={formatInteger(totals.reserva_total_dbi)} />
        <KpiLine label="DBI boleta" value={formatInteger(totals.reserva_boleta_dbi)} />
        <KpiLine label="DBI pack" value={formatInteger(totals.reserva_pack_dbi)} />
        <KpiLine label="Q reservas total" value={formatInteger(totals.reserva_total_q)} />
        <KpiLine label="Q boleta" value={formatInteger(totals.reserva_boleta_q)} />
        <KpiLine label="Q pack" value={formatInteger(totals.reserva_pack_q)} />
      </dl>

      <div className="mt-4 grid gap-3">
        <AverageBlock label="Anticipacion promedio" main={totals.advanced_book_days_total_avg} pack={totals.advanced_book_days_pack_avg} ticket={totals.advanced_book_days_boleta_avg} />
        <AverageBlock label="Estadia promedio" main={totals.duration_stay_total_avg} pack={totals.duration_stay_pack_avg} ticket={totals.duration_stay_boleta_avg} />
      </div>

      <dl className="mt-4">
        <KpiLine label="ADR pagado" value={formatAdrCurrency(totals.precio_pagado_boleta_avg, totals.duration_stay_boleta_avg)} />
        <KpiLine label="ADR lista" value={formatAdrCurrency(totals.precio_lista_boleta_avg, totals.duration_stay_boleta_avg)} />
        <KpiLine label="Ticket pagado" value={formatCurrency(totals.precio_pagado_boleta_avg)} />
        <KpiLine label="Ticket lista" value={formatCurrency(totals.precio_lista_boleta_avg)} />
        <KpiLine label="Pack pagado prom." value={formatCurrency(totals.pack_vendido_precio_pagado_avg)} />
        <KpiLine label="Pack lista prom." value={formatCurrency(totals.pack_vendido_precio_lista_avg)} />
      </dl>
    </section>
  );
}

function ShareBar({ label, mcp, okp, total }: { label: string; mcp: number; okp: number; total: string }) {
  const safeMcp = Number.isFinite(mcp) ? Math.max(0, Math.min(100, mcp)) : 0;
  const safeOkp = Number.isFinite(okp) ? Math.max(0, Math.min(100, okp)) : 0;

  return (
    <div className="rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-semibold text-navy">{total}</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>MCP {formatPercent(safeMcp)}</p>
          <p>OKP {formatPercent(safeOkp)}</p>
        </div>
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[#dfe9f0]" aria-label={`${label} MCP vs OKP`}>
        <div className="bg-sea" style={{ width: `${safeMcp}%` }} />
        <div className="bg-clay" style={{ width: `${safeOkp}%` }} />
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
        <ShareBar
          label="Venta total operacional"
          mcp={marketShare?.venta_total_operacional.MCP ?? 0}
          okp={marketShare?.venta_total_operacional.OKP ?? 0}
          total={formatCurrency(totals.venta_total_operacional)}
        />
        <ShareBar
          label="DBI reservas total"
          mcp={marketShare?.reserva_total_dbi.MCP ?? 0}
          okp={marketShare?.reserva_total_dbi.OKP ?? 0}
          total={formatInteger(totals.reserva_total_dbi)}
        />
        <ShareBar
          label="Q reservas total"
          mcp={marketShare?.reserva_total_q.MCP ?? 0}
          okp={marketShare?.reserva_total_q.OKP ?? 0}
          total={formatInteger(totals.reserva_total_q)}
        />
      </div>
      {dashboard?.totalsByGroup.OTRO ? (
        <p className="mt-4 rounded-lg border border-[#e4edf4] bg-[#fbfdff] p-3 text-xs leading-5 text-slate-600">
          OTRO existe en los totales por grupo, pero no participa en las barras MCP/OKP.
        </p>
      ) : null}
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

export function DashboardOperacionalClient({ initialDashboard, initialError }: DashboardOperacionalClientProps) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [selectedDate, setSelectedDate] = useState(initialDashboard?.filters?.date ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(initialError);

  const rows = useMemo(() => {
    return [...(dashboard?.rows ?? [])].sort((left, right) => {
      const dateCompare = right.fecha.localeCompare(left.fecha);
      if (dateCompare !== 0) return dateCompare;
      const systemCompare = left.sistema_grupo.localeCompare(right.sistema_grupo);
      if (systemCompare !== 0) return systemCompare;
      return left.parking_nombre.localeCompare(right.parking_nombre);
    });
  }, [dashboard]);

  async function loadByDate(date: string) {
    setSelectedDate(date);
    setIsLoading(true);
    setError(null);

    const query = date ? `?date=${encodeURIComponent(date)}` : "";

    try {
      const response = await fetch(`/api/dashboard/operacional${query}`, {
        method: "GET",
      });
      const body = (await response.json()) as EndpointResponse;

      if (!response.ok || !body.ok || !body.dashboard) {
        setError(body.error ?? "No fue posible consultar el dashboard operacional.");
        return;
      }

      setDashboard(body.dashboard);
    } catch {
      setError("No fue posible consultar el dashboard operacional.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
        <section className="mt-5 rounded-2xl border border-[#d6e1ea] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sea">Dashboard operacional</p>
              <h2 className="mt-2 text-xl font-semibold text-navy">Comparativa operacional MCP vs OKP</h2>
              <p className="mt-2 text-sm text-slate-600">
                Ultima corrida: {dashboard?.lastUpdate ? `${dashboard.lastUpdate.estado} / ${dashboard.lastUpdate.periodo_desde} a ${dashboard.lastUpdate.periodo_hasta}` : "Sin corrida registrada"}
              </p>
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

              <button
                aria-label="Refrescar dashboard operacional"
                className="h-10 rounded-lg border border-[#cbd8e3] bg-white px-4 text-sm font-semibold text-navy transition hover:border-sea disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
                onClick={() => loadByDate(selectedDate)}
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  <RefreshCw className={`h-4 w-4 text-sea ${isLoading ? "animate-spin" : ""}`} />
                  Refrescar
                </span>
              </button>
            </div>
          </div>

        </section>

        <ActualizarDatosOperacionalesControl
          controlHref="/orquestador?view=control"
          onSucceeded={() => loadByDate(selectedDate)}
        />

        {error ? (
          <div className="mt-5 rounded-lg border border-[#ffd4a3] bg-[#fff8ef] p-4 text-sm font-medium text-[#8a4a00]">{error}</div>
        ) : null}

        {isLoading ? <div className="mt-5"><LoadingOverlay /></div> : null}

        {!dashboard?.lastUpdate && !error ? (
          <div className="mt-5 rounded-lg border border-[#d6e1ea] bg-white p-5 text-sm text-slate-600">No hay una corrida operacional disponible todavia.</div>
        ) : null}

        <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.86fr)_minmax(0,1fr)]">
          <SystemColumn label="OKP" totals={groupTotals(dashboard, "OKP")} />
          <MarketColumn dashboard={dashboard} />
          <SystemColumn label="MCP" totals={groupTotals(dashboard, "MCP")} />
        </section>

        <section className="mt-5 rounded-2xl border border-[#d6e1ea] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-navy">Detalle operativo por parking</h2>
              <p className="mt-1 text-sm text-slate-600">{rows.length} filas operacionales visibles.</p>
            </div>
            <span className="w-fit rounded-md border border-[#d7e3ec] bg-[#f8fbfd] px-2.5 py-1 text-xs font-medium text-slate-600">Solo lectura</span>
          </div>

          {rows.length === 0 ? (
            <p className="mt-5 rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4 text-sm text-slate-600">No hay filas para el filtro seleccionado.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-[1180px] w-full border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.08em] text-slate-500">
                    {["Fecha", "Parking", "Sistema", "Venta operacional", "Venta boleta", "Venta packs vendidos", "Q boleta", "Q reservas pack", "Q total reservas", "DBI boleta", "DBI reservas pack", "DBI total reservas", "Q packs vendidos", "DBI packs vendidos"].map((header) => (
                      <th className="border-b border-[#d6e1ea] bg-[#f8fbfd] px-3 py-3 font-semibold" key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className="border-b border-[#e4edf4]" key={row.id}>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatDate(row.fecha)}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3 font-medium text-navy">{row.parking_nombre}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{row.sistema_grupo}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatCurrency(row.venta_total_operacional)}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatCurrency(row.reserva_boleta_venta)}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatCurrency(row.pack_vendido_venta)}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatInteger(row.reserva_boleta_q)}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatInteger(row.reserva_pack_q)}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatInteger(row.reserva_total_q)}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatInteger(row.reserva_boleta_dbi)}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatInteger(row.reserva_pack_dbi)}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatInteger(row.reserva_total_dbi)}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatInteger(row.pack_vendido_q)}</td>
                      <td className="border-b border-[#e4edf4] px-3 py-3">{formatInteger(row.pack_vendido_dbi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
    </>
  );
}
