"use client";

import { useEffect, useMemo, useState } from "react";

import { buildPhysicalOccupancyDisplayRows, physicalOccupancyDisplayLabel, type OperationalOccupancyReadModel } from "@/lib/dashboard/ocupacion";
import {
  buildOccupancyPercentageHeatmap,
  buildOccupancyRevenueHeatmap,
  buildYearCalendar,
  getOccupancyPercentageIntensity,
  getRevenueIntensity,
  type OccupancyHeatmapMetric,
  type OccupancyHeatmapMode,
} from "@/lib/dashboard/ocupacion-heatmap";
import { formatCurrency } from "./dashboard-operacional-formatters";

const monthFormatter = new Intl.DateTimeFormat("es-CL", { month: "long", timeZone: "UTC" });
const numberFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const percentageFormatter = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const intensityClasses = [
  "border-[#dce5eb] bg-[#f5f8fa] text-slate-500",
  "border-[#cbe6e1] bg-[#e8f5f2] text-[#245c55]",
  "border-[#9ed5ca] bg-[#ccebe5] text-[#174f48]",
  "border-[#62bcae] bg-[#8fd8cc] text-[#103f3a]",
  "border-[#269b89] bg-[#43b9a5] text-white",
  "border-[#087466] bg-[#087466] text-white",
] as const;

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function displayName(name: string, mode: OccupancyHeatmapMode) {
  return mode === "physical" ? physicalOccupancyDisplayLabel(name) : name;
}

