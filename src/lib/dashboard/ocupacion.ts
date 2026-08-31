export type OccupancySystemGroup = "MCP" | "OKP" | "NP";

export type PhysicalOccupancyRow = {
  fecha: string;
  sistema_grupo: OccupancySystemGroup;
  parking_fisico: string;
  occupied: number;
  capacity: number | null;
  occupancy_percentage: number | null;
  revenue_ocupacion: number | null;
  fuente_capacidad: string | null;
  estado_capacidad: string | null;
  tipo_operacion_fisica: string | null;
  calculated_at: string | null;
};

export type CommercialOccupancyRow = {
  fecha: string;
  sistema_grupo: OccupancySystemGroup;
  parking_comercial: string;
  parking_fisico: string;
  occupied: number;
  revenue_ocupacion: number | null;
  tipo_operacion_fisica: string | null;
  aporta_ocupacion_fisica: boolean;
  calculated_at: string | null;
};

export type OperationalOccupancyReadModel = {
  filters: { from: string; to: string };
  physical: PhysicalOccupancyRow[];
  commercial: CommercialOccupancyRow[];
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const numericStringPattern = /^-?(?:\d+|\d*\.\d+)$/;

export const occupancyRpcPageSize = 1000;

export async function collectOccupancyRpcPages<T>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[] | null> {
  const rows: T[] = [];

  for (let from = 0; ; from += occupancyRpcPageSize) {
    const page = await loadPage(from, from + occupancyRpcPageSize - 1);
    if (page.error || !Array.isArray(page.data)) return null;
    rows.push(...page.data);
    if (page.data.length < occupancyRpcPageSize) return rows;
  }
}

export const okpTotalParkingName = "OKP TOTAL";
export const mcpPhysicalParkingName = "MC PARKING VESPUCIO";

export function physicalOccupancyDisplayLabel(parking: string) {
  if (parking === mcpPhysicalParkingName) return "MCP + EAP";
  if (parking === okpTotalParkingName) return "RCL + EXP";
  return parking;
}

export function buildPhysicalOccupancyDisplayRows(rows: PhysicalOccupancyRow[]): PhysicalOccupancyRow[] {
  const visibleRows = rows.filter((row) => row.sistema_grupo !== "OKP");
  const okpByDate = new Map<string, PhysicalOccupancyRow[]>();
  for (const row of rows) {
    if (row.sistema_grupo !== "OKP") continue;
    okpByDate.set(row.fecha, [...(okpByDate.get(row.fecha) ?? []), row]);
  }

  const okpRows = [...okpByDate.entries()].map(([fecha, dateRows]) => {
    const occupied = dateRows.reduce((total, row) => total + row.occupied, 0);
    const capacities = dateRows.flatMap((row) => row.capacity === null ? [] : [row.capacity]);
    const capacity = capacities.length > 0 ? capacities.reduce((total, value) => total + value, 0) : null;
    const revenues = dateRows.flatMap((row) => row.revenue_ocupacion === null ? [] : [row.revenue_ocupacion]);
    const revenue = revenues.length > 0 ? revenues.reduce((total, value) => total + value, 0) : null;
    return {
      fecha,
      sistema_grupo: "OKP" as const,
      parking_fisico: okpTotalParkingName,
      occupied,
      capacity,
      occupancy_percentage: capacity !== null && capacity > 0 ? (occupied / capacity) * 100 : null,
      revenue_ocupacion: revenue,
      fuente_capacidad: null,
      estado_capacidad: null,
      tipo_operacion_fisica: null,
      calculated_at: null,
    };
  });

  const systemOrder: Record<OccupancySystemGroup, number> = { MCP: 0, OKP: 1, NP: 2 };
  return [...visibleRows, ...okpRows].sort((left, right) =>
    left.fecha.localeCompare(right.fecha)
    || systemOrder[left.sistema_grupo] - systemOrder[right.sistema_grupo]
    || left.parking_fisico.localeCompare(right.parking_fisico));
}
export function sumOccupancyRevenueForRange(
  rows: PhysicalOccupancyRow[],
  parking: string,
  from: string,
  to: string,
) {
  const revenues = rows.flatMap((row) =>
    row.parking_fisico === parking
      && from <= row.fecha
      && row.fecha <= to
      && row.revenue_ocupacion !== null
      ? [row.revenue_ocupacion]
      : []);
  return revenues.length > 0 ? revenues.reduce((total, revenue) => total + revenue, 0) : null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isValidOccupancyDate(value: unknown): value is string {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function requiredText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function nullableText(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" ? value : undefined;
}

function occupancySystemGroup(value: unknown): OccupancySystemGroup | null {
  return value === "MCP" || value === "OKP" || value === "NP" ? value : null;
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !numericStringPattern.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function nullableOccupancyNumber(value: unknown): number | null | undefined {
  return value === null ? null : numericValue(value);
}

function normalizePhysicalRow(value: unknown): PhysicalOccupancyRow | null {
  if (!isRecord(value) || !isValidOccupancyDate(value.fecha)) return null;
  const sistemaGrupo = occupancySystemGroup(value.sistema_grupo);
  const parkingFisico = requiredText(value.parking_fisico);
  const occupied = numericValue(value.occupied);
  const capacity = nullableOccupancyNumber(value.capacity);
  const occupancyPercentage = nullableOccupancyNumber(value.occupancy_percentage);
  const revenue = nullableOccupancyNumber(value.revenue_ocupacion);
  const fuenteCapacidad = nullableText(value.fuente_capacidad);
  const estadoCapacidad = nullableText(value.estado_capacidad);
  const tipoOperacion = nullableText(value.tipo_operacion_fisica);
  const calculatedAt = nullableText(value.calculated_at);
  if (!sistemaGrupo || !parkingFisico || occupied === undefined || capacity === undefined || occupancyPercentage === undefined || revenue === undefined || fuenteCapacidad === undefined || estadoCapacidad === undefined || tipoOperacion === undefined || calculatedAt === undefined) return null;
  return { fecha: value.fecha, sistema_grupo: sistemaGrupo, parking_fisico: parkingFisico, occupied, capacity, occupancy_percentage: occupancyPercentage, revenue_ocupacion: revenue, fuente_capacidad: fuenteCapacidad, estado_capacidad: estadoCapacidad, tipo_operacion_fisica: tipoOperacion, calculated_at: calculatedAt };
}

function normalizeCommercialRow(value: unknown): CommercialOccupancyRow | null {
  if (!isRecord(value) || !isValidOccupancyDate(value.fecha)) return null;
  const sistemaGrupo = occupancySystemGroup(value.sistema_grupo);
  const parkingComercial = requiredText(value.parking_comercial);
  const parkingFisico = requiredText(value.parking_fisico);
  const occupied = numericValue(value.occupied);
  const revenue = nullableOccupancyNumber(value.revenue_ocupacion);
  const tipoOperacion = nullableText(value.tipo_operacion_fisica);
  const calculatedAt = nullableText(value.calculated_at);
  if (!sistemaGrupo || !parkingComercial || !parkingFisico || occupied === undefined || revenue === undefined || tipoOperacion === undefined || typeof value.aporta_ocupacion_fisica !== "boolean" || calculatedAt === undefined) return null;
  return { fecha: value.fecha, sistema_grupo: sistemaGrupo, parking_comercial: parkingComercial, parking_fisico: parkingFisico, occupied, revenue_ocupacion: revenue, tipo_operacion_fisica: tipoOperacion, aporta_ocupacion_fisica: value.aporta_ocupacion_fisica, calculated_at: calculatedAt };
}

function normalizeRows<T>(value: unknown, normalize: (row: unknown) => T | null, key: (row: T) => string): T[] | null {
  if (!Array.isArray(value)) return null;
  const rows: T[] = [];
  const keys = new Set<string>();
  for (const valueRow of value) {
    const row = normalize(valueRow);
    if (!row) return null;
    const logicalKey = key(row);
    if (keys.has(logicalKey)) return null;
    keys.add(logicalKey);
    rows.push(row);
  }
  return rows;
}

export function buildOperationalOccupancyReadModel(input: { from: string; to: string; physical: unknown; commercial: unknown }): OperationalOccupancyReadModel | null {
  if (!isValidOccupancyDate(input.from) || !isValidOccupancyDate(input.to) || input.from > input.to) return null;
  const physical = normalizeRows(input.physical, normalizePhysicalRow, (row) => `${row.fecha}\u0000${row.parking_fisico}`);
  const commercial = normalizeRows(input.commercial, normalizeCommercialRow, (row) => `${row.fecha}\u0000${row.parking_comercial}`);
  if (!physical || !commercial) return null;
  return { filters: { from: input.from, to: input.to }, physical, commercial };
}
