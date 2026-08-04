export type OperationalDashboardQuery = {
  date: string | null;
  from: string | null;
  parking_codigo: string | null;
  sistema_grupo: string | null;
  source_run_id: string | null;
  to: string | null;
};

export type OperationalDashboardLastUpdate = {
  calculated_at: string | null;
  composite_run_id: string;
  created_at: string;
  dashboard_job_id: string | null;
  error_message: string | null;
  estado: "pending" | "running" | "succeeded" | "failed";
  id: string;
  metric_version: string;
  packs_job_id: string | null;
  periodo_desde: string;
  periodo_hasta: string;
  reservas_job_id: string | null;
  rows_written: number;
  updated_at: string;
};

export type OperationalDashboardRow = {
  advanced_book_days_boleta_avg: number | null;
  advanced_book_days_pack_avg: number | null;
  advanced_book_days_total_avg: number | null;
  avg_order_value_boleta: number | null;
  calculated_at: string;
  created_at: string;
  dashboard_actualizacion_id: string | null;
  day: number;
  duration_stay_boleta_avg: number | null;
  duration_stay_pack_avg: number | null;
  duration_stay_total_avg: number | null;
  fecha: string;
  id: string;
  metric_version: string;
  month: number;
  pack_vendido_dbi: number;
  pack_vendido_precio_lista_avg: number | null;
  pack_vendido_precio_pagado_avg: number | null;
  pack_vendido_q: number;
  pack_vendido_venta: number;
  parking_codigo: string;
  parking_nombre: string;
  precio_lista_boleta_avg: number | null;
  precio_pagado_boleta_avg: number | null;
  quarter: number;
  reserva_boleta_dbi: number;
  reserva_boleta_q: number;
  reserva_boleta_venta: number;
  reserva_pack_dbi: number;
  reserva_pack_q: number;
  reserva_total_dbi: number;
  reserva_total_q: number;
  sistema_grupo: string;
  source_run_id: string;
  updated_at: string;
  venta_total_operacional: number;
  year: number;
};

export type OperationalDashboardFilters = OperationalDashboardQuery;

export type OperationalDashboardTotals = {
  advanced_book_days_boleta_avg: number | null;
  advanced_book_days_pack_avg: number | null;
  advanced_book_days_total_avg: number | null;
  avg_order_value_boleta: number | null;
  duration_stay_boleta_avg: number | null;
  duration_stay_pack_avg: number | null;
  duration_stay_total_avg: number | null;
  pack_vendido_dbi: number;
  pack_vendido_precio_lista_avg: number | null;
  pack_vendido_precio_pagado_avg: number | null;
  pack_vendido_q: number;
  pack_vendido_venta: number;
  precio_lista_boleta_avg: number | null;
  precio_pagado_boleta_avg: number | null;
  reserva_boleta_dbi: number;
  reserva_boleta_q: number;
  reserva_boleta_venta: number;
  reserva_pack_dbi: number;
  reserva_pack_q: number;
  reserva_total_dbi: number;
  reserva_total_q: number;
  venta_total_operacional: number;
};

export type OperationalDashboardTotalsByDate = OperationalDashboardTotals & { fecha: string };

export type OperationalDashboardMarketShare = {
  reserva_total_dbi: { MCP: number; OKP: number };
  reserva_total_q: { MCP: number; OKP: number };
  venta_total_operacional: { MCP: number; OKP: number };
};

export type OperationalDashboardViewModel = {
  filters: OperationalDashboardFilters | null;
  lastUpdate: OperationalDashboardLastUpdate | null;
  marketShare: OperationalDashboardMarketShare;
  rows: OperationalDashboardRow[];
  totals: OperationalDashboardTotals;
  totalsByDate: OperationalDashboardTotalsByDate[];
  totalsByGroup: Record<string, OperationalDashboardTotals>;
};

type LastUpdateState = OperationalDashboardLastUpdate["estado"];
type AverageField = (typeof averageFields)[number];
type SumField = (typeof sumFields)[number];

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const numericStringPattern = /^-?(?:\d+|\d*\.\d+)$/;
const lastUpdateStates = new Set<LastUpdateState>(["pending", "running", "succeeded", "failed"]);
const defaultGroups = ["MCP", "OKP", "OTRO"];

const sumFields = [
  "reserva_boleta_venta",
  "reserva_boleta_q",
  "reserva_boleta_dbi",
  "reserva_pack_q",
  "reserva_pack_dbi",
  "reserva_total_q",
  "reserva_total_dbi",
  "pack_vendido_venta",
  "pack_vendido_q",
  "pack_vendido_dbi",
  "venta_total_operacional",
] as const;

