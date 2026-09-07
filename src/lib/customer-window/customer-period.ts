export type CustomerPeriodPreset = "today" | "yesterday" | "last7" | "last14" | "thisMonth" | "previousMonth" | "custom";

export type CustomerPeriodRange = {
  from: string;
  to: string;
};

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

export function getSantiagoDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Santiago",
    year: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return date.toISOString().slice(0, 10);
}

export function isValidCustomerPeriodRange(range: CustomerPeriodRange) {
  if (!dateKeyPattern.test(range.from) || !dateKeyPattern.test(range.to) || range.from > range.to) return false;
  const from = new Date(`${range.from}T00:00:00.000Z`);
  const to = new Date(`${range.to}T00:00:00.000Z`);

  return !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())
    && from.toISOString().slice(0, 10) === range.from
    && to.toISOString().slice(0, 10) === range.to;
}

export function getCustomerPeriodRange(
  preset: Exclude<CustomerPeriodPreset, "custom">,
  todayKey = getSantiagoDateKey(),
): CustomerPeriodRange {
  if (preset === "yesterday") {
    const yesterday = addCalendarDays(todayKey, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === "last7") return { from: addCalendarDays(todayKey, -6), to: todayKey };
  if (preset === "last14") return { from: addCalendarDays(todayKey, -13), to: todayKey };
  if (preset === "thisMonth") return { from: `${todayKey.slice(0, 7)}-01`, to: todayKey };
  if (preset === "previousMonth") {
    const [year, month] = todayKey.split("-").map(Number);
    const first = new Date(Date.UTC(year, month - 2, 1));
    const last = new Date(Date.UTC(year, month - 1, 0));

    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
  }

  return { from: todayKey, to: todayKey };
}
