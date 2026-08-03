import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260802120000_create_recovery_weekly_snapshots.sql";
const helperPath = "src/lib/recuperacion/recovery-snapshots.ts";
const attributionPath = "src/lib/recuperacion/recovery-attribution.ts";
const docPath = "docs/recovery_weekly_snapshots.md";

const migration = readFileSync(migrationPath, "utf8");
const helper = readFileSync(helperPath, "utf8");
const attribution = readFileSync(attributionPath, "utf8");
const doc = readFileSync(docPath, "utf8");

function assertHas(source, pattern, message) {
  assert.match(source, pattern, message);
}

function assertNotHas(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}
function timeZoneParts(timeZone, date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);

  const valueFor = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    day: valueFor("day"),
    hour: valueFor("hour"),
    minute: valueFor("minute"),
    month: valueFor("month"),
    second: valueFor("second"),
    year: valueFor("year"),
  };
}

function timeZoneOffsetMs(timeZone, date) {
  const parts = timeZoneParts(timeZone, date);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  return asUtc - date.getTime();
}

function zonedMidnightToUtcIso(timeZone, year, month, day) {
  const guess = new Date(Date.UTC(year, month - 1, day));
  const firstPass = new Date(guess.getTime() - timeZoneOffsetMs(timeZone, guess));
  const secondPass = new Date(guess.getTime() - timeZoneOffsetMs(timeZone, firstPass));

  return secondPass.toISOString();
}

function santiagoDateOnlyToUtcIsoForTest(value) {
  const [year, month, day] = value.split("-").map(Number);
  return zonedMidnightToUtcIso("America/Santiago", year, month, day);
}