const averageFields = [
  "precio_lista_boleta_avg",
  "precio_pagado_boleta_avg",
  "avg_order_value_boleta",
  "pack_vendido_precio_pagado_avg",
  "pack_vendido_precio_lista_avg",
  "advanced_book_days_boleta_avg",
  "duration_stay_boleta_avg",
  "advanced_book_days_pack_avg",
  "duration_stay_pack_avg",
  "advanced_book_days_total_avg",
  "duration_stay_total_avg",
] as const;

const averageWeights: Record<AverageField, SumField> = {
  advanced_book_days_boleta_avg: "reserva_boleta_q",
  advanced_book_days_pack_avg: "reserva_pack_q",
  advanced_book_days_total_avg: "reserva_total_q",
  avg_order_value_boleta: "reserva_boleta_q",
  duration_stay_boleta_avg: "reserva_boleta_q",
  duration_stay_pack_avg: "reserva_pack_q",
  duration_stay_total_avg: "reserva_total_q",
  pack_vendido_precio_lista_avg: "pack_vendido_q",
  pack_vendido_precio_pagado_avg: "pack_vendido_q",
  precio_lista_boleta_avg: "reserva_boleta_q",
  precio_pagado_boleta_avg: "reserva_boleta_q",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const operationalParkingDisplayNames: Record<string, string> = {
  EAP: "Estacionamiento Aeropuerto",
  "ESTACIONAMIENTO AEROPUERTO": "Estacionamiento Aeropuerto",
  MCP: "McParking",
  "MC PARKING VESPUCIO": "McParking",
  OKP_EXP: "OKParking Express",
  "OK PARKING EXPRESS": "OKParking Express",
  OKP_RC: "OKParking Rio Clarillo",
  "OK PARKING RC": "OKParking Rio Clarillo",
};

export function displayOperationalParkingName(parkingCodigo: string | null | undefined, parkingNombre: string | null | undefined) {
  const codeKey = String(parkingCodigo ?? "").trim().toUpperCase();
  const nameKey = String(parkingNombre ?? "").trim().toUpperCase();
  return operationalParkingDisplayNames[codeKey] ?? operationalParkingDisplayNames[nameKey] ?? parkingNombre ?? "Sin estacionamiento";
}

function isSafeDate(value: unknown): value is string {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function finiteNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && numericStringPattern.test(value.trim())) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  const parsed = finiteNumber(value);
  return parsed === null ? undefined : parsed;
}

function requiredString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requiredTimestamp(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function requiredDate(row: Record<string, unknown>, key: string) {
  return isSafeDate(row[key]) ? row[key] : null;
}

function requiredUuid(row: Record<string, unknown>, key: string) {
  return isValidUuid(row[key]) ? row[key] : null;
}

function nullableUuid(row: Record<string, unknown>, key: string) {
  const value = row[key];
  if (value === null) return null;
  return isValidUuid(value) ? value : undefined;
}

function parseLastUpdate(value: unknown): OperationalDashboardLastUpdate | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  const id = requiredUuid(value, "id");
  const compositeRunId = requiredUuid(value, "composite_run_id");
  const reservasJobId = nullableUuid(value, "reservas_job_id");
  const packsJobId = nullableUuid(value, "packs_job_id");
  const dashboardJobId = nullableUuid(value, "dashboard_job_id");
  const estado = requiredString(value, "estado");
  const metadata = isRecord(value.metadata) ? value.metadata : null;
  const metadataPeriodoDesde = metadata ? requiredDate(metadata, "periodo_desde") : null;
  const metadataPeriodoHasta = metadata ? requiredDate(metadata, "periodo_hasta") : null;
  const periodoDesde = metadataPeriodoDesde ?? requiredDate(value, "periodo_desde");
  const periodoHasta = metadataPeriodoHasta ?? requiredDate(value, "periodo_hasta");
  const metricVersion = requiredString(value, "metric_version");
  const rowsWritten = finiteNumber(value.rows_written);
  const calculatedAt = value.calculated_at;
  const errorMessage = value.error_message;
  const createdAt = requiredTimestamp(value, "created_at");
  const updatedAt = requiredTimestamp(value, "updated_at");

  if (
    !id ||
    !compositeRunId ||
    reservasJobId === undefined ||
    packsJobId === undefined ||
    dashboardJobId === undefined ||
    !estado ||
    !lastUpdateStates.has(estado as LastUpdateState) ||
    !periodoDesde ||
    !periodoHasta ||
    !metricVersion ||
    rowsWritten === null ||
    !isStringOrNull(calculatedAt) ||
    !isStringOrNull(errorMessage) ||
    !createdAt ||
    !updatedAt
  ) {
    return undefined;
  }

  return {
    calculated_at: calculatedAt,
    composite_run_id: compositeRunId,
    created_at: createdAt,
    dashboard_job_id: dashboardJobId,
    error_message: errorMessage,
    estado: estado as LastUpdateState,
    id,
    metric_version: metricVersion,
    packs_job_id: packsJobId,
    periodo_desde: periodoDesde,
    periodo_hasta: periodoHasta,
    reservas_job_id: reservasJobId,
    rows_written: rowsWritten,
    updated_at: updatedAt,
  };
}

