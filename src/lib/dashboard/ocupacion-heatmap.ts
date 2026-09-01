import type { CommercialOccupancyRow, PhysicalOccupancyRow } from "./ocupacion";

export type OccupancyHeatmapMode = "physical" | "commercial";
export type OccupancyHeatmapMetric = "revenue" | "occupancy";
export type OccupancyHeatmapRow = PhysicalOccupancyRow | CommercialOccupancyRow;

export type OccupancyRevenueHeatmapDay = {
  date: string;
  day: number;
  month: number;
  total: number | null;
  breakdown: Array<{ name: string; revenue: number | null }>;
};

export type OccupancyPercentageHeatmapDay = {
  date: string;
  day: number;
  month: number;
  percentage: number | null;
  occupied: number | null;
  capacity: number | null;
  breakdown: Array<{ name: string; occupied: number; capacity: number; percentage: number }>;
};

export function occupancyHeatmapYears(currentYear: number, minimumYear = 2024) {
  return Array.from({ length: Math.max(0, currentYear - minimumYear + 1) }, (_, index) => minimumYear + index);
}

export function occupancyYearRange(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function buildYearCalendar(year: number) {
  const dates: Array<{ date: string; day: number; month: number; weekday: number }> = [];
  const cursor = new Date(Date.UTC(year, 0, 1));
  while (cursor.getUTCFullYear() === year) {
    dates.push({
      date: cursor.toISOString().slice(0, 10),
      day: cursor.getUTCDate(),
      month: cursor.getUTCMonth(),
      weekday: cursor.getUTCDay(),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function heatmapSeriesName(row: OccupancyHeatmapRow, mode: OccupancyHeatmapMode) {
  return mode === "physical"
    ? (row as PhysicalOccupancyRow).parking_fisico
    : (row as CommercialOccupancyRow).parking_comercial;
}

export function buildOccupancyRevenueHeatmap(
  rows: OccupancyHeatmapRow[],
  year: number,
  mode: OccupancyHeatmapMode,
  selected: ReadonlySet<string>,
) {
  const byDate = new Map<string, Map<string, number | null>>();
  for (const row of rows) {
    const name = heatmapSeriesName(row, mode);
    if (!selected.has(name) || !row.fecha.startsWith(`${year}-`)) continue;
    const day = byDate.get(row.fecha) ?? new Map<string, number | null>();
    day.set(name, row.revenue_ocupacion);
    byDate.set(row.fecha, day);
  }

  return buildYearCalendar(year).map(({ date, day, month }) => {
    const values = byDate.get(date);
    const breakdown = values
      ? [...selected].sort().map((name) => ({ name, revenue: values.get(name) ?? null }))
      : [];
    const available = breakdown.flatMap(({ revenue }) => revenue === null ? [] : [revenue]);
    return {
      date,
      day,
      month,
      breakdown,
      total: available.length > 0 ? available.reduce((total, revenue) => total + revenue, 0) : null,
    } satisfies OccupancyRevenueHeatmapDay;
  });
}

export type RevenueQuantileScale = { thresholds: number[] };

export function buildRevenueQuantileScale(values: Array<number | null>): RevenueQuantileScale {
  const sorted = values.flatMap((value) => value === null ? [] : [value]).sort((left, right) => left - right);
  if (sorted.length === 0) return { thresholds: [] };
  return {
    thresholds: Array.from({ length: 8 }, (_, index) => {
      const position = Math.ceil(((index + 1) * sorted.length) / 9) - 1;
      return sorted[Math.max(0, position)];
    }),
  };
}

export function getRevenueHeatmapLevel(value: number | null, scale: RevenueQuantileScale) {
  if (value === null) return 0;
  return 1 + scale.thresholds.filter((threshold) => value > threshold).length;
}

export function buildOccupancyPercentageHeatmap(
  rows: PhysicalOccupancyRow[],
  year: number,
  selected: ReadonlySet<string>,
) {
  const byDate = new Map<string, PhysicalOccupancyRow[]>();
  for (const row of rows) {
    if (!selected.has(row.parking_fisico) || !row.fecha.startsWith(`${year}-`)) continue;
    byDate.set(row.fecha, [...(byDate.get(row.fecha) ?? []), row]);
  }

  return buildYearCalendar(year).map(({ date, day, month }) => {
    const validRows = (byDate.get(date) ?? []).filter((row) => row.capacity !== null && row.capacity > 0);
    const occupied = validRows.length > 0 ? validRows.reduce((total, row) => total + row.occupied, 0) : null;
    const capacity = validRows.length > 0 ? validRows.reduce((total, row) => total + (row.capacity ?? 0), 0) : null;
    return {
      date,
      day,
      month,
      occupied,
      capacity,
      percentage: occupied !== null && capacity !== null && capacity > 0 ? (occupied / capacity) * 100 : null,
      breakdown: validRows
        .map((row) => ({
          name: row.parking_fisico,
          occupied: row.occupied,
          capacity: row.capacity as number,
          percentage: (row.occupied / (row.capacity as number)) * 100,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    } satisfies OccupancyPercentageHeatmapDay;
  });
}

export function getOccupancyHeatmapLevel(value: number | null) {
  if (value === null) return 0;
  return 1 + [20, 40, 55, 70, 80, 90, 100, 110].filter((threshold) => value > threshold).length;
}
