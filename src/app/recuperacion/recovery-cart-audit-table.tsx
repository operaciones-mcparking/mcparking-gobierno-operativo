"use client";

import { useEffect, useMemo, useState } from "react";

import { ValueBadge, type BadgeTone } from "@/components/dashboard/badge";
import type {
  RecoveryCartAuditRow,
  RecoveryCartAuditStatus,
  RecoveryCartWhatsappStatus,
} from "@/lib/dashboard/data";
import { RecoveryCartChatDrawer } from "./recovery-cart-chat-drawer";

const RECOVERY_TIME_ZONE = "America/Santiago";

type RecoveryCartAuditTableProps = {
  error?: string | null;
  rows: RecoveryCartAuditRow[];
};

type ChatIndicator = Pick<
  RecoveryCartAuditRow,
  | "chatMessageCount"
  | "hasChat"
  | "lastInboundChatState"
  | "lastInboundIntentCategory"
  | "lastInboundMessageAt"
  | "lastInboundSentiment"
> & {
  cartId: string;
  hasInbound: boolean;
};

type StatusFilter = "all" | RecoveryCartAuditStatus;
type TypeFilter = "all" | "abandoned" | "canceled";
type WhatsappFilter = "all" | RecoveryCartWhatsappStatus;
type SortDirection = "asc" | "desc";
type SortKey =
  | "amount"
  | "cart_date"
  | "confidence"
  | "contact"
  | "hours"
  | "message"
  | "parking"
  | "purchase_date"
  | "status"
  | "type";

