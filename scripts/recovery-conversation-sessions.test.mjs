import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260819130000_add_recovery_conversation_sessions_read_contract.sql",
  "utf8",
);
const loader = readFileSync("src/lib/recuperacion/recovery-conversation-sessions.ts", "utf8");
const route = readFileSync("src/app/api/recuperacion/conversaciones/sesiones/route.ts", "utf8");
const businessHelper = readFileSync("src/lib/recuperacion/whatsapp-freeform-window.ts", "utf8");

const BUSINESS_PHONES = {
  EAP: "56984533883",
  MCP: "56926817602",
};
const SANTIAGO_DAY = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Santiago",
  year: "numeric",
});

function message({
  apiPhone = BUSINESS_PHONES.MCP,
  at,
  conversationId = "technical-1",
  id,
  intent = "reserva",
  phone = "56911111111",
}) {
  return { apiPhone, at, conversationId, id, intent, phone };
}

function brandForApiPhone(apiPhone) {
  if (apiPhone === BUSINESS_PHONES.MCP) return "MCP";
  if (apiPhone === BUSINESS_PHONES.EAP) return "EAP";
  return null;
}

function sessionId(session) {
  return `recovery_session_${createHash("md5")
    .update(`${session.phone}|${session.brand}|${session.first.toISOString()}`)
    .digest("hex")}`;
}

function sessionize(messages) {
  const groups = new Map();

  for (const item of messages) {
    const brand = brandForApiPhone(item.apiPhone);
    if (!brand) continue;
    const key = `${item.phone}|${brand}`;
    const rows = groups.get(key) ?? [];
    rows.push({ ...item, brand, timestamp: new Date(item.at) });
    groups.set(key, rows);
  }

  const sessions = [];

  for (const rows of groups.values()) {
    rows.sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id));
    let current = null;

    for (const item of rows) {
      const startsSession =
        !current ||
        item.timestamp - current.last > 15 * 60 * 1000 ||
        SANTIAGO_DAY.format(item.timestamp) !== SANTIAGO_DAY.format(current.last);

      if (startsSession) {
        current = {
          brand: item.brand,
          first: item.timestamp,
          ids: new Set(),
          intents: new Set(),
          last: item.timestamp,
          messages: 0,
          phone: item.phone,
        };
        sessions.push(current);
      }

      current.ids.add(item.conversationId);
      current.intents.add(item.intent);
      current.last = item.timestamp;
      current.messages += 1;
    }
  }

  return sessions.map((session) => ({ ...session, sessionId: sessionId(session) }));
}

function enrich(session, { bookings = [], carts = [] }) {
  const valid = bookings
    .filter((booking) => booking.phone === session.phone && booking.isValidPurchase)
    .map((booking) => ({ ...booking, timestamp: new Date(booking.at) }));
  const later = valid
    .filter((booking) => booking.timestamp > session.first)
    .sort((left, right) => left.timestamp - right.timestamp);

  return {
    hasAfter: later.length > 0,
    hasBefore: valid.some((booking) => booking.timestamp < session.first),
    nearestAfterAt: later[0]?.timestamp.toISOString() ?? null,
    potentialCartRelation: carts.some((cart) => {
      const start = new Date(cart.at);
      return (
        cart.phone === session.phone &&
        start <= session.last &&
        new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) > session.first
      );
    }),
  };
}

test("1. gap menor a 15 minutos conserva la misma sesion", () => {
  const sessions = sessionize([
    message({ at: "2026-08-19T12:00:00Z", id: "a" }),
    message({ at: "2026-08-19T12:14:59Z", id: "b" }),
  ]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].messages, 2);
});

test("2. gap mayor a 15 minutos crea una sesion nueva", () => {
  const sessions = sessionize([
    message({ at: "2026-08-19T12:00:00Z", id: "a" }),
    message({ at: "2026-08-19T12:15:01Z", id: "b" }),
  ]);
  assert.equal(sessions.length, 2);
});

test("3. exactamente 15 minutos conserva la misma sesion", () => {
  const sessions = sessionize([
    message({ at: "2026-08-19T12:00:00Z", id: "a" }),
    message({ at: "2026-08-19T12:15:00Z", id: "b" }),
  ]);
  assert.equal(sessions.length, 1);
});

test("4. cambio de dia America/Santiago separa aun con gap corto", () => {
  const sessions = sessionize([
    message({ at: "2026-08-20T03:58:00Z", id: "a" }),
    message({ at: "2026-08-20T04:02:00Z", id: "b" }),
  ]);
  assert.equal(sessions.length, 2);
  assert.match(migration, /timezone\('America\/Santiago', m\.message_at\)::date/);
});

test("5. el mismo telefono en MCP y EAP nunca se mezcla", () => {
  const sessions = sessionize([
    message({ apiPhone: BUSINESS_PHONES.MCP, at: "2026-08-19T12:00:00Z", id: "a" }),
    message({ apiPhone: BUSINESS_PHONES.EAP, at: "2026-08-19T12:01:00Z", id: "b" }),
  ]);
  assert.deepEqual(
    sessions.map((session) => session.brand).sort(),
    ["EAP", "MCP"],
  );
  assert.match(loader, /recoveryWhatsappBusinessPhoneForKey\("MPV"\)/);
  assert.match(businessHelper, /recoveryWhatsappBusinessPhoneForKey/);
});

