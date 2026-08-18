import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("src/app/recuperacion/recovery-cart-audit-table.tsx", "utf8");

function chartBlock() {
  return source.slice(source.indexOf("function PerformanceLineChart"), source.indexOf("function WeeklyBreakdownBlock"));
}

test("daily evolution and amount charts share the trend-free line chart", () => {
  assert.match(source, /Evolución diaria/);
  assert.match(source, /Monto diario/);
  assert.equal((source.match(/<PerformanceLineChart/g) ?? []).length, 2);
  assert.doesNotMatch(chartBlock(), /Tendencia|trendValues|trendPoints|shouldShowTrend|#D66A6A/);
});

test("chart keeps selected and previous week series unchanged", () => {
  const chart = chartBlock();
  assert.match(chart, /Semana seleccionada/);
  assert.match(chart, /Semana anterior/);
  assert.match(chart, /pathFromPoints\(chartPoints\)/);
  assert.match(chart, /pathFromPoints\(previousChartPoints\)/);
  assert.match(chart, /const safeMax = yMax > 0 \? yMax : 1/);
});

test("cart date keeps the same value and labels intended arrival as Check-in", () => {
  const start = source.indexOf("<div>{formatDate(row.cart_form_datetime)}</div>");
  const dateCell = source.slice(start, source.indexOf("<ValueBadge tone={auditStatusTone", start));
  assert.match(dateCell, /formatDate\(row\.cart_form_datetime\)/);
  assert.match(dateCell, /Check-in: \{formatDateOnly\(row\.intended_arrival_date\)\}/);
  assert.equal((source.match(/Check-in: \{formatDateOnly\(row\.intended_arrival_date\)\}/g) ?? []).length, 2);
  assert.doesNotMatch(source, /Entrada:? \{formatDateOnly\(row\.intended_arrival_date\)\}/);
  assert.doesNotMatch(dateCell, /Entrada:/);
});

test("change remains presentation-only", () => {
  assert.match(source, /row\.intended_arrival_date/);
  assert.doesNotMatch(chartBlock(), /recovery_attributions|intended_arrival_at|fetch\(|\.rpc\(/);
});