function dateKeyForSantiagoForTest(value) {
  const date = new Date(value);
  const parts = timeZoneParts("America/Santiago", date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
async function fetchRowsInPagesForTest(queryFactory, pageSize = 1000) {
  const rows = [];
  const ranges = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    ranges.push([from, to]);
    const { data, error } = await queryFactory().range(from, to);

    if (error) {
      return { data: [], error, ranges };
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) {
      return { data: rows, error: null, ranges };
    }

    from += pageSize;
  }
}

function createPagedQueryForTest(rows, options = {}) {
  return {
    range(from, to) {
      if (options.errorFrom !== undefined && from >= options.errorFrom) {
        return Promise.resolve({ data: null, error: { message: "page failed" } });
      }

      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  };
}

test("1. migration creates aggregate snapshot table", () => {
  assertHas(migration, /create table if not exists public\.recovery_weekly_snapshots/i);
});

test("2. migration creates cart detail snapshot table", () => {
  assertHas(migration, /create table if not exists public\.recovery_weekly_cart_snapshots/i);
});

test("3. aggregate table has uuid primary key", () => {
  assertHas(migration, /id uuid primary key default gen_random_uuid\(\)/i);
});

test("4. detail table references aggregate snapshot with cascade delete", () => {
  assertHas(migration, /snapshot_id uuid not null references public\.recovery_weekly_snapshots\(id\) on delete cascade/i);
});

test("5. snapshot_key and payload_hash are present and constrained", () => {
  assertHas(migration, /constraint recovery_weekly_snapshots_snapshot_key_unique unique \(snapshot_key\)/i);
  assertHas(migration, /payload_hash text not null/i);
  assertHas(migration, /constraint recovery_weekly_snapshots_payload_hash_check check \(length\(trim\(payload_hash\)\) > 0\)/i);
});

test("6. detail enforces one cart per snapshot", () => {
  assertHas(migration, /constraint recovery_weekly_cart_snapshots_snapshot_cart_unique unique \(snapshot_id, cart_id\)/i);
});

test("7. status constraint uses canonical states", () => {
  for (const status of ["recovered_with_amount", "recovered_pack", "payment_review", "unrecovered"]) {
    assertHas(migration, new RegExp(`'${status}'`));
  }
});

test("8. aggregate count constraints are present", () => {
  assertHas(migration, /operational_recovered = recovered_confirmed \+ recovered_review/i);
  assertHas(migration, /carts_total = operational_recovered \+ unrecovered/i);
});

test("9. recovery rate is constrained", () => {
  assertHas(migration, /recovery_rate >= 0 and recovery_rate <= 100/i);
});

test("10. RLS is enabled on both tables", () => {
  assertHas(migration, /alter table public\.recovery_weekly_snapshots enable row level security/i);
  assertHas(migration, /alter table public\.recovery_weekly_cart_snapshots enable row level security/i);
});

test("11. anon and authenticated do not receive direct table access", () => {
  assertHas(migration, /revoke all on table public\.recovery_weekly_snapshots from anon/i);
  assertHas(migration, /revoke all on table public\.recovery_weekly_cart_snapshots from authenticated/i);
  assertNotHas(migration, /grant (?:insert|update|delete|all).* to anon/i);
  assertNotHas(migration, /grant (?:insert|update|delete|all).* to authenticated/i);
});

test("12. useful indexes are present without relying only on primary keys", () => {
  for (const indexName of [
    "recovery_weekly_snapshots_week_snapshot_at_idx",
    "recovery_weekly_snapshots_trigger_batch_idx",
    "recovery_weekly_snapshots_payload_hash_idx",
    "recovery_weekly_cart_snapshots_snapshot_id_idx",
    "recovery_weekly_cart_snapshots_cart_id_idx",
    "recovery_weekly_cart_snapshots_status_idx",
    "recovery_weekly_cart_snapshots_week_cart_idx",
  ]) {
    assertHas(migration, new RegExp(indexName, "i"));
  }
});

test("13. create snapshot RPC exists", () => {
  assertHas(migration, /create or replace function public\.create_recovery_weekly_snapshot/i);
});

test("14. RPC uses SECURITY DEFINER and safe search_path", () => {
  assertHas(migration, /security definer/i);
  assertHas(migration, /set search_path = ''/i);
});

test("15. RPC accepts required idempotency and payload parameters", () => {
  for (const parameter of ["p_snapshot_key text", "p_summary jsonb", "p_cart_results jsonb", "p_calculation_version text"]) {
    assertHas(migration, new RegExp(parameter, "i"));
  }
});

test("16. RPC locks by snapshot_key and validates existing snapshot before retry succeeds", () => {
  assertHas(migration, /pg_advisory_xact_lock\(hashtext\('recovery_weekly_snapshot'\), hashtext\(v_snapshot_key\)\)/i);
  assertHas(migration, /where recovery_weekly_snapshots\.snapshot_key = v_snapshot_key/i);
  assertHas(migration, /if v_existing\.payload_hash <> v_payload_hash/i);
  assertHas(migration, /snapshot_key_conflict/i);
  assertHas(migration, /created := false/i);
});

test("17. RPC validates cart_results is an array", () => {
  assertHas(migration, /jsonb_typeof\(p_cart_results\) <> 'array'/i);
});

test("18. RPC validates duplicate cart_id values", () => {
  assertHas(migration, /duplicate_cart_ids as/i);
  assertHas(migration, /having count\(\*\) > 1/i);
  assertHas(migration, /cart_results failed validation/i);
});

test("19. RPC derives carts_total from detail", () => {
  assertHas(migration, /count\(\*\)::integer as carts_total/i);
  assertHas(migration, /v_summary_carts_total <> v_carts_total/i);
});

test("20. RPC derives recovered_confirmed from detail statuses", () => {
  assertHas(migration, /recovery_status in \('recovered_with_amount', 'recovered_pack'\)\)::integer as recovered_confirmed/i);
  assertHas(migration, /v_summary_recovered_confirmed <> v_recovered_confirmed/i);
});

test("21. RPC derives recovered_review and unrecovered from detail statuses", () => {
  assertHas(migration, /recovery_status = 'payment_review'\)::integer as recovered_review/i);
  assertHas(migration, /recovery_status = 'unrecovered'\)::integer as unrecovered/i);
});