function parseFilters(value: unknown): OperationalDashboardFilters | null | undefined {
  if (value === undefined) return null;
  if (!isRecord(value)) return undefined;

  const filters = {
    date: value.date,
    from: value.from,
    parking_codigo: value.parking_codigo,
    sistema_grupo: value.sistema_grupo,
    source_run_id: value.source_run_id,
    to: value.to,
  };

  if (!Object.values(filters).every(isStringOrNull)) return undefined;
  if (filters.date !== null && !isSafeDate(filters.date)) return undefined;
  if (filters.from !== null && !isSafeDate(filters.from)) return undefined;
  if (filters.to !== null && !isSafeDate(filters.to)) return undefined;
  if (filters.source_run_id !== null && !isValidUuid(filters.source_run_id)) return undefined;

  return filters as OperationalDashboardFilters;
}

function parseRow(value: unknown): OperationalDashboardRow | null {
  if (!isRecord(value)) return null;

  const sums = Object.fromEntries(sumFields.map((field) => [field, finiteNumber(value[field])])) as Record<SumField, number | null>;
  const averages = Object.fromEntries(averageFields.map((field) => [field, nullableNumber(value[field])])) as Record<AverageField, number | null | undefined>;

  const id = requiredUuid(value, "id");
  const fecha = requiredDate(value, "fecha");
  const year = finiteNumber(value.year);
  const quarter = finiteNumber(value.quarter);
  const month = finiteNumber(value.month);
  const day = finiteNumber(value.day);
  const parkingCodigo = requiredString(value, "parking_codigo");
  const parkingNombre = requiredString(value, "parking_nombre");
  const sistemaGrupo = requiredString(value, "sistema_grupo");
  const sourceRunId = requiredUuid(value, "source_run_id");
  const dashboardActualizacionId = nullableUuid(value, "dashboard_actualizacion_id");
  const calculatedAt = requiredTimestamp(value, "calculated_at");
  const metricVersion = requiredString(value, "metric_version");
  const createdAt = requiredTimestamp(value, "created_at");
  const updatedAt = requiredTimestamp(value, "updated_at");

  if (
    !id ||
    !fecha ||
    year === null ||
    quarter === null ||
    month === null ||
    day === null ||
    !parkingCodigo ||
    !parkingNombre ||
    !sistemaGrupo ||
    !sourceRunId ||
    dashboardActualizacionId === undefined ||
    !calculatedAt ||
    !metricVersion ||
    !createdAt ||
    !updatedAt ||
    sumFields.some((field) => sums[field] === null) ||
    averageFields.some((field) => averages[field] === undefined)
  ) {
    return null;
  }

  return {
    advanced_book_days_boleta_avg: averages.advanced_book_days_boleta_avg ?? null,
    advanced_book_days_pack_avg: averages.advanced_book_days_pack_avg ?? null,
    advanced_book_days_total_avg: averages.advanced_book_days_total_avg ?? null,
    avg_order_value_boleta: averages.avg_order_value_boleta ?? null,
    calculated_at: calculatedAt,
    created_at: createdAt,
    dashboard_actualizacion_id: dashboardActualizacionId,
    day,
    duration_stay_boleta_avg: averages.duration_stay_boleta_avg ?? null,
    duration_stay_pack_avg: averages.duration_stay_pack_avg ?? null,
    duration_stay_total_avg: averages.duration_stay_total_avg ?? null,
    fecha,
    id,
    metric_version: metricVersion,
    month,
    pack_vendido_dbi: sums.pack_vendido_dbi ?? 0,
    pack_vendido_precio_lista_avg: averages.pack_vendido_precio_lista_avg ?? null,
    pack_vendido_precio_pagado_avg: averages.pack_vendido_precio_pagado_avg ?? null,
    pack_vendido_q: sums.pack_vendido_q ?? 0,
    pack_vendido_venta: sums.pack_vendido_venta ?? 0,
    parking_codigo: parkingCodigo,
    parking_nombre: displayOperationalParkingName(parkingCodigo, parkingNombre),
    precio_lista_boleta_avg: averages.precio_lista_boleta_avg ?? null,
    precio_pagado_boleta_avg: averages.precio_pagado_boleta_avg ?? null,
    quarter,
    reserva_boleta_dbi: sums.reserva_boleta_dbi ?? 0,
    reserva_boleta_q: sums.reserva_boleta_q ?? 0,
    reserva_boleta_venta: sums.reserva_boleta_venta ?? 0,
    reserva_pack_dbi: sums.reserva_pack_dbi ?? 0,
    reserva_pack_q: sums.reserva_pack_q ?? 0,
    reserva_total_dbi: sums.reserva_total_dbi ?? 0,
    reserva_total_q: sums.reserva_total_q ?? 0,
    sistema_grupo: sistemaGrupo,
    source_run_id: sourceRunId,
    updated_at: updatedAt,
    venta_total_operacional: sums.venta_total_operacional ?? 0,
    year,
  };
}

