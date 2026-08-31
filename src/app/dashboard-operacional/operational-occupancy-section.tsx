"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CommercialOccupancyRow, OperationalOccupancyReadModel, PhysicalOccupancyRow } from "@/lib/dashboard/ocupacion";
import {
  availableOccupancyParkingNames,
  emptyOccupancyParkingSelection,
  mergeOccupancyParkingSelection,
  occupancySelectionStorageKey,
  parseOccupancyParkingSelection,
  selectedAvailableOccupancyParkings,
  type OccupancyParkingSelection,
} from "@/lib/dashboard/ocupacion-selection";
import { formatCurrency, formatDate, formatInteger } from "./dashboard-operacional-formatters";
import { OperationalOccupancyChart } from "./operational-occupancy-chart";

type OccupancyMode = "physical" | "commercial";

type OperationalOccupancySectionProps = {
  data: OperationalOccupancyReadModel | null;
  error: string | null;
  isLoading: boolean;
  today: string;
  trendData: OperationalOccupancyReadModel | null;
  trendError: string | null;
  trendIsLoading: boolean;
};

const percentageFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

function formatPhysicalPercentage(row: PhysicalOccupancyRow) {
  if (row.capacity === null || row.capacity <= 0 || row.occupancy_percentage === null) return "No disponible";
  return `${percentageFormatter.format(row.occupancy_percentage)}%`;
}

function parkingName(row: PhysicalOccupancyRow | CommercialOccupancyRow, mode: OccupancyMode) {
  return mode === "physical" ? (row as PhysicalOccupancyRow).parking_fisico : (row as CommercialOccupancyRow).parking_comercial;
}

function OccupancyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-navy">{value}</dd>
    </div>
  );
}

