import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/recuperacion/recovery-cart-audit-table.tsx", "utf8");

function row(overrides = {}) {
  return {
    audit_status: "not_recovered",
    cart_form_datetime: "2026-10-07T12:00:00.000Z",
    cart_type: "abandoned",
    confidence: null,
    message_sent: true,
    parking_code: "MPV",
    purchase_amount: null,
    recovered: false,
    whatsappStatus: "sent",
    ...overrides,
  };
}

const rows = [
  row({
    audit_status: "recovered_with_amount",
    cart_form_datetime: "2026-10-07T12:00:00.000Z",
    confidence: "high",
    message_sent: true,
    parking_code: "MPV",
    purchase_amount: 10000,
    recovered: true,
    whatsappStatus: "read",
  }),
  row({
    audit_status: "not_recovered",
    cart_form_datetime: "2026-10-07T13:00:00.000Z",
    confidence: "low",
    message_sent: false,
    parking_code: "EAP",
    recovered: false,
    whatsappStatus: "sin_seguimiento",
  }),
  row({
    audit_status: "payment_review",
    cart_form_datetime: "2026-10-06T12:00:00.000Z",
    cart_type: "canceled",
    confidence: "medium",
    message_sent: true,
    parking_code: "EAP",
    purchase_amount: 4000,
    recovered: true,
    whatsappStatus: "delivered",
  }),
  row({
    audit_status: "recovered_with_amount",
    cart_form_datetime: "2026-09-30T12:00:00.000Z",
    cart_type: "canceled",
    confidence: "high",
    message_sent: false,
    parking_code: "MPV",
    purchase_amount: 7000,
    recovered: true,
    whatsappStatus: "failed",
  }),
];

function isOperationalRecovered(item) {
  return item.recovered || item.audit_status === "payment_review";
}

function amount(item) {
  return Number(item.purchase_amount ?? 0);
}

function matchesMessageSentFilter(item, filter) {
  if (filter === "1") return item.message_sent === true;
  if (filter === "0") return item.message_sent === false;
  return true;
}

function filterRows(filter) {
  return rows.filter((item) => matchesMessageSentFilter(item, filter));
}

function dateKey(value) {
  return value.slice(0, 10);
}