export function emptyOperationalDashboardTotals(): OperationalDashboardTotals {
  return {
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
}

function weightedAverage(rows: OperationalDashboardRow[], field: AverageField) {
  const weightField = averageWeights[field];
  let numerator = 0;
  let denominator = 0;

  for (const row of rows) {
    const value = row[field];
    const weight = row[weightField];
    if (value !== null && weight > 0) {
      numerator += value * weight;
      denominator += weight;
    }
  }

  return denominator > 0 ? numerator / denominator : null;
}

export function calculateOperationalDashboardTotals(rows: OperationalDashboardRow[]): OperationalDashboardTotals {
  const totals = emptyOperationalDashboardTotals();
  for (const row of rows) {
    for (const field of sumFields) totals[field] += row[field];
  }
  for (const field of averageFields) totals[field] = weightedAverage(rows, field);
  return totals;
}

export function calculateTotalsByGroup(rows: OperationalDashboardRow[]) {
  const groups = new Map<string, OperationalDashboardRow[]>();
  for (const group of defaultGroups) groups.set(group, []);
  for (const row of rows) groups.set(row.sistema_grupo, [...(groups.get(row.sistema_grupo) ?? []), row]);
  return Object.fromEntries(Array.from(groups.entries()).map(([group, groupRows]) => [group, calculateOperationalDashboardTotals(groupRows)]));
}

export function calculateTotalsByDate(rows: OperationalDashboardRow[]): OperationalDashboardTotalsByDate[] {
  const groups = new Map<string, OperationalDashboardRow[]>();
  for (const row of rows) groups.set(row.fecha, [...(groups.get(row.fecha) ?? []), row]);
  return Array.from(groups.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fecha, dateRows]) => ({ fecha, ...calculateOperationalDashboardTotals(dateRows) }));
}

function share(groupValue: number, total: number) {
  return total > 0 ? (groupValue / total) * 100 : 0;
}

export function calculateMarketShare(totalsByGroup: Record<string, OperationalDashboardTotals>): OperationalDashboardMarketShare {
  const mcp = totalsByGroup.MCP ?? emptyOperationalDashboardTotals();
  const okp = totalsByGroup.OKP ?? emptyOperationalDashboardTotals();
  const ventaTotal = mcp.venta_total_operacional + okp.venta_total_operacional;
  const dbiTotal = mcp.reserva_total_dbi + okp.reserva_total_dbi;
  const qTotal = mcp.reserva_total_q + okp.reserva_total_q;

  return {
    reserva_total_dbi: { MCP: share(mcp.reserva_total_dbi, dbiTotal), OKP: share(okp.reserva_total_dbi, dbiTotal) },
    reserva_total_q: { MCP: share(mcp.reserva_total_q, qTotal), OKP: share(okp.reserva_total_q, qTotal) },
    venta_total_operacional: { MCP: share(mcp.venta_total_operacional, ventaTotal), OKP: share(okp.venta_total_operacional, ventaTotal) },
  };
}

export function normalizeOperationalDashboardRpcResult(data: unknown): OperationalDashboardViewModel | null {
  if (!isRecord(data) || !Array.isArray(data.rows)) return null;

  const lastUpdate = parseLastUpdate(data.lastUpdate ?? null);
  if (lastUpdate === undefined) return null;

  const filters = parseFilters(data.filters);
  if (filters === undefined || (lastUpdate !== null && filters === null)) return null;

  const rows = data.rows.map(parseRow);
  if (rows.some((row) => row === null)) return null;
  const safeRows = rows as OperationalDashboardRow[];
  const totalsByGroup = calculateTotalsByGroup(safeRows);

  return {
    filters,
    lastUpdate,
    marketShare: calculateMarketShare(totalsByGroup),
    rows: safeRows,
    totals: calculateOperationalDashboardTotals(safeRows),
    totalsByDate: calculateTotalsByDate(safeRows),
    totalsByGroup,
  };
}

export function isValidOperationalDashboardDate(value: string) {
  return isSafeDate(value);
}

export function isValidOperationalDashboardUuid(value: string) {
  return isValidUuid(value);
}
