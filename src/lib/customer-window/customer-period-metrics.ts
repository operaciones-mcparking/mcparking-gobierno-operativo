export type CustomerPeriodMetrics = {
  alternatingCustomers: number;
  frequentBothCustomers: number;
  frequentCustomers: number;
  frequentMcpEapOnlyCustomers: number;
  frequentOkpOnlyCustomers: number;
  migratedToMcpEapCustomers: number;
  migratedToOkpCustomers: number;
  newBothCustomers: number;
  newCustomers: number;
  newMcpEapOnlyCustomers: number;
  newOkpOnlyCustomers: number;
  nonPackBothCustomers: number;
  nonPackCustomers: number;
  nonPackMcpEapOnlyCustomers: number;
  nonPackOkpOnlyCustomers: number;
  onlyMcpEapCustomers: number;
  onlyOkpCustomers: number;
  packBothCustomers: number;
  packCustomers: number;
  packMcpEapOnlyCustomers: number;
  packOkpOnlyCustomers: number;
  totalCustomers: number;
};

const metricKeys: Array<keyof CustomerPeriodMetrics> = [
  "alternatingCustomers",
  "frequentBothCustomers",
  "frequentCustomers",
  "frequentMcpEapOnlyCustomers",
  "frequentOkpOnlyCustomers",
  "migratedToMcpEapCustomers",
  "migratedToOkpCustomers",
  "newBothCustomers",
  "newCustomers",
  "newMcpEapOnlyCustomers",
  "newOkpOnlyCustomers",
  "nonPackBothCustomers",
  "nonPackCustomers",
  "nonPackMcpEapOnlyCustomers",
  "nonPackOkpOnlyCustomers",
  "onlyMcpEapCustomers",
  "onlyOkpCustomers",
  "packBothCustomers",
  "packCustomers",
  "packMcpEapOnlyCustomers",
  "packOkpOnlyCustomers",
  "totalCustomers",
];

export function normalizeCustomerPeriodMetrics(value: unknown): CustomerPeriodMetrics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const entries: Array<[keyof CustomerPeriodMetrics, number]> = [];

  for (const key of metricKeys) {
    const metric = record[key];
    if (typeof metric !== "number" || !Number.isFinite(metric) || metric < 0) return null;
    entries.push([key, metric]);
  }

  return Object.fromEntries(entries) as CustomerPeriodMetrics;
}

export function formatCustomerMetricPercentage(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${((value / total) * 100).toLocaleString("es-CL", { maximumFractionDigits: 1 })}%`;
}

export function formatCustomerTierLabel(value: string | null) {
  return value ? value[0] + value.slice(1).toLowerCase() : "Sin tier";
}