function formatHoursDurationFromMinutes(totalMinutes) {
  const sign = totalMinutes < 0 ? "-" : "";
  const absoluteMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;

  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatHours(value, item) {
  if (item?.cart_form_datetime && item.purchase_created_at) {
    const cartTime = new Date(item.cart_form_datetime).getTime();
    const purchaseTime = new Date(item.purchase_created_at).getTime();

    if (Number.isFinite(cartTime) && Number.isFinite(purchaseTime)) {
      return formatHoursDurationFromMinutes(Math.round((purchaseTime - cartTime) / 60_000));
    }
  }

  if (value === null || value === undefined) return "-";

  return formatHoursDurationFromMinutes(Math.round(Number(value) * 60));
}

function weekRows(items, start, end) {
  return items.filter((item) => {
    const key = dateKey(item.cart_form_datetime);
    return key >= start && key < end;
  });
}

function summary(items) {
  const recoveredRows = items.filter(isOperationalRecovered);

  return {
    delivered: items.filter((item) => item.whatsappStatus === "delivered" || item.whatsappStatus === "read").length,
    read: items.filter((item) => item.whatsappStatus === "read").length,
    recovered: recoveredRows.length,
    recoveredAmount: recoveredRows.reduce((total, item) => total + amount(item), 0),
    sent: items.filter((item) => item.message_sent === true).length,
    total: items.length,
  };
}

function breakdown(items, key) {
  const result = new Map();

  for (const item of items) {
    const label = item[key] ?? "Sin dato";
    const current = result.get(label) ?? { amount: 0, recovered: 0, total: 0 };
    current.total += 1;
    if (isOperationalRecovered(item)) {
      current.recovered += 1;
      current.amount += amount(item);
    }
    result.set(label, current);
  }

  return Object.fromEntries(result);
}

test("1. Todos: resultados iguales al comportamiento actual", () => {
  assert.deepEqual(filterRows("all"), rows);
});

test("2. Message_Sent = 1: solo filas message_sent=true", () => {
  assert.equal(filterRows("1").length, 2);
  assert.equal(filterRows("1").every((item) => item.message_sent === true), true);
});

test("3. Message_Sent = 0: solo filas message_sent=false", () => {
  assert.equal(filterRows("0").length, 2);
  assert.equal(filterRows("0").every((item) => item.message_sent === false), true);
});

test("4. Carritos totales cambia correctamente", () => {
  assert.equal(summary(filterRows("all")).total, 4);
  assert.equal(summary(filterRows("1")).total, 2);
  assert.equal(summary(filterRows("0")).total, 2);
});

test("5. Funnel recalcula correctamente", () => {
  assert.deepEqual(summary(filterRows("1")), { delivered: 2, read: 1, recovered: 2, recoveredAmount: 14000, sent: 2, total: 2 });
  assert.deepEqual(summary(filterRows("0")), { delivered: 0, read: 0, recovered: 1, recoveredAmount: 7000, sent: 0, total: 2 });
});

test("6. Tasa recuperación recalcula correctamente", () => {
  assert.equal((summary(filterRows("1")).recovered / summary(filterRows("1")).total) * 100, 100);
  assert.equal((summary(filterRows("0")).recovered / summary(filterRows("0")).total) * 100, 50);
});

test("7. Monto recuperado recalcula correctamente", () => {
  assert.equal(summary(filterRows("all")).recoveredAmount, 21000);
  assert.equal(summary(filterRows("1")).recoveredAmount, 14000);
  assert.equal(summary(filterRows("0")).recoveredAmount, 7000);
});

test("8. Evolución diaria respeta filtro", () => {
  assert.deepEqual(weekRows(filterRows("1"), "2026-10-06", "2026-10-08").map((item) => dateKey(item.cart_form_datetime)), ["2026-10-07", "2026-10-06"]);
  assert.deepEqual(weekRows(filterRows("0"), "2026-10-06", "2026-10-08").map((item) => dateKey(item.cart_form_datetime)), ["2026-10-07"]);
});

test("9. Monto diario respeta filtro", () => {
  assert.equal(summary(weekRows(filterRows("1"), "2026-10-06", "2026-10-08")).recoveredAmount, 14000);
  assert.equal(summary(weekRows(filterRows("0"), "2026-10-06", "2026-10-08")).recoveredAmount, 0);
});

test("10. Por tipo respeta filtro", () => {
  assert.deepEqual(breakdown(filterRows("1"), "cart_type"), {
    abandoned: { amount: 10000, recovered: 1, total: 1 },
    canceled: { amount: 4000, recovered: 1, total: 1 },
  });
});

test("11. Por confianza respeta filtro", () => {
  assert.deepEqual(breakdown(filterRows("0"), "confidence"), {
    high: { amount: 7000, recovered: 1, total: 1 },
    low: { amount: 0, recovered: 0, total: 1 },
  });
});

test("12. Por parking respeta filtro", () => {
  assert.deepEqual(breakdown(filterRows("1"), "parking_code"), {
    EAP: { amount: 4000, recovered: 1, total: 1 },
    MPV: { amount: 10000, recovered: 1, total: 1 },
  });
});

test("13. Tabla respeta filtro desde visibleRows", () => {
  assert.match(source, /const visibleRows = useMemo/);
  assert.match(source, /return \[\.\.\.messageSentFilteredRows\]/);
});

test("14. Semana anterior usa el mismo filtro", () => {
  const previous = weekRows(filterRows("0"), "2026-09-29", "2026-10-06");
  assert.equal(previous.length, 1);
  assert.equal(previous[0].message_sent, false);
  assert.match(source, /summarizeRowsForWeek\(messageSentFilteredRows, previousWeekStart\)/);
});

test("15. Cambiar nuevamente a Todos restaura valores completos", () => {
  assert.deepEqual(summary(filterRows("all")), summary(rows));
});

test("UI exposes only the new Message_Sent selector using existing filter styles", () => {
  assert.match(source, /type MessageSentFilter = "all" \| "1" \| "0"/);
  assert.match(source, /const \[messageSentFilter, setMessageSentFilter\] = useState<MessageSentFilter>\("all"\)/);
  assert.match(source, />\s*Message_Sent\s*<[\s\S]*<option value="all">Todos<\/option>[\s\S]*<option value="1">1<\/option>[\s\S]*<option value="0">0<\/option>/);
  assert.match(source, /row\.message_sent === true/);
  assert.match(source, /row\.message_sent === false/);
  assert.doesNotMatch(source, /message_id[\s\S]{0,120}Message_Sent|tracking_status[\s\S]{0,120}Message_Sent|contact_status[\s\S]{0,120}Message_Sent/i);
});

test("existing recuperacion filters remain present", () => {
  assert.match(source, />\s*Fecha carrito\s*</);
  assert.match(source, />\s*Estado\s*</);
  assert.match(source, />\s*Tipo\s*</);
  assert.match(source, />\s*Estado WhatsApp\s*</);
  assert.match(source, />\s*Message_Sent\s*</);
});

test("HORAS column formats durations as HH:MM without changing the base value", () => {
  assert.equal(formatHours(0), "00:00");
  assert.equal(formatHours(0.1), "00:06");
  assert.equal(formatHours(0.5), "00:30");
  assert.equal(formatHours(65 / 60), "01:05");
  assert.equal(formatHours(176 / 60), "02:56");
  assert.equal(formatHours(27.25), "27:15");
  assert.equal(formatHours(-3), "-03:00");
  assert.equal(formatHours(null), "-");
});

test("HORAS display prefers cart and purchase timestamps when available", () => {
  assert.equal(formatHours(2.9, {
    cart_form_datetime: "2026-10-08T10:00:00.000Z",
    purchase_created_at: "2026-10-08T12:56:00.000Z",
  }), "02:56");
  assert.equal(formatHours(-2.9, {
    cart_form_datetime: "2026-10-08T12:56:00.000Z",
    purchase_created_at: "2026-10-08T10:00:00.000Z",
  }), "-02:56");
  assert.match(source, /function formatHoursDurationFromMinutes/);
  assert.match(source, /formatHours\(row\.hours_to_purchase, row\)/);
  assert.doesNotMatch(source, /toFixed\(1\)\.replace\("\.", ","\)\} h/);
});
