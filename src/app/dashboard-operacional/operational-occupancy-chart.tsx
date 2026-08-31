"use client";

import { useMemo, useState } from "react";

import { buildPhysicalOccupancyDisplayRows, physicalOccupancyDisplayLabel, type CommercialOccupancyRow, type OperationalOccupancyReadModel, type PhysicalOccupancyRow } from "@/lib/dashboard/ocupacion";
import { occupancySeriesColor, splitOccupancyDailySegments } from "@/lib/dashboard/ocupacion-chart";
import { formatCurrency, formatInteger } from "./dashboard-operacional-formatters";

type OccupancyMode = "physical" | "commercial";
type ChartRow = PhysicalOccupancyRow | CommercialOccupancyRow;

type TooltipPoint = {
  capacity: number | null;
  fecha: string;
  name: string;
  occupancyPercentage: number | null;
  occupied: number;
  revenue: number | null;
  x: number;
  y: number;
};

const chartWidth = 920;
const chartHeight = 330;
const margin = { top: 34, right: 24, bottom: 42, left: 58 };
const percentageFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

function formatTooltipPercentage(value: number | null) {
  return value === null ? "No disponible" : `${percentageFormatter.format(value)}%`;
}

function timestamp(value: string) {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function seriesName(row: ChartRow, mode: OccupancyMode) {
  return mode === "physical" ? (row as PhysicalOccupancyRow).parking_fisico : (row as CommercialOccupancyRow).parking_comercial;
}

function monthTicks(from: string, to: string) {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const end = timestamp(to);
  const ticks: Array<{ date: string; label: string }> = [];
  const cursor = new Date(Date.UTC(fromYear, fromMonth - 1, 1));
  while (cursor.getTime() <= end) {
    const date = cursor.toISOString().slice(0, 10);
    ticks.push({
      date,
      label: new Intl.DateTimeFormat("es-CL", { month: "short", timeZone: "UTC", year: "2-digit" }).format(cursor),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}

export function OperationalOccupancyChart({
  data,
  error,
  isLoading,
  mode,
  selected,
  today,
}: {
  data: OperationalOccupancyReadModel | null;
  error: string | null;
  isLoading: boolean;
  mode: OccupancyMode;
  selected: Set<string>;
  today: string;
}) {
  const [tooltip, setTooltip] = useState<TooltipPoint | null>(null);
  const model = useMemo(() => {
    if (!data) return null;
    const displayRows: ChartRow[] = mode === "physical"
      ? buildPhysicalOccupancyDisplayRows(data.physical)
      : data.commercial;
    const rows = displayRows.filter((row) => selected.has(seriesName(row, mode)));
    const grouped = new Map<string, ChartRow[]>();
    for (const row of rows) {
      const name = seriesName(row, mode);
      grouped.set(name, [...(grouped.get(name) ?? []), row]);
    }

    const fromTime = timestamp(data.filters.from);
    const toTime = timestamp(data.filters.to);
    const plotWidth = chartWidth - margin.left - margin.right;
    const plotHeight = chartHeight - margin.top - margin.bottom;
    const maxOccupied = Math.max(1, ...rows.map((row) => row.occupied));
    const yMax = Math.ceil(maxOccupied * 1.1);
    const x = (fecha: string) => margin.left + ((timestamp(fecha) - fromTime) / Math.max(1, toTime - fromTime)) * plotWidth;
    const y = (occupied: number) => margin.top + plotHeight - (occupied / yMax) * plotHeight;

    return {
      fromTime,
      grouped,
      plotHeight,
      plotWidth,
      rows,
      ticks: monthTicks(data.filters.from, data.filters.to),
      toTime,
      x,
      y,
      yMax,
    };
  }, [data, mode, selected]);

  if (isLoading) return <p className="mt-3 rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4 text-sm text-slate-600">Cargando tendencia de ocupación...</p>;
  if (error) return <p className="mt-3 rounded-lg border border-[#ffd4a3] bg-[#fff8ef] p-4 text-sm font-medium text-[#8a4a00]">{error}</p>;
  if (!model || model.rows.length === 0) return <p className="mt-3 rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4 text-sm text-slate-600">No hay datos de tendencia para los estacionamientos seleccionados.</p>;

  const todayTime = timestamp(today);
  const todayVisible = todayTime >= model.fromTime && todayTime <= model.toTime;
  const todayX = todayVisible ? model.x(today) : null;

  return (
    <div className="mt-6 min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-navy">Tendencia de ocupados</h3>
          <p className="mt-1 text-xs text-slate-500">Últimos 5 meses y próximos 2 meses. Los espacios sin datos se muestran como cortes.</p>
        </div>
        <div aria-label="Leyenda del gráfico" className="flex max-w-full flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          {[...model.grouped.keys()].sort().map((name) => (
            <span className="inline-flex min-w-0 items-center gap-1.5" key={name}>
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: occupancySeriesColor(name) }} />
              <span className="break-words [overflow-wrap:anywhere]">{mode === "physical" ? physicalOccupancyDisplayLabel(name) : name}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 max-w-full overflow-x-auto rounded-lg border border-[#e4edf4] bg-white">
        <svg
          aria-describedby="occupancy-chart-description"
          aria-label={`Evolución temporal de vehículos ocupados, vista ${mode === "physical" ? "física" : "comercial"}`}
          className="h-auto min-w-[760px]"
          role="img"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          <desc id="occupancy-chart-description">Cada línea representa un estacionamiento seleccionado. Las interrupciones indican fechas sin datos.</desc>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = margin.top + model.plotHeight - ratio * model.plotHeight;
            return (
              <g key={ratio}>
                <line stroke="#e4edf4" x1={margin.left} x2={margin.left + model.plotWidth} y1={y} y2={y} />
                <text fill="#64748b" fontSize="11" textAnchor="end" x={margin.left - 8} y={y + 4}>{formatInteger(model.yMax * ratio)}</text>
              </g>
            );
          })}
          {model.ticks.map((tick) => {
            const x = model.x(tick.date);
            return <text fill="#64748b" fontSize="10" key={tick.date} textAnchor="middle" x={x} y={chartHeight - 14}>{tick.label}</text>;
          })}

          {todayX !== null ? (
            <g>
              <line stroke="#dc2626" strokeWidth="1.5" x1={todayX} x2={todayX} y1={margin.top} y2={margin.top + model.plotHeight} />
              <rect fill="#fff" height="18" stroke="#dc2626" width="78" x={Math.min(chartWidth - 84, Math.max(4, todayX - 39))} y="7" />
              <text fill="#b91c1c" fontSize="10" fontWeight="600" textAnchor="middle" x={Math.min(chartWidth - 45, Math.max(43, todayX))} y="19">Hoy {displayDate(today)}</text>
            </g>
          ) : null}

          {[...model.grouped.entries()].flatMap(([name, seriesRows]) => {
            const color = occupancySeriesColor(name);
            const segments = splitOccupancyDailySegments(seriesRows);
            return [
              ...segments.map((segment, index) => (
                <path
                  d={segment.map((row, rowIndex) => `${rowIndex === 0 ? "M" : "L"} ${model.x(row.fecha)} ${model.y(row.occupied)}`).join(" ")}
                  fill="none"
                  key={`${name}-segment-${index}`}
                  stroke={color}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              )),
              ...seriesRows.map((row) => {
                const x = model.x(row.fecha);
                const y = model.y(row.occupied);
                const point = {
                  capacity: mode === "physical" ? (row as PhysicalOccupancyRow).capacity : null,
                  fecha: row.fecha,
                  name,
                  occupancyPercentage: mode === "physical" ? (row as PhysicalOccupancyRow).occupancy_percentage : null,
                  occupied: row.occupied,
                  revenue: row.revenue_ocupacion,
                  x,
                  y,
                };
                return (
                  <circle
                    aria-label={`${mode === "physical" ? physicalOccupancyDisplayLabel(name) : name}, ${displayDate(row.fecha)}, ${formatInteger(row.occupied)} ocupados`}
                    className="cursor-pointer opacity-0 transition hover:opacity-100 focus:opacity-100 focus:outline-none"
                    cx={x}
                    cy={y}
                    fill={color}
                    key={`${name}-${row.fecha}`}
                    onBlur={() => setTooltip(null)}
                    onClick={() => setTooltip(point)}
                    onFocus={() => setTooltip(point)}
                    onMouseEnter={() => setTooltip(point)}
                    onMouseLeave={() => setTooltip(null)}
                    r="4"
                    role="button"
                    tabIndex={0}
                  />
                );
              }),
            ];
          })}

          {tooltip ? (
            <g pointerEvents="none">
              <rect fill="#102f43" height={mode === "physical" ? 78 : 64} rx="4" width="236" x={Math.min(chartWidth - 244, Math.max(8, tooltip.x + 8))} y={Math.max(8, tooltip.y - (mode === "physical" ? 86 : 72))} />
              <text fill="#fff" fontSize="11" x={Math.min(chartWidth - 236, Math.max(16, tooltip.x + 16))} y={Math.max(24, tooltip.y - (mode === "physical" ? 68 : 54))}>{mode === "physical" ? physicalOccupancyDisplayLabel(tooltip.name) : tooltip.name}</text>
              <text fill="#dbeafe" fontSize="10" x={Math.min(chartWidth - 236, Math.max(16, tooltip.x + 16))} y={Math.max(39, tooltip.y - (mode === "physical" ? 53 : 39))}>{displayDate(tooltip.fecha)} · {formatInteger(tooltip.occupied)} ocupados</text>
              <text fill="#dbeafe" fontSize="10" x={Math.min(chartWidth - 236, Math.max(16, tooltip.x + 16))} y={Math.max(54, tooltip.y - (mode === "physical" ? 38 : 24))}>
                {mode === "physical"
                  ? `Capacidad ${formatInteger(tooltip.capacity)} · Ocupación ${formatTooltipPercentage(tooltip.occupancyPercentage)}`
                  : `Revenue de ocupación: ${formatCurrency(tooltip.revenue)}`}
              </text>
              {mode === "physical" ? (
                <text fill="#dbeafe" fontSize="10" x={Math.min(chartWidth - 236, Math.max(16, tooltip.x + 16))} y={Math.max(69, tooltip.y - 23)}>
                  Revenue de ocupación: {formatCurrency(tooltip.revenue)}
                </text>
              ) : null}
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}