export function OperationalOccupancySection({ data, error, isLoading, today, trendData, trendError, trendIsLoading }: OperationalOccupancySectionProps) {
  const [mode, setMode] = useState<OccupancyMode>("physical");
  const [selection, setSelection] = useState<OccupancyParkingSelection>(emptyOccupancyParkingSelection);
  const [storageReady, setStorageReady] = useState(false);
  const storageLoadedRef = useRef(false);

  const available = useMemo(() => availableOccupancyParkingNames({
    physical: (data?.physical ?? []).map((row) => row.parking_fisico),
    commercial: (data?.commercial ?? []).map((row) => row.parking_comercial),
  }), [data]);
  useEffect(() => {
    setSelection((current) => {
      const saved = storageLoadedRef.current
        ? current
        : parseOccupancyParkingSelection(window.localStorage.getItem(occupancySelectionStorageKey));
      storageLoadedRef.current = true;
      return mergeOccupancyParkingSelection(available, saved);
    });
    setStorageReady(true);
  }, [available]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(occupancySelectionStorageKey, JSON.stringify(selection));
  }, [selection, storageReady]);

  const selected = useMemo(() => new Set(selectedAvailableOccupancyParkings(available[mode], selection[mode].selected)), [available, mode, selection]);
  const rows = useMemo(() => {
    const source = mode === "physical" ? (data?.physical ?? []) : (data?.commercial ?? []);
    return source
      .filter((row) => selected.has(parkingName(row, mode)))
      .sort((left, right) => left.fecha.localeCompare(right.fecha) || parkingName(left, mode).localeCompare(parkingName(right, mode)));
  }, [data, mode, selected]);
  const maxOccupied = rows.reduce((maximum, row) => Math.max(maximum, row.occupied), 0);

  const toggleParking = (parking: string) => {
    setSelection((current) => {
      const selectedValues = new Set(current[mode].selected);
      if (selectedValues.has(parking)) selectedValues.delete(parking);
      else selectedValues.add(parking);
      return { ...current, [mode]: { ...current[mode], selected: [...selectedValues].sort() } };
    });
  };

  return (
    <section className="mt-5 rounded-2xl border border-[#d6e1ea] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-navy">Ocupación</h2>
          <p className="mt-1 text-sm text-slate-600">Evolución diaria para el período seleccionado.</p>
        </div>
        <div aria-label="Nivel de ocupación" className="inline-flex w-fit rounded-lg border border-[#cbd8e3] bg-[#f8fbfd] p-1" role="group">
          {(["physical", "commercial"] as const).map((value) => (
            <button
              aria-pressed={mode === value}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea ${mode === value ? "bg-navy text-white" : "text-slate-600 hover:bg-white"}`}
              key={value}
              onClick={() => setMode(value)}
              type="button"
            >
              {value === "physical" ? "Físico" : "Comercial"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <p className="mt-5 rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4 text-sm text-slate-600">Cargando ocupación...</p> : null}
      {!isLoading && error ? <p className="mt-5 rounded-lg border border-[#ffd4a3] bg-[#fff8ef] p-4 text-sm font-medium text-[#8a4a00]">{error}</p> : null}
      {!isLoading && !error && data ? (
        <>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Filtros de estacionamiento">
            {available[mode].map((parking) => (
              <button
                aria-pressed={selected.has(parking)}
                className={`max-w-full rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea ${selected.has(parking) ? "border-navy bg-navy text-white" : "border-[#cbd8e3] bg-white text-slate-600 hover:bg-[#f8fbfd]"}`}
                key={parking}
                onClick={() => toggleParking(parking)}
                title={parking}
                type="button"
              >
                <span className="break-words [overflow-wrap:anywhere]">{parking}</span>
              </button>
            ))}
          </div>

          {!storageReady ? <p className="mt-5 text-sm text-slate-600">Preparando filtros...</p> : null}
          {storageReady && available[mode].length === 0 ? <p className="mt-5 rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4 text-sm text-slate-600">No hay datos de ocupación para el período seleccionado.</p> : null}
          {storageReady && available[mode].length > 0 && rows.length === 0 ? <p className="mt-5 rounded-lg border border-[#e4edf4] bg-[#f8fbfd] p-4 text-sm text-slate-600">Selecciona al menos un estacionamiento para visualizar su ocupación.</p> : null}

          <OperationalOccupancyChart
            data={trendData}
            error={trendError}
            isLoading={trendIsLoading}
            mode={mode}
            selected={selected}
            today={today}
          />
          {rows.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-navy">Evolución diaria</h3>
              <div className="mt-3 hidden max-h-[32rem] overflow-y-auto md:block">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-[#f8fbfd] text-xs uppercase text-slate-500">
                    <tr>
                      <th className="w-24 px-3 py-2 font-semibold">Fecha</th>
                      <th className="px-3 py-2 font-semibold">Estacionamiento</th>
                      <th className="w-44 px-3 py-2 font-semibold">Ocupados</th>
                      {mode === "physical" ? <th className="w-28 px-3 py-2 font-semibold">Capacidad</th> : null}
                      {mode === "physical" ? <th className="w-28 px-3 py-2 font-semibold">Ocupación</th> : null}
                      <th className="w-36 px-3 py-2 font-semibold">Ingreso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr className="border-b border-[#e4edf4] last:border-b-0" key={`${row.fecha}-${parkingName(row, mode)}`}>
                        <td className="px-3 py-3">{formatDate(row.fecha)}</td>
                        <td className="min-w-0 px-3 py-3"><span className="break-words font-medium text-navy [overflow-wrap:anywhere]">{parkingName(row, mode)}</span>{mode === "commercial" ? <span className="block break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{(row as CommercialOccupancyRow).parking_fisico}</span> : null}</td>
                        <td className="px-3 py-3"><span className="font-semibold text-navy">{formatInteger(row.occupied)}</span><span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[#dce8ef]"><span className="block h-full rounded-full bg-sea" style={{ width: `${maxOccupied > 0 ? Math.max(2, (row.occupied / maxOccupied) * 100) : 0}%` }} /></span></td>
                        {mode === "physical" ? <td className="px-3 py-3">{formatInteger((row as PhysicalOccupancyRow).capacity)}</td> : null}
                        {mode === "physical" ? <td className="px-3 py-3">{formatPhysicalPercentage(row as PhysicalOccupancyRow)}</td> : null}
                        <td className="px-3 py-3">{formatCurrency(row.revenue_ocupacion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 grid max-h-[32rem] gap-3 overflow-y-auto md:hidden">
                {rows.map((row) => (
                  <article className="min-w-0 rounded-lg border border-[#e4edf4] p-4" key={`${row.fecha}-${parkingName(row, mode)}`}>
                    <p className="text-xs font-medium text-slate-500">{formatDate(row.fecha)}</p>
                    <h4 className="mt-1 break-words text-sm font-semibold text-navy [overflow-wrap:anywhere]">{parkingName(row, mode)}</h4>
                    {mode === "commercial" ? <p className="mt-1 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">Recinto físico: {(row as CommercialOccupancyRow).parking_fisico}</p> : null}
                    <dl className="mt-3 grid grid-cols-2 gap-3">
                      <OccupancyMetric label="Ocupados" value={formatInteger(row.occupied)} />
                      {mode === "physical" ? <OccupancyMetric label="Capacidad" value={formatInteger((row as PhysicalOccupancyRow).capacity)} /> : null}
                      {mode === "physical" ? <OccupancyMetric label="Ocupación" value={formatPhysicalPercentage(row as PhysicalOccupancyRow)} /> : null}
                      <OccupancyMetric label="Ingreso atribuible" value={formatCurrency(row.revenue_ocupacion)} />
                    </dl>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