test("22. RPC validates recovered amount against detail", () => {
  assertHas(migration, /sum\(case when recovery_status <> 'unrecovered' then coalesce\(attributed_amount, 0\) else 0 end\)/i);
  assertHas(migration, /abs\(v_summary_recovered_amount - v_recovered_amount\) > 0\.009/i);
});

test("23. RPC derives operational recovered and recovery rate", () => {
  assertHas(migration, /v_recovered_confirmed,\s*v_recovered_review,\s*v_unrecovered,\s*v_operational_recovered/s);
  assertHas(migration, /derived\.recovered_confirmed \+ derived\.recovered_review/i);
  assertHas(migration, /derived\.carts_total = 0 then 0::numeric\(8,5\)/i);
  assertHas(migration, /abs\(v_summary_recovery_rate - v_recovery_rate\) > 0\.00001/i);
});

test("24. RPC supports carts_total zero", () => {
  assertHas(migration, /when derived\.carts_total = 0 then 0::numeric\(8,5\)/i);
});

test("25. RPC persists aggregate and detail in one function", () => {
  assertHas(migration, /insert into public\.recovery_weekly_snapshots/i);
  assertHas(migration, /insert into public\.recovery_weekly_cart_snapshots/i);
});

test("26. defensive PII helper exists and checks object, array and scalars safely", () => {
  assertHas(migration, /create or replace function public\.recovery_jsonb_contains_forbidden_keys\(p_value jsonb\)/i);
  assertHas(migration, /case jsonb_typeof\(p_value\)/i);
  assertHas(migration, /when 'object' then/i);
  assertHas(migration, /from jsonb_each\(p_value\)/i);
  assertHas(migration, /when 'array' then/i);
  assertHas(migration, /from jsonb_array_elements\(p_value\)/i);
  assertHas(migration, /else\s+return false;/i);
});

test("27. PII helper rejects required forbidden keys", () => {
  for (const key of ["email", "phone", "telefono", "nombre", "name", "wamid", "wa_id", "message_text", "message_body", "payload"]) {
    assertHas(migration, new RegExp(`'${key}'`, "i"));
  }
  assertHas(migration, /public\.recovery_jsonb_contains_forbidden_keys\(p_cart_results\)/i);
});

test("28. detail constraints encode recovered_with_amount valid and invalid cases", () => {
  assertHas(migration, /when 'recovered_with_amount' then attributed_purchase_id is not null and attributed_amount > 0/i);
});

test("29. detail constraints encode recovered_pack valid and invalid cases", () => {
  assertHas(migration, /when 'recovered_pack' then attributed_purchase_id is not null and coalesce\(attributed_amount, 0\) = 0/i);
});

test("30. detail constraints encode payment_review valid case", () => {
  assertHas(migration, /when 'payment_review' then coalesce\(attributed_amount, 0\) = 0/i);
});

test("31. detail constraints encode unrecovered valid and invalid cases", () => {
  assertHas(migration, /when 'unrecovered' then attributed_purchase_id is null and attributed_purchase_at is null and coalesce\(attributed_amount, 0\) = 0/i);
});

test("32. normalized payload hash sorts cart_results by cart_id", () => {
  assertHas(migration, /jsonb_agg\([\s\S]*order by cart_id[\s\S]*\) as rows/i);
  assertHas(migration, /v_payload_hash := md5\(v_normalized_payload::text\)/i);
});

test("33. payload hash includes summary metadata and detail", () => {
  for (const key of ["calculation_version", "carts_total", "detail", "recovered_amount", "recovered_confirmed", "recovered_review", "recovery_rate", "snapshot_kind", "trigger_batch_id", "unrecovered", "week_end", "week_start"]) {
    assertHas(migration, new RegExp(`'${key}'`, "i"));
  }
});

test("34. create snapshot RPC execution is granted only to service_role", () => {
  assertHas(migration, /revoke execute on function public\.create_recovery_weekly_snapshot[\s\S]*from anon/i);
  assertHas(migration, /revoke execute on function public\.create_recovery_weekly_snapshot[\s\S]*from authenticated/i);
  assertHas(migration, /grant execute on function public\.create_recovery_weekly_snapshot[\s\S]*to service_role/i);
});

