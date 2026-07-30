const clpFormatter = new Intl.NumberFormat("es-CL", {
  currency: "CLP",
  maximumFractionDigits: 0,
  style: "currency",
});

const integerFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeZone: "America/Santiago",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Santiago",
});

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatCurrency(value: number | null | undefined) {
  return isFiniteNumber(value) ? clpFormatter.format(Math.round(value)) : "No disponible";
}

export function formatAdrCurrency(priceAverage: number | null | undefined, stayAverage: number | null | undefined) {
  if (!isFiniteNumber(priceAverage) || !isFiniteNumber(stayAverage) || stayAverage <= 0) {
    return "No disponible";
  }

  return formatCurrency(priceAverage / stayAverage);
}

export function formatInteger(value: number | null | undefined) {
  return isFiniteNumber(value) ? integerFormatter.format(Math.round(value)) : "No disponible";
}

export function formatDecimal(value: number | null | undefined, suffix = "") {
  return isFiniteNumber(value) ? `${decimalFormatter.format(value)}${suffix}` : "No disponible";
}

export function formatDays(value: number | null | undefined) {
  if (!isFiniteNumber(value)) {
    return "No disponible";
  }

  return `${decimalFormatter.format(value)} ${value === 1 ? "día" : "días"}`;
}

export function formatPercent(value: number | null | undefined) {
  return isFiniteNumber(value) ? `${percentFormatter.format(value)}%` : "0%";
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : value;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Sin registro";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateTimeFormatter.format(date) : "Sin registro";
}