const rowsPerPage = 20;

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "-";

  return `$${new Intl.NumberFormat("es-CL").format(Math.round(value))}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: RECOVERY_TIME_ZONE,
  }).format(new Date(value));
}

function formatDateOnly(value: string | null) {
  if (!value) return "-";

  const [year, month, day] = value.split("-");

  if (!year || !month || !day) return formatDate(value);

  return `${day}/${month}/${year}`;
}

function formatHours(value: number | null) {
  if (value === null || value === undefined) return "-";

  return `${Number(value).toFixed(1).replace(".", ",")} h`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CL").format(value);
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "?";

  return `${value.toFixed(1).replace(".", ",")}%`;
}

function ratioPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return null;

  return (numerator / denominator) * 100;
}

function isPaymentReview(row: RecoveryCartAuditRow) {
  return row.audit_status === "payment_review";
}

function isOperationalRecovered(row: RecoveryCartAuditRow) {
  return row.recovered || isPaymentReview(row);
}

function operationalRecoveryAmount(row: RecoveryCartAuditRow) {
  return isOperationalRecovered(row) ? Number(row.purchase_amount ?? 0) : 0;
}

function dateInputValue(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function messageSentLabel(value: boolean | null) {
  if (value === true) return "Enviado";
  if (value === false) return "No enviado";

  return "Sin dato";
}

function messageSentTone(value: boolean | null): BadgeTone {
  if (value === true) return "success";
  if (value === false) return "neutral";

  return "warning";
}

function whatsappStatusLabel(status: RecoveryCartWhatsappStatus) {
  if (status === "read") return "Leído";
  if (status === "delivered") return "Entregado";
  if (status === "sent") return "Enviado";
  if (status === "failed") return "Fallido";

  return "Sin seguimiento";
}

function whatsappStatusTone(status: RecoveryCartWhatsappStatus): BadgeTone {
  if (status === "read") return "success";
  if (status === "delivered") return "info";
  if (status === "sent") return "warning";
  if (status === "failed") return "danger";

  return "neutral";
}

function auditStatusLabel(status: RecoveryCartAuditStatus) {
  if (status === "recovered_with_amount") return "Recuperado con monto";
  if (status === "recovered_pack") return "Recuperado sin monto / pack";
  if (status === "payment_review") return "Pago en revisión";
  if (status === "expired") return "Carrito expirado";

  return "No recuperado";
}

function auditStatusTone(status: RecoveryCartAuditStatus): BadgeTone {
  if (status === "recovered_with_amount") return "success";
  if (status === "recovered_pack") return "info";
  if (status === "payment_review") return "warning";
  if (status === "expired") return "warning";

  return "neutral";
}

function confidenceTone(confidence: string | null): BadgeTone {
  if (confidence === "high") return "success";
  if (confidence === "medium") return "warning";
  if (confidence === "low") return "neutral";

  return "neutral";
}

function sortValue(row: RecoveryCartAuditRow, sortKey: SortKey) {
  if (sortKey === "cart_date") return row.cart_form_datetime ? new Date(row.cart_form_datetime).getTime() : 0;
  if (sortKey === "purchase_date") return row.purchase_created_at ? new Date(row.purchase_created_at).getTime() : 0;
  if (sortKey === "amount") return Number(row.purchase_amount ?? -1);
  if (sortKey === "contact") return `${row.email ?? ""} ${row.phone ?? ""}`;
  if (sortKey === "hours") return Number(row.hours_to_purchase ?? -1);
  if (sortKey === "message") return `${messageSentLabel(row.message_sent)} ${row.whatsappStatus}`;
  if (sortKey === "status") return row.audit_status;
  if (sortKey === "type") return row.cart_type ?? "";
  if (sortKey === "parking") return row.parking_code ?? "";
  if (sortKey === "confidence") return row.confidence ?? "";

  return "";
}

function defaultSortDirection(sortKey: SortKey): SortDirection {
  if (sortKey === "amount" || sortKey === "cart_date" || sortKey === "hours" || sortKey === "purchase_date") {
    return "desc";
  }

  return "asc";
}


function intentTooltipItems(row: RecoveryCartAuditRow): Array<[string, string]> {
  const items: Array<[string, string]> = [];

  if (row.lastInboundIntentCategory) {
    items.push(["intent_category", row.lastInboundIntentCategory]);
    items.push(["Intención", row.lastInboundIntentCategory]);
  }

  if (row.lastInboundSentiment) items.push(["Sentimiento", row.lastInboundSentiment]);
  if (row.lastInboundChatState) items.push(["Chat", row.lastInboundChatState]);
  if (row.hasChat === true && row.chatMessageCount !== null) items.push(["Mensajes", formatNumber(row.chatMessageCount)]);
  if (row.recovery_review_note) items.push(["Revisión", row.recovery_review_note]);
  if (row.hasChat === null) items.push(["Chat", "Se carga al pasar por la pagina"]);

  return items;
}

function intentTooltipTitle(row: RecoveryCartAuditRow) {
  const items = intentTooltipItems(row);

  if (items.length === 0) return row.hasChat === false ? "Sin chat asociado" : "Chat disponible bajo demanda";

  return items.map(([label, value]) => `${label}: ${value}`).join(" | ");
}


function dateKeyForSantiago(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: RECOVERY_TIME_ZONE,
    year: "numeric",
  }).format(date);
}

function shortDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-");

  if (!year || !month || !day) return dateKey;

  return `${day}/${month}`;
}

function buildPerformanceSummary(rows: RecoveryCartAuditRow[]) {
  const dayMap = new Map<
    string,
    {
      amount: number;
      recovered: number;
      total: number;
    }
  >();

  let sent = 0;
  let delivered = 0;
  let read = 0;
  let recovered = 0;
  let recoveredAmount = 0;

  for (const row of rows) {
    const key = dateKeyForSantiago(row.cart_form_datetime);

    if (key) {
      const current = dayMap.get(key) ?? { amount: 0, recovered: 0, total: 0 };
      current.total += 1;

      if (isOperationalRecovered(row)) {
        current.recovered += 1;
        current.amount += operationalRecoveryAmount(row);
      }

      dayMap.set(key, current);
    }

    if (row.message_sent === true) sent += 1;
    if (row.whatsappStatus === "delivered" || row.whatsappStatus === "read") delivered += 1;
    if (row.whatsappStatus === "read") read += 1;

    if (isOperationalRecovered(row)) {
      recovered += 1;
      recoveredAmount += operationalRecoveryAmount(row);
    }
  }

  const days = Array.from(dayMap.entries())
    .map(([dateKey, values]) => ({
      ...values,
      dateKey,
      recoveryRate: ratioPercent(values.recovered, values.total) ?? 0,
    }))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));

  const averageRate =
    days.length > 0 ? days.reduce((total, day) => total + day.recoveryRate, 0) / days.length : null;
  const bestDay = days.length > 0 ? [...days].sort((left, right) => right.recoveryRate - left.recoveryRate)[0] : null;
  const worstDay = days.length > 0 ? [...days].sort((left, right) => left.recoveryRate - right.recoveryRate)[0] : null;

  return {
    averageRate,
    bestDay,
    days,
    funnel: {
      delivered,
      read,
      recovered,
      recoveredAmount,
      sent,
      total: rows.length,
    },
    totalAmount: days.reduce((total, day) => total + day.amount, 0),
    worstDay,
  };
}

type LineChartPoint = {
  dateKey: string;
  meta: string;
  tooltipItems: Array<[string, string]>;
  value: number;
};

type WeeklyPerformanceSummary = ReturnType<typeof summarizeRowsForWeek>;

function addDateKeyDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function weekStartKeyForDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function currentSantiagoWeekStartKey() {
  const todayKey = dateKeyForSantiago(new Date().toISOString()) ?? todayInputValue();
  return weekStartKeyForDateKey(todayKey);
}

function weekOptionLabel(weekStartKey: string) {
  const currentWeek = currentSantiagoWeekStartKey();
  const diffDays = Math.round((new Date(`${currentWeek}T00:00:00Z`).getTime() - new Date(`${weekStartKey}T00:00:00Z`).getTime()) / 86_400_000);
  const diffWeeks = Math.max(0, Math.round(diffDays / 7));

  if (diffWeeks === 0) return "Semana actual";
  if (diffWeeks === 1) return "Semana anterior";
  if (diffWeeks <= 3) return `Hace ${diffWeeks} semanas`;

  return `${shortDateLabel(weekStartKey)} - ${shortDateLabel(addDateKeyDays(weekStartKey, 6))}`;
}

function buildWeekOptions(rows: RecoveryCartAuditRow[]) {
  const weekStarts = Array.from(
    new Set(
      rows
        .map((row) => dateKeyForSantiago(row.cart_form_datetime))
        .filter((dateKey): dateKey is string => Boolean(dateKey))
        .map(weekStartKeyForDateKey),
    ),
  ).sort((left, right) => right.localeCompare(left));

  return weekStarts.map((weekStart) => ({
    label: weekOptionLabel(weekStart),
    rangeLabel: `${shortDateLabel(weekStart)} - ${shortDateLabel(addDateKeyDays(weekStart, 6))}`,
    value: weekStart,
  }));
}

function summarizeRowsForWeek(rows: RecoveryCartAuditRow[], weekStartKey: string) {
  const weekEndKey = addDateKeyDays(weekStartKey, 7);
  const dayMap = new Map<
    string,
    {
      amount: number;
      confirmedAmount: number;
      delivered: number;
      paymentReview: number;
      read: number;
      recovered: number;
      reviewAmount: number;
      sent: number;
      total: number;
    }
  >();

  for (let index = 0; index < 7; index += 1) {
    dayMap.set(addDateKeyDays(weekStartKey, index), {
      amount: 0,
      confirmedAmount: 0,
      delivered: 0,
      paymentReview: 0,
      read: 0,
      recovered: 0,
      reviewAmount: 0,
      sent: 0,
      total: 0,
    });
  }

  let sent = 0;
  let delivered = 0;
  let read = 0;
  let recovered = 0;
  let recoveredAmount = 0;
  let confirmedAmount = 0;
  let paymentReview = 0;
  let reviewAmount = 0;
  let total = 0;

  for (const row of rows) {
    const dateKey = dateKeyForSantiago(row.cart_form_datetime);
    if (!dateKey || dateKey < weekStartKey || dateKey >= weekEndKey) continue;

    const current = dayMap.get(dateKey) ?? {
      amount: 0,
      confirmedAmount: 0,
      delivered: 0,
      paymentReview: 0,
      read: 0,
      recovered: 0,
      reviewAmount: 0,
      sent: 0,
      total: 0,
    };
    current.total += 1;
    total += 1;

    if (row.message_sent === true) {
      sent += 1;
      current.sent += 1;
    }
    if (row.whatsappStatus === "delivered" || row.whatsappStatus === "read") {
      delivered += 1;
      current.delivered += 1;
    }
    if (row.whatsappStatus === "read") {
      read += 1;
      current.read += 1;
    }

    if (isOperationalRecovered(row)) {
      const amount = operationalRecoveryAmount(row);
      current.recovered += 1;
      current.amount += amount;
      recovered += 1;
      recoveredAmount += amount;

      if (isPaymentReview(row)) {
        current.paymentReview += 1;
        current.reviewAmount += amount;
        paymentReview += 1;
        reviewAmount += amount;
      } else {
        current.confirmedAmount += amount;
        confirmedAmount += amount;
      }
    }

    dayMap.set(dateKey, current);
  }

  const days = Array.from(dayMap.entries()).map(([dateKey, values]) => ({
    ...values,
    dateKey,
    recoveryRate: ratioPercent(values.recovered, values.total) ?? 0,
  }));
  const averageRate = total > 0 ? ratioPercent(recovered, total) : null;
  const daysWithCarts = days.filter((day) => day.total > 0);
  const bestDay = daysWithCarts.length > 0 ? [...daysWithCarts].sort((left, right) => right.recoveryRate - left.recoveryRate)[0] : null;
  const worstDay = daysWithCarts.length > 0 ? [...daysWithCarts].sort((left, right) => left.recoveryRate - right.recoveryRate)[0] : null;

  return {
    averageRate,
    bestDay,
    days,
    funnel: {
      confirmedAmount,
      confirmedRecovered: recovered - paymentReview,
      delivered,
      paymentReview,
      read,
      recovered,
      recoveredAmount,
      reviewAmount,
      sent,
      total,
    },
    totalAmount: recoveredAmount,
    worstDay,
  };
}


function rowsForWeek(rows: RecoveryCartAuditRow[], weekStartKey: string) {
  const weekEndKey = addDateKeyDays(weekStartKey, 7);

  return rows.filter((row) => {
    const dateKey = dateKeyForSantiago(row.cart_form_datetime);
    return Boolean(dateKey && dateKey >= weekStartKey && dateKey < weekEndKey);
  });
}

type WeeklyBreakdownItem = {
  amount: number;
  label: string;
  recovered: number;
  total: number;
};

function buildWeeklyBreakdown(rows: RecoveryCartAuditRow[]) {
  const typeMap = new Map<string, WeeklyBreakdownItem>();
  const confidenceMap = new Map<string, WeeklyBreakdownItem>();
  const parkingMap = new Map<string, WeeklyBreakdownItem>();
  const recoveredRows = rows.filter(isOperationalRecovered);

  for (const type of ["abandoned", "canceled"]) {
    typeMap.set(type, { amount: 0, label: type, recovered: 0, total: 0 });
  }

  for (const confidence of ["high", "medium", "low"]) {
    confidenceMap.set(confidence, { amount: 0, label: confidence, recovered: 0, total: 0 });
  }

  for (const row of rows) {
    const typeLabel = row.cart_type ?? "Sin tipo";
    const typeItem = typeMap.get(typeLabel) ?? { amount: 0, label: typeLabel, recovered: 0, total: 0 };
    typeItem.total += 1;

    const parkingLabel = row.parking_code ?? "Sin parking";
    const parkingItem = parkingMap.get(parkingLabel) ?? { amount: 0, label: parkingLabel, recovered: 0, total: 0 };
    parkingItem.total += 1;

    if (isOperationalRecovered(row)) {
      const amount = operationalRecoveryAmount(row);
      typeItem.recovered += 1;
      typeItem.amount += amount;
      parkingItem.recovered += 1;
      parkingItem.amount += amount;

      const confidenceLabel = row.confidence ?? "Sin confianza";
      const confidenceItem = confidenceMap.get(confidenceLabel) ?? {
        amount: 0,
        label: confidenceLabel,
        recovered: 0,
        total: 0,
      };
      confidenceItem.recovered += 1;
      confidenceItem.total += 1;
      confidenceItem.amount += amount;
      confidenceMap.set(confidenceLabel, confidenceItem);
    }

    typeMap.set(typeLabel, typeItem);
    parkingMap.set(parkingLabel, parkingItem);
  }

  return {
    byConfidence: Array.from(confidenceMap.values()).sort((left, right) => {
      const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
      return (rank[left.label] ?? 99) - (rank[right.label] ?? 99) || right.recovered - left.recovered;
    }),
    byParking: Array.from(parkingMap.values()).sort((left, right) => right.total - left.total || left.label.localeCompare(right.label, "es-CL")),
    byType: Array.from(typeMap.values()).sort((left, right) => left.label.localeCompare(right.label, "es-CL")),
    recoveredTotal: recoveredRows.length,
    total: rows.length,
  };
}

function breakdownRateLabel(recovered: number, total: number) {
  return formatPercent(ratioPercent(recovered, total) ?? 0);
}

function breakdownShareLabel(value: number, total: number) {
  if (total <= 0) return "-";

  return formatPercent(ratioPercent(value, total));
}function formatCompactCurrency(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1).replace(".", ",")} MM`;
  }

  if (value >= 1_000) {
    return `$${Math.round(value / 1_000).toLocaleString("es-CL")} mil`;
  }

  return formatCurrency(value);
}