test("35. PII helper has no anon or authenticated execution", () => {
  assertHas(migration, /revoke execute on function public\.recovery_jsonb_contains_forbidden_keys\(jsonb\) from anon/i);
  assertHas(migration, /revoke execute on function public\.recovery_jsonb_contains_forbidden_keys\(jsonb\) from authenticated/i);
});

test("36. comparison function exists", () => {
  assertHas(migration, /create or replace function public\.recovery_compare_snapshots/i);
});

test("37. comparison validates snapshots exist", () => {
  assertHas(migration, /snapshot_not_found/i);
});

test("38. comparison validates same week", () => {
  assertHas(migration, /snapshot_week_mismatch/i);
  assertHas(migration, /v_previous\.week_start <> v_current\.week_start or v_previous\.week_end <> v_current\.week_end/i);
});

test("39. comparison validates same calculation version", () => {
  assertHas(migration, /snapshot_calculation_version_mismatch/i);
});

test("40. comparison filters each snapshot before FULL OUTER JOIN", () => {
  assertHas(migration, /previous_rows as \([\s\S]*where snapshot_id = p_previous_snapshot_id[\s\S]*\), current_rows as/i);
  assertHas(migration, /current_rows as \([\s\S]*where snapshot_id = p_current_snapshot_id[\s\S]*\)/i);
  assertHas(migration, /from previous_rows\s+full outer join current_rows using \(cart_id\)/i);
});

test("41. comparison exposes all change flags", () => {
  for (const flag of ["status_changed", "purchase_changed", "amount_changed", "intended_arrival_changed", "cart_changed", "purchase_data_changed"]) {
    assertHas(migration, new RegExp(`${flag} boolean`, "i"));
    assertHas(migration, new RegExp(`as ${flag}`, "i"));
  }
});

test("42. comparison detects added, removed and unchanged carts", () => {
  for (const reason of ["added_to_snapshot", "removed_from_snapshot", "unchanged"]) {
    assertHas(migration, new RegExp(`'${reason}'`, "i"));
  }
});

test("43. comparison function is service_role only", () => {
  assertHas(migration, /grant execute on function public\.recovery_compare_snapshots\(uuid, uuid\) to service_role/i);
  assertHas(migration, /revoke execute on function public\.recovery_compare_snapshots\(uuid, uuid\) from authenticated/i);
});

test("44. backend helper uses canonical attribution source", () => {
  assertHas(helper, /RECOVERY_ATTRIBUTION_CALCULATION_VERSION/);
  assertHas(helper, /resolveRecoveryAttributions/);
  assertHas(helper, /summarizeRecoveryAttributions/);
  assertHas(attribution, /v1-intended-arrival/);
});

test("45. backend helper does not use legacy attribution view", () => {
  assertNotHas(helper, /v_recovery_attribution_cases/);
});

