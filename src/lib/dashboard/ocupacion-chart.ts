import type { CommercialOccupancyRow, PhysicalOccupancyRow } from "./ocupacion";

export type OccupancyTrendRange = { from: string; to: string };
export type OccupancyTrendRow = PhysicalOccupancyRow | CommercialOccupancyRow;

const seriesPalette = ["#0f4c5c", "#2f7d8c", "#4464ad", "#7a5195", "#2d6a4f", "#b5651d", "#5c677d", "#9c6644"];
const fixedSeriesColors: Readonly<Record<string, string>> = {
  "MC PARKING VESPUCIO": "#023574",
  "OKP TOTAL": "#00d084",
};

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function getOccupancyTrendRange(today: string): OccupancyTrendRange {
  const [year, month] = today.split("-").map(Number);
  const from = new Date(Date.UTC(year, month - 5, 1));
  const to = new Date(Date.UTC(year, month + 2, 0));
  return { from: dateKey(from), to: dateKey(to) };
}

export function occupancySeriesColor(parking: string) {
  const fixedColor = fixedSeriesColors[parking];
  if (fixedColor) return fixedColor;

  let hash = 2166136261;
  for (const character of parking) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return seriesPalette[Math.abs(hash) % seriesPalette.length];
}

export function splitOccupancyDailySegments<T extends { fecha: string }>(rows: T[]) {
  const sorted = [...rows].sort((left, right) => left.fecha.localeCompare(right.fecha));
  const segments: T[][] = [];
  for (const row of sorted) {
    const current = segments.at(-1);
    if (!current) {
      segments.push([row]);
      continue;
    }
    const previousTime = Date.parse(`${current.at(-1)?.fecha}T00:00:00.000Z`);
    const currentTime = Date.parse(`${row.fecha}T00:00:00.000Z`);
    if (currentTime - previousTime > 86_400_000) segments.push([row]);
    else current.push(row);
  }
  return segments;
}