function roundedMoneyMax(value: number) {
  if (value <= 0) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const rounded = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return rounded * magnitude;
}

function trendValues(values: number[]) {
  if (values.length < 2) return values;

  const n = values.length;
  const sumX = values.reduce((total, _value, index) => total + index, 0);
  const sumY = values.reduce((total, value) => total + value, 0);
  const sumXY = values.reduce((total, value, index) => total + index * value, 0);
  const sumXX = values.reduce((total, _value, index) => total + index * index, 0);
  const denominator = n * sumXX - sumX * sumX;

  if (denominator === 0) return values;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return values.map((_value, index) => intercept + slope * index);
}

function pathFromPoints(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function deltaPercentPoints(current: number | null, previous: number | null) {
  if (current === null || previous === null) return "?";
  const delta = current - previous;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1).replace(".", ",")} pts`;
}

function deltaCurrency(current: number, previous: number) {
  const delta = current - previous;
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${sign}${formatCurrency(Math.abs(delta))}`;
}

function deltaNumber(current: number, previous: number) {
  const delta = current - previous;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatNumber(delta)}`;
}


function comparisonBadgeToneClasses(tone: string) {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "danger") return "border-rose-200 bg-rose-50 text-rose-700";

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function recoveryRateDeltaTone(current: number | null, previous: number | null) {
  if (current === null || previous === null) return "neutral" as const;
  const delta = current - previous;
  if (delta > 0) return "good" as const;
  if (delta === 0) return "neutral" as const;
  if (delta > -3) return "warning" as const;

  return "danger" as const;
}

function amountDeltaTone(current: number, previous: number) {
  const delta = current - previous;
  if (delta > 0) return "good" as const;
  if (delta === 0) return "neutral" as const;
  const previousBase = Math.max(previous, 1);
  const dropPercent = Math.abs(delta) / previousBase;

  return dropPercent < 0.15 ? "warning" : "danger";
}


function totalCartsDeltaTone(current: number, previous: number) {
  const delta = current - previous;
  if (delta < 0) return "good" as const;
  if (delta === 0) return "neutral" as const;

  return "danger" as const;
}function weekComparisonLabel(weekStartKey: string) {
  const previousWeekStart = addDateKeyDays(weekStartKey, -7);

  return `${shortDateLabel(weekStartKey)} - ${shortDateLabel(addDateKeyDays(weekStartKey, 6))} · compara contra ${shortDateLabel(previousWeekStart)} - ${shortDateLabel(addDateKeyDays(previousWeekStart, 6))}`;
}

function PerformanceLineChart({
  formatTick,
  formatValue,
  previousPoints,
  points,
  seriesLabel,
  yMax,
}: {
  formatTick: (value: number) => string;
  formatValue: (value: number) => string;
  previousPoints?: LineChartPoint[];
  points: LineChartPoint[];
  seriesLabel: string;
  yMax: number;
}) {
  const width = 520;
  const height = 320;
  const padding = { bottom: 34, left: 58, right: 18, top: 18 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const safeMax = yMax > 0 ? yMax : 1;
  const ticks = [1, 0.8, 0.6, 0.4, 0.2, 0].map((ratio) => safeMax * ratio);
  const xPointCount = Math.max(points.length, previousPoints?.length ?? 0);

  const toX = (index: number) =>
    xPointCount <= 1 ? padding.left + innerWidth / 2 : padding.left + (index / (xPointCount - 1)) * innerWidth;
  const toY = (value: number) => padding.top + (1 - Math.min(Math.max(value, 0), safeMax) / safeMax) * innerHeight;
  const chartPoints = points.map((point, index) => ({ ...point, x: toX(index), y: toY(point.value) }));
  const previousChartPoints = (previousPoints ?? []).map((point, index) => ({ ...point, x: toX(index), y: toY(point.value) }));
  const trendPoints = trendValues(points.map((point) => point.value)).map((value, index) => ({
    x: toX(index),
    y: toY(value),
  }));
  const shouldShowTrend = points.length >= 2;
  const shouldShowPrevious = previousChartPoints.length > 0;
  const [hoveredPoint, setHoveredPoint] = useState<null | {
    left: number;
    title: string;
    top: number;
    items: Array<[string, string]>;
  }>(null);

  return (
    <div className="relative mt-4">
      <svg aria-label={seriesLabel} className="h-[320px] w-full overflow-visible" role="img" viewBox={`0 0 ${width} ${height}`}>
        {ticks.map((tick) => {
          const y = toY(tick);

          return (
            <g key={tick}>
              <line stroke="#d9e5ec" strokeDasharray="3 4" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text fill="#64748b" fontSize="11" textAnchor="end" x={padding.left - 8} y={y + 4}>
                {formatTick(tick)}
              </text>
            </g>
          );
        })}
        <line stroke="#cbd5e1" x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} />
        <line stroke="#cbd5e1" x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} />
        {shouldShowPrevious ? (
          <path d={pathFromPoints(previousChartPoints)} fill="none" stroke="#94a3b8" strokeDasharray="4 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
        ) : null}
        {shouldShowTrend ? (
          <path d={pathFromPoints(trendPoints)} fill="none" stroke="#D66A6A" strokeDasharray="5 5" strokeLinecap="round" strokeWidth="1.8" opacity="0.85" />
        ) : null}
        <path d={pathFromPoints(chartPoints)} fill="none" stroke="#0f766e" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        {previousChartPoints.map((point) => (
          <circle
            cx={point.x}
            cy={point.y}
            fill="#f8fafc"
            key={`previous-${point.dateKey}`}
            onMouseEnter={() =>
              setHoveredPoint({
                items: point.tooltipItems,
                left: (point.x / width) * 100,
                title: `Semana anterior · ${shortDateLabel(point.dateKey)}`,
                top: (point.y / height) * 100,
              })
            }
            onMouseLeave={() => setHoveredPoint(null)}
            r="3.5"
            stroke="#94a3b8"
            strokeWidth="2"
          />
        ))}
        {chartPoints.map((point) => (
          <g key={point.dateKey}>
            <circle
              cx={point.x}
              cy={point.y}
              fill="#ffffff"
              onMouseEnter={() =>
                setHoveredPoint({
                  items: point.tooltipItems,
                  left: (point.x / width) * 100,
                  title: shortDateLabel(point.dateKey),
                  top: (point.y / height) * 100,
                })
              }
              onMouseLeave={() => setHoveredPoint(null)}
              r="4.5"
              stroke="#0f766e"
              strokeWidth="2.5"
            />
            <text fill="#64748b" fontSize="10" textAnchor="middle" x={point.x} y={height - 10}>
              {shortDateLabel(point.dateKey)}
            </text>
          </g>
        ))}
      </svg>
      {hoveredPoint ? (
        <div
          className="pointer-events-none absolute z-40 min-w-52 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] leading-4 text-slate-600 shadow-[0_12px_28px_rgba(2,53,116,0.16)]"
          style={{
            left: `${Math.min(88, Math.max(12, hoveredPoint.left))}%`,
            top: `${Math.min(78, Math.max(14, hoveredPoint.top))}%`,
            transform: "translate(-50%, -115%)",
          }}
        >
          <p className="mb-1 font-semibold text-navy">{hoveredPoint.title}</p>
          {hoveredPoint.items.map(([label, value]) => (
            <div className="flex justify-between gap-4" key={label}>
              <span>{label}</span>
              <span className="font-medium text-slate-800">{value}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded-full bg-[#0f766e]" /> Semana seleccionada
        </span>
        {shouldShowPrevious ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full border-t border-dashed border-slate-400" /> Semana anterior
          </span>
        ) : null}
        {shouldShowTrend ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full border-t border-dashed border-[#D66A6A]" /> Tendencia
          </span>
        ) : null}
      </div>
    </div>
  );
}

function WeeklyBreakdownBlock({
  items,
  mode,
  recoveredTotal,
  title,
}: {
  items: WeeklyBreakdownItem[];
  mode: "conversion" | "confidence";
  recoveredTotal: number;
  title: string;
}) {
  const maxTotal = Math.max(...items.map((item) => (mode === "confidence" ? item.recovered : item.total)), 1);

  return (
    <div className="rounded-xl border border-[#edf2f6] bg-[#fbfdfe] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">{title}</p>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="rounded-lg border border-[#edf2f6] bg-white px-3 py-3 text-sm text-slate-500">Sin datos para esta semana.</p>
        ) : (
          items.map((item) => {
            const barBase = mode === "confidence" ? item.recovered : item.total;
            const barWidth = maxTotal > 0 ? (barBase / maxTotal) * 100 : 0;
            const detail =
              mode === "confidence"
                ? `${formatNumber(item.recovered)} casos · ${breakdownShareLabel(item.recovered, recoveredTotal)} de recuperados`
                : `${formatNumber(item.recovered)} recuperados de ${formatNumber(item.total)} · tasa ${breakdownRateLabel(item.recovered, item.total)}`;

            return (
              <div key={item.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-navy">{item.label}</span>
                  <span className="text-sm font-medium text-navy">{formatCurrency(item.amount)}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">{detail}</p>
                <div className="mt-2 h-1.5 rounded-full bg-white ring-1 ring-[#edf2f6]">
                  <div className="h-1.5 rounded-full bg-sea/75" style={{ width: `${Math.min(100, barWidth)}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}export function RecoveryCartAuditTable({ error, rows }: RecoveryCartAuditTableProps) {
  const [dateQuery, setDateQuery] = useState(() => todayInputValue());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [whatsappFilter, setWhatsappFilter] = useState<WhatsappFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedChatCartId, setSelectedChatCartId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [sortKey, setSortKey] = useState<SortKey>("cart_date");
  const [selectedWeekStart, setSelectedWeekStart] = useState("");
  const [chatIndicators, setChatIndicators] = useState<Record<string, ChatIndicator>>({});

  const visibleRows = useMemo(() => {
    return [...rows]
      .filter((row) => {
        if (statusFilter !== "all" && row.audit_status !== statusFilter) return false;
        if (typeFilter !== "all" && row.cart_type !== typeFilter) return false;
        if (whatsappFilter !== "all" && row.whatsappStatus !== whatsappFilter) return false;

        if (dateQuery && dateInputValue(row.cart_form_datetime) !== dateQuery) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const leftValue = sortValue(left, sortKey);
        const rightValue = sortValue(right, sortKey);

        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return sortDirection === "desc" ? rightValue - leftValue : leftValue - rightValue;
        }

        const comparison = String(leftValue).localeCompare(String(rightValue), "es-CL");

        return sortDirection === "desc" ? comparison * -1 : comparison;
      });
  }, [dateQuery, rows, sortDirection, sortKey, statusFilter, typeFilter, whatsappFilter]);

  const hasDateFilter = Boolean(dateQuery);
  const totalPages = hasDateFilter ? 1 : Math.max(1, Math.ceil(visibleRows.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = hasDateFilter ? 0 : (safeCurrentPage - 1) * rowsPerPage;
  const pageRows = hasDateFilter ? visibleRows : visibleRows.slice(pageStartIndex, pageStartIndex + rowsPerPage);
  const pageRowIds = useMemo(() => pageRows.slice(0, 100).map((row) => row.id), [pageRows]);
  const pageRowIdsKey = pageRowIds.join("|");
  const showingFrom = visibleRows.length === 0 ? 0 : pageStartIndex + 1;
  const showingTo = hasDateFilter ? visibleRows.length : Math.min(pageStartIndex + rowsPerPage, visibleRows.length);
  const shouldShowPaginationControls = !hasDateFilter && totalPages > 1;
  const auditSummary = useMemo(
    () => {
      const recoveredRows = visibleRows.filter(isOperationalRecovered);
      const paymentReviewRows = visibleRows.filter(isPaymentReview);
      const confirmedRows = recoveredRows.filter((row) => !isPaymentReview(row));

      return {
        confirmed: confirmedRows.length,
        confirmedAmount: confirmedRows.reduce((total, row) => total + operationalRecoveryAmount(row), 0),
        delivered: visibleRows.filter((row) => row.whatsappStatus === "delivered" || row.whatsappStatus === "read").length,
        paymentReview: paymentReviewRows.length,
        read: visibleRows.filter((row) => row.whatsappStatus === "read").length,
        recovered: recoveredRows.length,
        recoveredAmount: recoveredRows.reduce((total, row) => total + operationalRecoveryAmount(row), 0),
        reviewAmount: paymentReviewRows.reduce((total, row) => total + operationalRecoveryAmount(row), 0),
        sent: visibleRows.filter((row) => row.message_sent === true).length,
        total: visibleRows.length,
      };
    },
    [visibleRows],
  );
  const averageRecoveredTicket =
    auditSummary.recovered > 0 ? auditSummary.recoveredAmount / auditSummary.recovered : null;
  const auditFunnelCards = [
    {
      basis: auditSummary.total > 0 ? "de carritos" : null,
      label: "Carritos filtrados",
      metric: auditSummary.total > 0 ? "100%" : "?",
      value: formatNumber(auditSummary.total),
    },
    {
      basis: "de carritos",
      label: "Enviados",
      metric: formatPercent(ratioPercent(auditSummary.sent, auditSummary.total)),
      value: formatNumber(auditSummary.sent),
    },
    {
      basis: "de enviados",
      label: "Entregados",
      metric: formatPercent(ratioPercent(auditSummary.delivered, auditSummary.sent)),
      value: formatNumber(auditSummary.delivered),
    },
    {
      basis: "de entregados",
      label: "Leídos",
      metric: formatPercent(ratioPercent(auditSummary.read, auditSummary.delivered)),
      value: formatNumber(auditSummary.read),
    },
    {
      basis: auditSummary.paymentReview > 0 ? "de carritos · incluye pagos en revisión" : "de carritos",
      label: "Recuperados",
      metric: formatPercent(ratioPercent(auditSummary.recovered, auditSummary.total)),
      value: formatNumber(auditSummary.recovered),
    },
    {
      basis: auditSummary.reviewAmount > 0
        ? `Confirmado: ${formatCurrency(auditSummary.confirmedAmount)} · En revisión: ${formatCurrency(auditSummary.reviewAmount)}`
        : "Ticket prom.",
      label: "Monto recuperado",
      metric: averageRecoveredTicket === null ? "?" : formatCurrency(averageRecoveredTicket),
      value: formatCurrency(auditSummary.recoveredAmount),
    },
  ];
  const weekOptions = useMemo(() => buildWeekOptions(rows), [rows]);
  const activeWeekStart = weekOptions.some((option) => option.value === selectedWeekStart)
    ? selectedWeekStart
    : weekOptions[0]?.value ?? currentSantiagoWeekStartKey();
  const previousWeekStart = addDateKeyDays(activeWeekStart, -7);
  const selectedWeekRows = useMemo(() => rowsForWeek(rows, activeWeekStart), [activeWeekStart, rows]);
  const weeklyBreakdown = useMemo(() => buildWeeklyBreakdown(selectedWeekRows), [selectedWeekRows]);
  const performanceSummary = useMemo(() => summarizeRowsForWeek(rows, activeWeekStart), [activeWeekStart, rows]);
  const previousPerformanceSummary = useMemo(
    () => summarizeRowsForWeek(rows, previousWeekStart),
    [previousWeekStart, rows],
  );
  const maxDailyAmount = Math.max(
    ...performanceSummary.days.map((day) => day.amount),
    ...previousPerformanceSummary.days.map((day) => day.amount),
    0,
  );
  const selectedWeekOption = weekOptions.find((option) => option.value === activeWeekStart);
  const comparisonCards = [
    {
      label: "Tasa recuperación",
      value: formatPercent(performanceSummary.averageRate),
      previous: `Anterior: ${formatPercent(previousPerformanceSummary.averageRate)}`,
      detail: `Confirmados: ${formatNumber(performanceSummary.funnel.confirmedRecovered)} · En revisión: ${formatNumber(performanceSummary.funnel.paymentReview)}`,
      delta: `${deltaPercentPoints(performanceSummary.averageRate, previousPerformanceSummary.averageRate)} vs semana anterior`,
      tone: recoveryRateDeltaTone(performanceSummary.averageRate, previousPerformanceSummary.averageRate),
    },
    {
      label: "Monto recuperado",
      value: formatCurrency(performanceSummary.totalAmount),
      previous: `Anterior: ${formatCurrency(previousPerformanceSummary.totalAmount)}`,
      detail: `Confirmado: ${formatCurrency(performanceSummary.funnel.confirmedAmount)} · En revisión: ${formatCurrency(performanceSummary.funnel.reviewAmount)}`,
      delta: `${deltaCurrency(performanceSummary.totalAmount, previousPerformanceSummary.totalAmount)} vs semana anterior`,
      tone: amountDeltaTone(performanceSummary.totalAmount, previousPerformanceSummary.totalAmount),
    },
    {
      label: "Carritos totales",
      value: formatNumber(performanceSummary.funnel.total),
      previous: `Anterior: ${formatNumber(previousPerformanceSummary.funnel.total)}`,
      delta: `${deltaNumber(performanceSummary.funnel.total, previousPerformanceSummary.funnel.total)} vs semana anterior`,
      tone: totalCartsDeltaTone(performanceSummary.funnel.total, previousPerformanceSummary.funnel.total),
    },
  ];
  const performanceFunnelCards = [
    {
      barPercent: performanceSummary.funnel.total > 0 ? 100 : 0,
      basis: performanceSummary.funnel.total > 0 ? "base semanal" : null,
      label: "Carritos",
      metric: performanceSummary.funnel.total > 0 ? "100%" : "?",
      value: formatNumber(performanceSummary.funnel.total),
    },
    {
      barPercent: ratioPercent(performanceSummary.funnel.sent, performanceSummary.funnel.total) ?? 0,
      basis: "de carritos",
      label: "Enviados",
      metric: formatPercent(ratioPercent(performanceSummary.funnel.sent, performanceSummary.funnel.total)),
      value: formatNumber(performanceSummary.funnel.sent),
    },
    {
      barPercent: ratioPercent(performanceSummary.funnel.delivered, performanceSummary.funnel.sent) ?? 0,
      basis: "de enviados",
      label: "Entregados",
      metric: formatPercent(ratioPercent(performanceSummary.funnel.delivered, performanceSummary.funnel.sent)),
      value: formatNumber(performanceSummary.funnel.delivered),
    },
    {
      barPercent: ratioPercent(performanceSummary.funnel.read, performanceSummary.funnel.delivered) ?? 0,
      basis: "de entregados",
      label: "Leídos",
      metric: formatPercent(ratioPercent(performanceSummary.funnel.read, performanceSummary.funnel.delivered)),
      value: formatNumber(performanceSummary.funnel.read),
    },
    {
      barPercent: ratioPercent(performanceSummary.funnel.recovered, performanceSummary.funnel.total) ?? 0,
      basis: performanceSummary.funnel.paymentReview > 0 ? "de carritos · incluye pagos en revisión" : "de carritos",
      label: "Recuperados",
      metric: formatPercent(ratioPercent(performanceSummary.funnel.recovered, performanceSummary.funnel.total)),
      value: formatNumber(performanceSummary.funnel.recovered),
    },
  ];
  useEffect(() => {
    setCurrentPage(1);
  }, [dateQuery, statusFilter, typeFilter, whatsappFilter]);

  useEffect(() => {
    if (pageRowIds.length === 0) return;

    const missingIds = pageRowIds.filter((id) => !chatIndicators[id]);

    if (missingIds.length === 0) return;

    const controller = new AbortController();

    async function loadChatIndicators() {
      try {
        const response = await fetch("/api/recuperacion/carritos/chat-indicators", {
          body: JSON.stringify({ cartIds: missingIds }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: controller.signal,
        });

        if (!response.ok) return;

        const payload = (await response.json()) as { indicators?: Record<string, ChatIndicator> };

        if (!payload.indicators) return;

        setChatIndicators((current) => ({ ...current, ...payload.indicators }));
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") return;
      }
    }

    void loadChatIndicators();

    return () => controller.abort();
  }, [chatIndicators, pageRowIds, pageRowIdsKey]);
  useEffect(() => {
    if (weekOptions.length === 0) {
      setSelectedWeekStart("");
      return;
    }

    if (!weekOptions.some((option) => option.value === selectedWeekStart)) {
      setSelectedWeekStart(weekOptions[0]?.value ?? "");
    }
  }, [selectedWeekStart, weekOptions]);


  function handleSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(defaultSortDirection(nextSortKey));
  }

  function sortIndicator(headerSortKey: SortKey) {
    if (sortKey !== headerSortKey) return "";

    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  return (
    <>
      {!error ? (
        <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white px-5 py-5 shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h3 className="text-base font-medium tracking-tight text-navy">Seguimiento de recuperación</h3>
              <p className="mt-1 text-sm text-slate-600">
                Evolución de tasa, monto y funnel sobre los carritos cargados en la auditoría.
              </p>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Semana</span>
                <select
                  className="min-w-44 rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
                  onChange={(event) => setSelectedWeekStart(event.target.value)}
                  value={activeWeekStart}
                >
                  {weekOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {selectedWeekOption ? (
                <p className="text-xs text-slate-500">{weekComparisonLabel(activeWeekStart)}</p>
              ) : null}
            </div>
          </div>

          {weekOptions.length === 0 ? (
            <p className="rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
              No hay datos suficientes para graficar el seguimiento.
            </p>
          ) : (
            <>
              <div className="mb-4 grid gap-3 md:grid-cols-3">
                {comparisonCards.map((card) => (
                  <div className="rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3" key={card.label}>
                    <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{card.label}</p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-2">
                      <span className="text-lg font-medium text-navy">{card.value}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${comparisonBadgeToneClasses(card.tone)}`}>
                        {card.delta}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{card.previous}</p>
                    {"detail" in card ? <p className="mt-1 text-[11px] text-slate-500">{card.detail}</p> : null}
                  </div>
                ))}
              </div>
              <div className="mb-4 rounded-xl border border-[#edf2f6] bg-[#fbfdfe] p-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Funnel semanal</p>
                <div className="mt-4 grid gap-3 md:grid-cols-5">
                  {performanceFunnelCards.map((stage) => (
                    <div className="rounded-lg border border-[#edf2f6] bg-white px-3 py-3" key={stage.label}>
                      <div className="flex items-baseline justify-between gap-3 md:block">
                        <span className="text-xs font-medium text-slate-600">{stage.label}</span>
                        <span className="text-sm font-medium text-navy md:mt-1 md:block">
                          {stage.value}{" "}
                          <span className="text-[11px] font-normal text-slate-500">{stage.metric}</span>
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-[#f8fafb] ring-1 ring-[#edf2f6]">
                        <div
                          className="h-1.5 rounded-full bg-sea"
                          style={{ width: `${Math.min(100, stage.barPercent)}%` }}
                        />
                      </div>
                      {stage.basis ? <p className="mt-1 text-[10px] text-slate-500">{stage.basis}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
              <div className="flex flex-col rounded-xl border border-[#edf2f6] bg-[#fbfdfe] p-4">
                <div className="flex min-h-[86px] items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                      Evolución diaria
                    </p>
                    <p className="mt-1 text-2xl font-medium text-navy">
                      {formatPercent(performanceSummary.averageRate)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">Tasa semanal</p>
                  </div>
                  <div className="text-right text-[11px] leading-5 text-slate-500">
                    {performanceSummary.bestDay ? (
                      <div>
                        Mejor: {shortDateLabel(performanceSummary.bestDay.dateKey)} ·{" "}
                        {formatPercent(performanceSummary.bestDay.recoveryRate)}
                      </div>
                    ) : null}
                    {performanceSummary.worstDay ? (
                      <div>
                        Peor: {shortDateLabel(performanceSummary.worstDay.dateKey)} ·{" "}
                        {formatPercent(performanceSummary.worstDay.recoveryRate)}
                      </div>
                    ) : null}
                  </div>
                </div>
                <PerformanceLineChart
                  formatTick={(value) => formatPercent(value)}
                  formatValue={(value) => formatPercent(value)}
                  points={performanceSummary.days.map((day) => ({
                    dateKey: day.dateKey,
                    meta: `${day.recovered} recuperados de ${day.total}`,
                    tooltipItems: [
                      ["Tasa recuperación", formatPercent(day.recoveryRate)],
                      ["Carritos", formatNumber(day.total)],
                      ["Recuperados", formatNumber(day.recovered)],
                      ["En revisión", formatNumber(day.paymentReview)],
                      ["Enviados", formatNumber(day.sent)],
                      ["Entregados", formatNumber(day.delivered)],
                      ["Leídos", formatNumber(day.read)],
                    ],
                    value: day.recoveryRate,
                  }))}
                  previousPoints={previousPerformanceSummary.days.map((day) => ({
                    dateKey: day.dateKey,
                    meta: `${day.recovered} recuperados de ${day.total}`,
                    tooltipItems: [
                      ["Tasa recuperación", formatPercent(day.recoveryRate)],
                      ["Carritos", formatNumber(day.total)],
                      ["Recuperados", formatNumber(day.recovered)],
                      ["En revisión", formatNumber(day.paymentReview)],
                      ["Enviados", formatNumber(day.sent)],
                      ["Entregados", formatNumber(day.delivered)],
                      ["Leídos", formatNumber(day.read)],
                    ],
                    value: day.recoveryRate,
                  }))}
                  seriesLabel="Tasa de recuperación diaria"
                  yMax={100}
                />
              </div>

              <div className="flex flex-col rounded-xl border border-[#edf2f6] bg-[#fbfdfe] p-4">
                <div className="flex min-h-[86px] items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                      Monto diario
                    </p>
                    <p className="mt-1 text-2xl font-medium text-navy">
                      {formatCurrency(performanceSummary.totalAmount)}
                    </p>
                  </div>
                  <p className="text-right text-[11px] leading-5 text-slate-500">Total del período</p>
                </div>
                <PerformanceLineChart
                  formatTick={formatCompactCurrency}
                  formatValue={formatCurrency}
                  points={performanceSummary.days.map((day) => ({
                    dateKey: day.dateKey,
                    meta: `${day.recovered} recuperados`,
                    tooltipItems: [
                      ["Monto recuperado", formatCurrency(day.amount)],
                      ["Confirmado", formatCurrency(day.confirmedAmount)],
                      ["En revisión", formatCurrency(day.reviewAmount)],
                      ["Recuperados", formatNumber(day.recovered)],
                      ["Ticket prom.", day.recovered > 0 ? formatCurrency(day.amount / day.recovered) : "-"],
                    ],
                    value: day.amount,
                  }))}
                  previousPoints={previousPerformanceSummary.days.map((day) => ({
                    dateKey: day.dateKey,
                    meta: `${day.recovered} recuperados`,
                    tooltipItems: [
                      ["Monto recuperado", formatCurrency(day.amount)],
                      ["Confirmado", formatCurrency(day.confirmedAmount)],
                      ["En revisión", formatCurrency(day.reviewAmount)],
                      ["Recuperados", formatNumber(day.recovered)],
                      ["Ticket prom.", day.recovered > 0 ? formatCurrency(day.amount / day.recovered) : "-"],
                    ],
                    value: day.amount,
                  }))}
                  seriesLabel="Monto recuperado diario"
                  yMax={roundedMoneyMax(maxDailyAmount)}
                />
              </div>

              </div>
              <div className="mt-4 rounded-xl border border-[#edf2f6] bg-white p-4">
                <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div>
                    <h4 className="text-sm font-medium tracking-tight text-navy">Detalle de la semana seleccionada</h4>
                    <p className="mt-1 text-xs text-slate-500">
                      Calculado sobre los carritos de la semana elegida. Incluye pagos en revisión como recuperación operativa.
                    </p>
                  </div>
                  <ValueBadge tone="info">{formatNumber(weeklyBreakdown.total)} carritos</ValueBadge>
                </div>
                {weeklyBreakdown.total === 0 ? (
                  <p className="rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
                    No hay carritos en la semana seleccionada.
                  </p>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-3">
                    <WeeklyBreakdownBlock
                      items={weeklyBreakdown.byType}
                      mode="conversion"
                      recoveredTotal={weeklyBreakdown.recoveredTotal}
                      title="Por tipo de carrito"
                    />
                    <WeeklyBreakdownBlock
                      items={weeklyBreakdown.byConfidence}
                      mode="confidence"
                      recoveredTotal={weeklyBreakdown.recoveredTotal}
                      title="Por confianza"
                    />
                    <WeeklyBreakdownBlock
                      items={weeklyBreakdown.byParking}
                      mode="conversion"
                      recoveredTotal={weeklyBreakdown.recoveredTotal}
                      title="Por parking"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      ) : null}

    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 border-b border-[#edf2f6] px-5 py-5 lg:flex-row lg:items-start">
        <div>
          <h2 className="text-base font-medium tracking-tight text-navy">Auditoría de carritos</h2>
        </div>
        <ValueBadge tone="info">{visibleRows.length} visibles</ValueBadge>
      </div>


      <div className="grid gap-3 border-b border-[#edf2f6] px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          <span>Fecha carrito</span>
          <input
            aria-label="Fecha carrito"
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            lang="es-CL"
            onChange={(event) => setDateQuery(event.target.value)}
            type="date"
            value={dateQuery}
          />
          <div className="mt-2 flex flex-wrap gap-2 normal-case tracking-normal">
            <button
              className="rounded-full border border-[#d6e1ea] bg-white px-3 py-1 text-xs font-medium text-navy transition hover:border-sea"
              onClick={() => setDateQuery(todayInputValue())}
              type="button"
            >
              Hoy
            </button>
            <button
              className="rounded-full border border-[#d6e1ea] bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-sea hover:text-navy"
              onClick={() => setDateQuery("")}
              type="button"
            >
              Limpiar fecha
            </button>
          </div>
          <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-slate-500">
            Formato: dd/mm/yyyy{dateQuery ? ` · ${formatDateOnly(dateQuery)}` : ""}
          </span>
        </div>

        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Estado
          <select
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            onChange={(event) => {
              setStatusFilter(event.target.value as StatusFilter);
            }}
            value={statusFilter}
          >
            <option value="all">Todos</option>
            <option value="recovered_with_amount">Recuperado con monto</option>
            <option value="recovered_pack">Recuperado sin monto / pack</option>
            <option value="payment_review">Pago en revisión</option>
            <option value="expired">Carrito expirado</option>
            <option value="not_recovered">No recuperado</option>
          </select>
        </label>

        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Tipo
          <select
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
            value={typeFilter}
          >
            <option value="all">Todos</option>
            <option value="abandoned">abandoned</option>
            <option value="canceled">canceled</option>
          </select>
        </label>

        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Estado WhatsApp
          <select
            className="mt-2 w-full rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm normal-case tracking-normal text-navy outline-none focus:border-sea"
            onChange={(event) => {
              setWhatsappFilter(event.target.value as WhatsappFilter);
            }}
            value={whatsappFilter}
          >
            <option value="all">Todos</option>
            <option value="read">Leído</option>
            <option value="delivered">Entregado</option>
            <option value="sent">Enviado</option>
            <option value="failed">Fallido</option>
            <option value="sin_seguimiento">Sin seguimiento</option>
          </select>
        </label>

      </div>

      {!error ? (
        <div className="border-b border-[#edf2f6] px-5 py-4">
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            {auditFunnelCards.map((item) => (
              <div className="relative rounded-lg border border-[#edf2f6] bg-[#fbfdfe] px-3 py-3" key={item.label}>
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{item.label}</p>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-lg font-medium text-navy">{item.value}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-[#edf2f6]">
                    {item.metric}
                  </span>
                </div>
                {item.basis ? <p className="mt-1 text-[11px] text-slate-500">{item.basis}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#f2b8b5] bg-[#fff5f5] px-3 py-2 text-sm leading-5 text-[#9a3412]">
            No se pudo cargar la auditoría de carritos: {error}
          </p>
        </div>
      ) : null}

      {!error && visibleRows.length === 0 ? (
        <div className="p-5">
          <p className="rounded-lg border border-[#d6e1ea] bg-[#fbfdfe] px-3 py-3 text-sm text-slate-600">
            No hay carritos para los filtros seleccionados.
          </p>
        </div>
      ) : null}

      {!error && visibleRows.length > 0 ? (
        <div className="px-5 py-5">
          <div>
          <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-xl border border-[#d6e1ea] text-xs">
            <thead className="bg-[#f8fafb] text-left text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <SortableHeader className="w-[7%]" label="Tipo" onSort={() => handleSort("type")} sortIndicator={sortIndicator("type")} />
                <SortableHeader className="w-[21%]" label="Contacto" onSort={() => handleSort("contact")} sortIndicator={sortIndicator("contact")} />
                <SortableHeader className="w-[7%]" label="Parking" onSort={() => handleSort("parking")} sortIndicator={sortIndicator("parking")} />
                <SortableHeader className="w-[10%]" label="Mensaje" onSort={() => handleSort("message")} sortIndicator={sortIndicator("message")} />
                <SortableHeader className="w-[12%]" label="Fecha carrito" onSort={() => handleSort("cart_date")} sortIndicator={sortIndicator("cart_date")} />
                <SortableHeader className="w-[12%]" label="Estado" onSort={() => handleSort("status")} sortIndicator={sortIndicator("status")} />
                <SortableHeader className="w-[10%]" label="Fecha compra" onSort={() => handleSort("purchase_date")} sortIndicator={sortIndicator("purchase_date")} />
                <SortableHeader className="w-[6%]" label="Horas" onSort={() => handleSort("hours")} sortIndicator={sortIndicator("hours")} />
                <SortableHeader className="w-[6%]" label="Monto" onSort={() => handleSort("amount")} sortIndicator={sortIndicator("amount")} />
                <SortableHeader className="w-[7%]" label="Conf." onSort={() => handleSort("confidence")} sortIndicator={sortIndicator("confidence")} />
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const chatIndicator = chatIndicators[row.id];
                const displayRow: RecoveryCartAuditRow = chatIndicator ? { ...row, ...chatIndicator } : row;
                const canOpenChat = displayRow.hasChat !== false;
                const chatDotClass = chatIndicator?.hasInbound
                  ? "bg-sea shadow-[0_0_0_3px_rgba(14,148,136,0.14)]"
                  : displayRow.hasChat === true
                    ? "bg-sky-400 shadow-[0_0_0_3px_rgba(56,189,248,0.14)]"
                    : displayRow.hasChat === false
                      ? "bg-slate-300/70"
                      : "bg-slate-300/50";

                return (
                <tr
                  aria-label={canOpenChat ? "Ver chat del carrito" : undefined}
                  className={`group bg-white transition odd:bg-[#fbfdfe] ${canOpenChat ? "cursor-pointer hover:bg-[#eef7f8]" : "cursor-default"}`}
                  key={row.id}
                  onClick={canOpenChat ? () => setSelectedChatCartId(row.id) : undefined}
                  onKeyDown={canOpenChat ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedChatCartId(row.id);
                    }
                  } : undefined}
                  role={canOpenChat ? "button" : undefined}
                  tabIndex={canOpenChat ? 0 : undefined}
                  title={intentTooltipTitle(displayRow)}
                >
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {row.cart_type ?? "Sin tipo"}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    <div className="flex items-center gap-1.5 font-medium text-navy">
                      <span className="min-w-0 break-all">{row.email ?? "Sin correo"}</span>
                      <span
                        aria-label={displayRow.hasChat === true && displayRow.chatMessageCount !== null ? `Chat disponible: ${formatNumber(displayRow.chatMessageCount)} mensajes` : displayRow.hasChat === false ? "Sin chat asociado" : "Chat bajo demanda"}
                        className={`h-2 w-2 shrink-0 rounded-full transition ${chatDotClass}`}
                        title={displayRow.hasChat === true && displayRow.chatMessageCount !== null ? `Chat disponible: ${formatNumber(displayRow.chatMessageCount)} mensajes` : displayRow.hasChat === false ? "Sin chat asociado" : "Chat bajo demanda"}
                      />
                    </div>
                    <div className="mt-1 break-all text-[11px] text-slate-500">{row.phone ?? "Sin telefono"}</div>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {row.parking_code ?? "Sin parking"}
                  </td>
                  <td className="relative border-b border-[#edf2f6] px-2 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <ValueBadge tone={messageSentTone(row.message_sent)}>
                        {messageSentLabel(row.message_sent)}
                      </ValueBadge>
                      <ValueBadge tone={whatsappStatusTone(row.whatsappStatus)}>
                        {whatsappStatusLabel(row.whatsappStatus)}
                      </ValueBadge>
                    </div>
                    {intentTooltipItems(displayRow).length > 0 ? (
                      <div className="pointer-events-none absolute left-2 top-full z-30 mt-2 hidden w-56 rounded-lg border border-[#d6e1ea] bg-white p-3 text-[11px] leading-4 text-slate-600 shadow-[0_12px_28px_rgba(2,53,116,0.16)] group-hover:block group-focus:block">
                        {intentTooltipItems(displayRow).map(([label, value]) => (
                          <div key={label}>
                            <span className="font-medium text-navy">{label}:</span> {value}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    <div>{formatDate(row.cart_form_datetime)}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Entrada: {formatDateOnly(row.intended_arrival_date)}
                    </div>
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3">
                    <ValueBadge tone={auditStatusTone(row.audit_status)}>
                      {auditStatusLabel(row.audit_status)}
                    </ValueBadge>
                    {row.recovery_review_note ? (
                      <p className="mt-1 text-[11px] leading-4 text-amber-700">{row.recovery_review_note}</p>
                    ) : null}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {formatDate(row.purchase_created_at)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 text-slate-700">
                    {formatHours(row.hours_to_purchase)}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3 font-medium text-navy">
                    {row.recovered || row.audit_status === "payment_review" ? formatCurrency(row.purchase_amount) : "-"}
                  </td>
                  <td className="border-b border-[#edf2f6] px-2 py-3">
                    {row.confidence ? (
                      <ValueBadge tone={confidenceTone(row.confidence)}>{row.confidence}</ValueBadge>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-[#edf2f6] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              {hasDateFilter
                ? `Mostrando ${formatNumber(visibleRows.length)} de ${formatNumber(visibleRows.length)}`
                : `Mostrando ${formatNumber(showingFrom)}-${formatNumber(showingTo)} de ${formatNumber(visibleRows.length)}`}
            </p>
            {shouldShowPaginationControls ? (
              <div className="flex gap-2">
                <button
                  className="rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm font-medium text-navy disabled:opacity-45"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="rounded-lg border border-[#d6e1ea] bg-white px-3 py-2 text-sm font-medium text-navy disabled:opacity-45"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  type="button"
                >
                  Siguiente
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

    </section>
      <RecoveryCartChatDrawer cartId={selectedChatCartId} onClose={() => setSelectedChatCartId(null)} />
    </>
  );
}

function SortableHeader({
  className,
  label,
  onSort,
  sortIndicator,
}: {
  className: string;
  label: string;
  onSort: () => void;
  sortIndicator: string;
}) {
  return (
    <th className={`${className} border-b border-[#d6e1ea] px-2 py-3`}>
      <button className="text-left font-medium uppercase tracking-[0.08em] hover:text-navy" onClick={onSort} type="button">
        {label}
        {sortIndicator}
      </button>
    </th>
  );
}
