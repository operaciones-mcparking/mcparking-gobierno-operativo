"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { buildPhysicalOccupancyDisplayRows, physicalOccupancyDisplayLabel, type CommercialOccupancyRow, type OperationalOccupancyReadModel, type PhysicalOccupancyRow } from "@/lib/dashboard/ocupacion";
import {
  availableOccupancyParkingNames,
  emptyOccupancyParkingSelection,
  mergeOccupancyParkingSelection,
  occupancySelectionStorageKey,
  parseOccupancyParkingSelection,
  selectedAvailableOccupancyParkings,
  type OccupancyParkingSelection,
} from "@/lib/dashboard/ocupacion-selection";
import { OperationalOccupancyChart } from "./operational-occupancy-chart";
import { OperationalOccupancyRevenueHeatmap } from "./operational-occupancy-revenue-heatmap";

type OccupancyMode = "physical" | "commercial";

type OperationalOccupancySectionProps = {
  data: OperationalOccupancyReadModel | null;
  error: string | null;
  heatmapData: OperationalOccupancyReadModel | null;
  heatmapError: string | null;
  heatmapIsLoading: boolean;
  heatmapYear: number;
  heatmapYears: number[];
  isLoading: boolean;
  onHeatmapYearChange: (year: number) => void;
  today: string;
  trendData: OperationalOccupancyReadModel | null;
  trendError: string | null;
  trendIsLoading: boolean;
};

function parkingName(row: PhysicalOccupancyRow | CommercialOccupancyRow, mode: OccupancyMode) {
  return mode === "physical" ? (row as PhysicalOccupancyRow).parking_fisico : (row as CommercialOccupancyRow).parking_comercial;
}

function parkingLabel(parking: string, mode: OccupancyMode) {
  return mode === "physical" ? physicalOccupancyDisplayLabel(parking) : parking;
}

export function OperationalOccupancySection({ data, error, heatmapData, heatmapError, heatmapIsLoading, heatmapYear, heatmapYears, isLoading, onHeatmapYearChange, today, trendData, trendError, trendIsLoading }: OperationalOccupancySectionProps) {
  const [mode, setMode] = useState<OccupancyMode>("physical");
  const [selection, setSelection] = useState<OccupancyParkingSelection>(emptyOccupancyParkingSelection);
  const [storageReady, setStorageReady] = useState(false);
  const storageLoadedRef = useRef(false);

  const displayRows = useMemo(() => ({
    physical: buildPhysicalOccupancyDisplayRows(data?.physical ?? []),
    commercial: data?.commercial ?? [],
  }), [data]);

  const available = useMemo(() => availableOccupancyParkingNames({
    physical: displayRows.physical.map((row) => row.parking_fisico),
    commercial: displayRows.commercial.map((row) => row.parking_comercial),
  }), [displayRows]);
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
    const source = mode === "physical" ? displayRows.physical : displayRows.commercial;
    return source
      .filter((row) => selected.has(parkingName(row, mode)))
      .sort((left, right) => left.fecha.localeCompare(right.fecha) || parkingName(left, mode).localeCompare(parkingName(right, mode)));
  }, [displayRows, mode, selected]);
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
          <p className="mt-1 text-sm text-slate-600">Tendencia y revenue diario de los estacionamientos seleccionados.</p>
        </div>
        <div aria-label="Nivel de ocupación" className="inline-flex w-fit rounded-lg border border-[#cbd8e3] bg-[#f8fbfd] p-1" role="group">
          {(["physical", "commercial"] as const).map((value) => (
            <button
              aria-label={value === "physical" ? "Agregado" : "Por canal"}
              aria-pressed={mode === value}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sea ${mode === value ? "bg-navy text-white" : "text-slate-600 hover:bg-white"}`}
              key={value}
              onClick={() => setMode(value)}
              type="button"
            >
              {value === "physical" ? "Agregado" : "Por canal"}
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
                title={parkingLabel(parking, mode)}
                type="button"
              >
                <span className="break-words [overflow-wrap:anywhere]">{parkingLabel(parking, mode)}</span>
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
          <OperationalOccupancyRevenueHeatmap
            data={heatmapData}
            error={heatmapError}
            isLoading={heatmapIsLoading}
            mode={mode}
            onYearChange={onHeatmapYearChange}
            selected={selected}
            year={heatmapYear}
            years={heatmapYears}
          />
        </>
      ) : null}
    </section>
  );
}