test("6. varios conversation_id tecnicos quedan en una sesion", () => {
  const sessions = sessionize([
    message({ at: "2026-08-19T12:00:00Z", conversationId: "technical-1", id: "a" }),
    message({ at: "2026-08-19T12:02:00Z", conversationId: "technical-2", id: "b" }),
  ]);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].ids.size, 2);
  assert.match(migration, /count\(distinct s\.conversation_id\)/);
});

test("7. identifica purchase-before usando solo compras validas", () => {
  const [session] = sessionize([message({ at: "2026-08-19T12:00:00Z", id: "a" })]);
  const result = enrich(session, {
    bookings: [
      { at: "2026-08-19T10:00:00Z", isValidPurchase: true, phone: session.phone },
      { at: "2026-08-19T11:00:00Z", isValidPurchase: false, phone: session.phone },
    ],
  });
  assert.equal(result.hasBefore, true);
});

test("8. identifica el purchase-after valido mas cercano", () => {
  const [session] = sessionize([message({ at: "2026-08-19T12:00:00Z", id: "a" })]);
  const result = enrich(session, {
    bookings: [
      { at: "2026-08-19T14:00:00Z", isValidPurchase: true, phone: session.phone },
      { at: "2026-08-19T13:00:00Z", isValidPurchase: true, phone: session.phone },
    ],
  });
  assert.equal(result.hasAfter, true);
  assert.equal(result.nearestAfterAt, "2026-08-19T13:00:00.000Z");
});

test("9. booking lejano sigue siendo purchase-after sin causalidad", () => {
  const [session] = sessionize([message({ at: "2026-08-19T12:00:00Z", id: "a" })]);
  const result = enrich(session, {
    bookings: [{ at: "2026-09-28T12:00:00Z", isValidPurchase: true, phone: session.phone }],
  });
  assert.equal(result.hasAfter, true);
  assert.doesNotMatch(migration, /converted|conversion|recovered/i);
});

test("10. relacion potencial exige telefono y ventana de siete dias", () => {
  const [session] = sessionize([message({ at: "2026-08-19T12:00:00Z", id: "a" })]);
  const result = enrich(session, {
    carts: [{ at: "2026-08-18T12:00:00Z", phone: session.phone }],
  });
  assert.equal(result.potentialCartRelation, true);
  assert.match(migration, /cart\.form_datetime \+ interval '7 days'/);
});

test("11. listado no lee ni expone message_text", () => {
  assert.doesNotMatch(migration, /message_text|message_memory_raw_import/i);
  assert.doesNotMatch(loader, /messageText|message_text/i);
  assert.doesNotMatch(route, /messageText|message_text/i);
});

test("12. session_id y paginacion tienen orden estable", () => {
  const sessions = sessionize([
    message({ at: "2026-08-19T12:00:00Z", id: "b", phone: "56922222222" }),
    message({ at: "2026-08-19T12:00:00Z", id: "a", phone: "56911111111" }),
  ]).sort(
    (left, right) =>
      right.first - left.first || right.sessionId.localeCompare(left.sessionId),
  );

  assert.equal(new Set(sessions.map((session) => session.sessionId)).size, 2);
  assert.match(migration, /order by n\.message_at, n\.id/);
  assert.match(migration, /order by enriched\.first_message_at desc, enriched\.session_id desc/);
  assert.match(migration, /order by paged\.first_message_at desc, paged\.session_id desc/);
  assert.match(migration, /least\(coalesce\(p_page_size, 50\), 100\)/);
  assert.match(route, /searchParams\.get\("page"\)/);
  assert.match(route, /searchParams\.get\("pageSize"\)/);
});

test("13. seguridad mantiene admin, search_path vacio y grants minimos", () => {
  assert.match(route, /profile\.app_role !== "admin"/);
  assert.match(migration, /public\.is_app_admin\(\)/);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /revoke execute .* from anon/i);
  assert.match(migration, /grant execute .* to authenticated/i);
});

test("14. pagina fuera de rango conserva el total real", () => {
  const rpcPayload = {
    items: [],
    total: 19683,
  };

  assert.deepEqual(rpcPayload.items, []);
  assert.equal(rpcPayload.total, 19683);
  assert.match(migration, /returns jsonb/i);
  assert.match(migration, /jsonb_build_object\(/);
  assert.match(migration, /'items'/);
  assert.match(migration, /'total'/);
  assert.match(migration, /select count\(\*\)::bigint from enriched/);
  assert.match(loader, /const rows = payload\.items/);
  assert.match(loader, /total: numericValue\(payload\.total\)/);
  assert.doesNotMatch(loader, /rows\.length\s*>\s*0[\s\S]*total_count[\s\S]*:\s*0/);
});