export function OperationalOccupancyRevenueHeatmap({
  data,
  error,
  isLoading,
  mode,
  onYearChange,
  selected,
  year,
  years,
}: {
  data: OperationalOccupancyReadModel | null;
  error: string | null;
  isLoading: boolean;
  mode: OccupancyHeatmapMode;
  onYearChange: (year: number) => void;
  selected: ReadonlySet<string>;
  year: number;
  years: number[];
}) {
  const [metric, setMetric] = useState<OccupancyHeatmapMetric>("revenue");

  useEffect(() => {
    if (mode === "commercial" && metric === "occupancy") setMetric("revenue");
  }, [metric, mode]);

  const physicalRows = useMemo(() => data ? buildPhysicalOccupancyDisplayRows(data.physical) : [], [data]);
  const revenueDays = useMemo(() => {
    if (!data) return [];
    const rows = mode === "physical" ? physicalRows : data.commercial;
    return buildOccupancyRevenueHeatmap(rows, year, mode, selected);
  }, [data, mode, physicalRows, selected, year]);
  const occupancyDays = useMemo(
    () => buildOccupancyPercentageHeatmap(physicalRows, year, selected),
    [physicalRows, selected, year],
  );
  const maximumRevenue = Math.max(0, ...revenueDays.flatMap((day) => day.total === null ? [] : [day.total]));
  const calendar = buildYearCalendar(year);
  const days = metric === "revenue" ? revenueDays : occupancyDays;

  return (
    <div className="mt-7 min-w-0 border-t border-[#e4edf4] pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-navy">{metric === "revenue" ? "Revenue de ocupación por día" : "% de ocupación por día"}</h3>
          <p className="mt-1 text-xs text-slate-500">{metric === "revenue" ? "Suma diaria de las series seleccionadas." : "Porcentaje ponderado por la capacidad física seleccionada."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div aria-label="Métrica del mapa de calor" className="inline-flex w-fit rounded-lg border border-[#cbd8e3] bg-[#f8fbfd] p-1" role="group">
            {(["revenue", "occupancy"] as const).map((value) => {
              const disabled = value === "occupancy" && mode === "commercial";
              return (
                <button
                  aria-pressed={metric === value}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea ${metric === value ? "bg-navy text-white" : "text-slate-600 hover:bg-white"} disabled:cursor-not-allowed disabled:opacity-40`}
                  disabled={disabled}
                  key={value}
                  onClick={() => setMetric(value)}
                  type="button"
                >
                  {value === "revenue" ? "Revenue" : "% de ocupación"}
                </button>
              );
            })}
          </div>
          <div aria-label="Año del mapa de calor" className="inline-flex w-fit flex-wrap rounded-lg border border-[#cbd8e3] bg-[#f8fbfd] p-1" role="group">
            {years.map((value) => (
              <button
                aria-pressed={year === value}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea ${year === value ? "bg-navy text-white" : "text-slate-600 hover:bg-white"}`}
                key={value}
                onClick={() => onYearChange(value)}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">El porcentaje de ocupación corresponde a la capacidad física y está disponible en Agregado.</p>

      {isLoading ? <p className="mt-4 rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4 text-sm text-slate-600">Cargando datos anuales...</p> : null}
      {!isLoading && error ? <p className="mt-4 rounded-lg border border-[#ffd4a3] bg-[#fff8ef] p-4 text-sm font-medium text-[#8a4a00]">{error}</p> : null}
      {!isLoading && !error && data ? (
        <>
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 12 }, (_, month) => {
              const monthDays = days.filter((day) => day.month === month);
              const firstDate = calendar.find((day) => day.month === month);
              const leading = firstDate ? (firstDate.weekday + 6) % 7 : 0;
              return (
                <section className="min-w-0 rounded-lg border border-[#e4edf4] bg-white p-3" key={month}>
                  <h4 className="text-xs font-semibold capitalize text-navy">{monthFormatter.format(new Date(Date.UTC(year, month, 1)))}</h4>
                  <div aria-hidden="true" className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
                    {["L", "M", "X", "J", "V", "S", "D"].map((label) => <span key={label}>{label}</span>)}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {Array.from({ length: leading }, (_, index) => <span aria-hidden="true" key={`empty-${index}`} />)}
                    {monthDays.map((day) => {
                      const revenueDay = metric === "revenue" ? day as (typeof revenueDays)[number] : null;
                      const occupancyDay = metric === "occupancy" ? day as (typeof occupancyDays)[number] : null;
                      const intensity = revenueDay
                        ? getRevenueIntensity(revenueDay.total, maximumRevenue)
                        : getOccupancyPercentageIntensity(occupancyDay?.percentage ?? null);
                      const revenueLabel = formatCurrency(revenueDay?.total ?? null);
                      const occupancyLabel = occupancyDay?.percentage === null || occupancyDay?.percentage === undefined
                        ? "No disponible"
                        : `${percentageFormatter.format(occupancyDay.percentage)}%`;
                      return (
                        <div className="group relative min-w-0" key={day.date}>
                          <button
                            aria-label={`${displayDate(day.date)}, ${metric === "revenue" ? `Revenue de ocupación: ${revenueLabel}` : `Ocupación agregada: ${occupancyLabel}`}`}
                            className={`aspect-square w-full rounded border text-[10px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea ${intensityClasses[intensity]}`}
                            type="button"
                          >
                            {day.day}
                          </button>
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded bg-navy p-3 text-left text-xs text-white shadow-lg group-hover:block group-focus-within:block">
                            <p className="font-semibold">{displayDate(day.date)}</p>
                            {revenueDay ? <p className="mt-1">Revenue de ocupación: {revenueLabel}</p> : null}
                            {occupancyDay ? (
                              <>
                                <p className="mt-1">Ocupación agregada: {occupancyLabel}</p>
                                {occupancyDay.percentage !== null ? (
                                  <>
                                    <p>Ocupados: {numberFormatter.format(occupancyDay.occupied ?? 0)}</p>
                                    <p>Capacidad: {numberFormatter.format(occupancyDay.capacity ?? 0)}</p>
                                  </>
                                ) : null}
                              </>
                            ) : null}
                            {revenueDay && revenueDay.breakdown.length > 1 ? (
                              <div className="mt-2 border-t border-white/20 pt-2">
                                {revenueDay.breakdown.map((item) => <p className="break-words" key={item.name}>{displayName(item.name, mode)}: {formatCurrency(item.revenue)}</p>)}
                              </div>
                            ) : null}
                            {occupancyDay && occupancyDay.breakdown.length > 1 ? (
                              <div className="mt-2 border-t border-white/20 pt-2">
                                {occupancyDay.breakdown.map((item) => <p className="break-words" key={item.name}>{displayName(item.name, mode)}: {numberFormatter.format(item.occupied)} / {numberFormatter.format(item.capacity)} = {percentageFormatter.format(item.percentage)}%</p>)}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <div aria-label={metric === "revenue" ? "Escala de revenue" : "Escala de porcentaje de ocupación"} className="mt-4 flex items-center justify-end gap-2 text-xs text-slate-500">
            <span>Menor</span>
            {intensityClasses.slice(1).map((className, index) => <span aria-hidden="true" className={`h-3 w-5 rounded-sm border ${className}`} key={index} />)}
            <span>Mayor</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