test("46. backend helper writes only through create_recovery_weekly_snapshot RPC", () => {
  assertHas(helper, /\.rpc\("create_recovery_weekly_snapshot"/);
  assertNotHas(helper, /\.insert\s*\(/);
  assertNotHas(helper, /\.update\s*\(/);
  assertNotHas(helper, /\.delete\s*\(/);
  assertNotHas(helper, /\.upsert\s*\(/);
});

test("47. backend helper sends deterministic cart_results order", () => {
  assertHas(helper, /sort\(\(left, right\) => left\.cart_id\.localeCompare\(right\.cart_id\)\)/);
});

test("48. DTO types avoid PII and message payload fields", () => {
  const dtoBlock = helper.slice(helper.indexOf("export type RecoveryWeeklySnapshotSummaryInput"), helper.indexOf("type CartSnapshotSourceRow"));
  for (const forbidden of ["email", "phone", "name", "wamid", "message_text", "message_id", "payload", "token"]) {
    assertNotHas(dtoBlock, new RegExp(forbidden, "i"), `DTO block should not contain ${forbidden}`);
  }
});

test("49. snapshot helper is not connected to import endpoints", () => {
  const endpointFiles = [
    "src/app/api/recuperacion/carritos/importar/route.ts",
    "src/app/api/recuperacion/compras/importar/route.ts",
    "src/app/api/recuperacion/seguimiento/importar/route.ts",
    "src/app/api/recuperacion/message-memory/importar/route.ts",
  ];

  for (const file of endpointFiles) {
    const source = readFileSync(file, "utf8");
    assertNotHas(source, /createRecoveryWeeklySnapshot|recovery-snapshots|create_recovery_weekly_snapshot/);
  }
});

test("50. documentation explains hardened architecture and limitations", () => {
  for (const pattern of [/TypeScript calcula/i, /payload_hash/i, /snapshot_key_conflict/i, /misma semana/i, /aun no esta aplicada/i, /todavia no llaman snapshots/i, /reconstructed/i]) {
    assertHas(doc, pattern);
  }
});

test("51. all expected artifacts exist", () => {
  for (const file of [migrationPath, helperPath, docPath]) {
    assert.equal(existsSync(file), true, `${file} should exist`);
  }
});

test("52. snapshot helper converts Santiago winter week boundaries to UTC", () => {
  assert.equal(santiagoDateOnlyToUtcIsoForTest("2026-07-20"), "2026-07-20T04:00:00.000Z");
  assert.equal(santiagoDateOnlyToUtcIsoForTest("2026-07-27"), "2026-07-27T04:00:00.000Z");
});

test("53. snapshot helper converts Santiago summer week boundaries with daylight saving offset", () => {
  assert.equal(santiagoDateOnlyToUtcIsoForTest("2026-01-05"), "2026-01-05T03:00:00.000Z");
  assert.equal(santiagoDateOnlyToUtcIsoForTest("2026-01-12"), "2026-01-12T03:00:00.000Z");
});

test("54. snapshot helper handles month and year boundary weeks", () => {
  assert.equal(santiagoDateOnlyToUtcIsoForTest("2026-08-31"), "2026-08-31T04:00:00.000Z");
  assert.equal(santiagoDateOnlyToUtcIsoForTest("2026-09-07"), "2026-09-07T03:00:00.000Z");
  assert.equal(santiagoDateOnlyToUtcIsoForTest("2026-12-28"), "2026-12-28T03:00:00.000Z");
  assert.equal(santiagoDateOnlyToUtcIsoForTest("2027-01-04"), "2027-01-04T03:00:00.000Z");
});

test("55. snapshot helper does not use date-only values as direct 00:00Z filters", () => {
  assertHas(helper, /const weekStartUtc = santiagoDateOnlyToUtcIso\(input\.weekStart\)/);
  assertHas(helper, /const weekEndUtc = santiagoDateOnlyToUtcIso\(input\.weekEnd\)/);
  assertHas(helper, /\.gte\("form_datetime", weekStartUtc\)/);
  assertHas(helper, /\.lt\("form_datetime", weekEndUtc\)/);
  assertHas(helper, /\.gte\("booking_created_at", weekStartUtc\)/);
  assertNotHas(helper, /\.gte\("form_datetime", input\.weekStart\)/);
  assertNotHas(helper, /\.lt\("form_datetime", input\.weekEnd\)/);
  assertNotHas(helper, /\.gte\("booking_created_at", input\.weekStart\)/);
});

test("56. dashboard and snapshot share Santiago local midnight criteria", () => {
  assertHas(helper, /const RECOVERY_TIME_ZONE = "America\/Santiago"/);
  assertHas(helper, /function zonedMidnightToUtcIso/);
  assertHas(helper, /function timeZoneOffsetMs/);
  assertHas(helper, /function timeZoneParts/);
  assertHas(helper, /santiagoDateOnlyToUtcIso/);
});

test("57. Santiago week excludes UTC border carts from the previous local day", () => {
  const borderRows = [
    "2026-07-20T00:07:50+00:00",
    "2026-07-20T01:03:36+00:00",
    "2026-07-20T01:29:15+00:00",
    "2026-07-20T02:24:19+00:00",
    "2026-07-20T02:48:29+00:00",
    "2026-07-20T02:58:22+00:00",
    "2026-07-20T03:35:15+00:00",
    "2026-07-20T03:44:22+00:00",
  ];

  assert.equal(borderRows.every((value) => dateKeyForSantiagoForTest(value) === "2026-07-19"), true);
  assert.equal(borderRows.filter((value) => value >= "2026-07-20T00:00:00.000Z" && value < "2026-07-27T00:00:00.000Z").length, 8);
  assert.equal(borderRows.filter((value) => value >= "2026-07-20T04:00:00.000Z" && value < "2026-07-27T04:00:00.000Z").length, 0);
});

test("58. corrected Santiago bounds restore current dashboard parity for 2026-07-20 week", () => {
  const utcSnapshotSummary = {
    cartsTotal: 235,
    recoveredAmount: 2773814,
    recoveredConfirmed: 96,
    recoveredReview: 0,
  };
  const borderRows = [
    { amount: 35947, recovered: true },
    { amount: 0, recovered: false },
    { amount: 0, recovered: true },
    { amount: 14448, recovered: true },
    { amount: 0, recovered: false },
    { amount: 0, recovered: false },
    { amount: 0, recovered: false },
    { amount: 0, recovered: false },
  ];
  const corrected = {
    cartsTotal: utcSnapshotSummary.cartsTotal - borderRows.length,
    recoveredAmount: utcSnapshotSummary.recoveredAmount - borderRows.reduce((total, row) => total + row.amount, 0),
    recoveredConfirmed: utcSnapshotSummary.recoveredConfirmed - borderRows.filter((row) => row.recovered).length,
    recoveredReview: utcSnapshotSummary.recoveredReview,
  };
  const operationalRecovered = corrected.recoveredConfirmed + corrected.recoveredReview;

  assert.deepEqual(corrected, {
    cartsTotal: 227,
    recoveredAmount: 2723419,
    recoveredConfirmed: 93,
    recoveredReview: 0,
  });
  assert.equal(corrected.cartsTotal - operationalRecovered, 134);
  assert.equal((operationalRecovered / corrected.cartsTotal) * 100, 40.969162995594715);
});
test("59. snapshot pagination loads more than 1000 purchase rows", async () => {
  const rows = Array.from({ length: 2505 }, (_, index) => ({ id: `purchase-${String(index).padStart(4, "0")}` }));
  const result = await fetchRowsInPagesForTest(() => createPagedQueryForTest(rows));

  assert.equal(result.error, null);
  assert.equal(result.data.length, 2505);
  assert.deepEqual(result.ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("60. snapshot pagination handles exactly 1000 rows with an empty final page", async () => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({ id: `row-${index}` }));
  const result = await fetchRowsInPagesForTest(() => createPagedQueryForTest(rows));

  assert.equal(result.error, null);
  assert.equal(result.data.length, 1000);
  assert.deepEqual(result.ranges, [[0, 999], [1000, 1999]]);
});

test("61. snapshot pagination handles 1001 rows across two populated pages", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: `row-${index}` }));
  const result = await fetchRowsInPagesForTest(() => createPagedQueryForTest(rows));

  assert.equal(result.error, null);
  assert.equal(result.data.length, 1001);
  assert.deepEqual(result.ranges, [[0, 999], [1000, 1999]]);
});

test("62. snapshot pagination supports zero rows", async () => {
  const result = await fetchRowsInPagesForTest(() => createPagedQueryForTest([]));

  assert.equal(result.error, null);
  assert.deepEqual(result.data, []);
  assert.deepEqual(result.ranges, [[0, 999]]);
});

test("63. snapshot pagination fails closed on a second page error", async () => {
  const rows = Array.from({ length: 1500 }, (_, index) => ({ id: `row-${index}` }));
  const result = await fetchRowsInPagesForTest(() => createPagedQueryForTest(rows, { errorFrom: 1000 }));

  assert.deepEqual(result.data, []);
  assert.deepEqual(result.error, { message: "page failed" });
  assert.deepEqual(result.ranges, [[0, 999], [1000, 1999]]);
});

test("64. snapshot pagination preserves stable order and does not duplicate rows", async () => {
  const rows = Array.from({ length: 2001 }, (_, index) => ({ id: `row-${String(index).padStart(4, "0")}` }));
  const result = await fetchRowsInPagesForTest(() => createPagedQueryForTest(rows));
  const ids = result.data.map((row) => row.id);

  assert.equal(new Set(ids).size, 2001);
  assert.deepEqual(ids, rows.map((row) => row.id));
});

test("65. snapshot helper paginates both carts and purchases", () => {
  assertHas(helper, /fetchSnapshotRowsInPages<CartSnapshotSourceRow>\(\(\) =>/);
  assertHas(helper, /fetchSnapshotRowsInPages<PurchaseSnapshotSourceRow>\(\(\) =>/);
  assertHas(helper, /\.range\(from, from \+ pageSize - 1\)/);
});

test("66. snapshot helper does not rely on a single limit 1000 load", () => {
  assertNotHas(helper, /\.limit\(1000\)/);
  assertNotHas(helper, /\.limit\(10000\)/);
});

test("67. snapshot helper preserves filters and ordering while paginating", () => {
  assertHas(helper, /\.gte\("form_datetime", weekStartUtc\)/);
  assertHas(helper, /\.lt\("form_datetime", weekEndUtc\)/);
  assertHas(helper, /\.order\("form_datetime", \{ ascending: true \}\)/);
  assertHas(helper, /\.gte\("booking_created_at", weekStartUtc\)/);
  assertHas(helper, /\.lt\("booking_created_at", purchaseWindowEnd\)/);
  assertHas(helper, /\.order\("booking_created_at", \{ ascending: true \}\)/);
});

test("68. full pagination restores dashboard parity for 2026-07-20 week", () => {
  const firstPageSummary = {
    cartsTotal: 227,
    recoveredAmount: 1705869,
    recoveredConfirmed: 60,
    recoveredReview: 0,
    unrecovered: 167,
  };
  const fullPageSummary = {
    cartsTotal: 227,
    recoveredAmount: 2723419,
    recoveredConfirmed: 93,
    recoveredReview: 0,
    unrecovered: 134,
  };

  assert.equal(firstPageSummary.recoveredConfirmed, 60);
  assert.deepEqual(fullPageSummary, {
    cartsTotal: 227,
    recoveredAmount: 2723419,
    recoveredConfirmed: 93,
    recoveredReview: 0,
    unrecovered: 134,
  });
  assert.equal((fullPageSummary.recoveredConfirmed / fullPageSummary.cartsTotal) * 100, 40.969162995594715);
});

test("69. full pagination restores dashboard parity for 2026-07-27 week", () => {
  const firstPageSummary = {
    cartsTotal: 221,
    recoveredAmount: 1428129,
    recoveredConfirmed: 59,
    recoveredReview: 0,
    unrecovered: 162,
  };
  const fullPageSummary = {
    cartsTotal: 221,
    recoveredAmount: 2275207,
    recoveredConfirmed: 92,
    recoveredReview: 0,
    unrecovered: 129,
  };

  assert.equal(firstPageSummary.recoveredConfirmed, 59);
  assert.deepEqual(fullPageSummary, {
    cartsTotal: 221,
    recoveredAmount: 2275207,
    recoveredConfirmed: 92,
    recoveredReview: 0,
    unrecovered: 129,
  });
  assert.equal((fullPageSummary.recoveredConfirmed / fullPageSummary.cartsTotal) * 100, 41.6289592760181);
});

test("70. snapshot tests do not create real snapshots", () => {
  assertNotHas(helper, /createRecoveryWeeklySnapshot\(\{/);
  assertNotHas(helper, /snapshotKey: "recovery:week:2026-07-20:v1-intended-arrival:manual:after-imports-20260803"/);
});
