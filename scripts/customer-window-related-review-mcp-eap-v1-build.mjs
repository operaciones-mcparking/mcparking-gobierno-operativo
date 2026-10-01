import { createHash, createHmac, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { buildClientConfig } from "./customer-window-related-review-builder-connection-test.mjs";
import { auditReadySnapshotWithClient } from
  "./customer-window-related-review-mcp-eap-v1-ready-audit-core.mjs";

const RULE = "RELATED_REVIEW_MCP_EAP_V1";
const LOGIN = "customer_related_review_builder_login";
const BATCH_SIZE = 1000;
const MANIFEST_BATCH_SIZE = 5000;
export const DEFAULT_STABILITY_LAG_MINUTES = 45;
export const MIN_STABILITY_LAG_MINUTES = 30;
export const MAX_STABILITY_LAG_MINUTES = 120;
const ACTIVATE_WATCHDOG_MS = 10 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorPhases = new WeakMap();
const errorCommitted = new WeakMap();
const MANIFEST_COLUMNS = {
  A: ["source", "source_row_id", "booking_link_id", "representation_type", "customer_id", "related_group_id"],
  G: ["group_id", "key_kind", "booking_count", "profile_count", "email_count", "phone_count",
    "source_customer_count", "conflict_count", "candidate_count", "v1_booking_count", "v2_booking_count",
    "has_exact_email_phone_corroboration", "has_source_customer_email_corroboration"],
  M: ["source", "source_row_id", "group_id", "booking_link_id", "profile_id", "link_status",
    "resolver_version", "relationship_type", "reason_code"],
  R: ["group_id", "total_reservations", "first_purchase_at", "last_purchase_at"],
};

export class BuildError extends Error {
  constructor(code) {
    super(code);
    this.name = "BuildError";
    this.code = code;
  }
}

export function formatBuilderError(error) {
  const phase = error && typeof error === "object" ? errorPhases.get(error) : undefined;
  const result = {
    ok: false,
    code: error instanceof BuildError ? error.code
      : error?.code === "25P03" ? "database_idle_transaction_timeout" : "builder_failed",
    phase: phase || "initializing",
    committed: error && typeof error === "object" ? errorCommitted.get(error) === true : false,
  };
  if (error instanceof BuildError || !error || typeof error !== "object") return result;
  if (typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)) {
    result.dbCode = error.code;
    for (const [key, output] of [["constraint", "dbConstraint"], ["table", "dbTable"],
      ["column", "dbColumn"]]) {
      if (typeof error[key] === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(error[key])) {
        result[output] = error[key];
      }
    }
  } else if (typeof error.name === "string"
    && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name)) {
    result.errorType = error.name;
  }
  return result;
}

function check(value, code) {
  if (!value) throw new BuildError(code);
}

export function parseBuildArgs(args) {
  if (args.length === 1 && ["--dry-run", "--build-ready"].includes(args[0])) {
    return { mode: args[0].slice(2), snapshotId: null };
  }
  if (args.length === 3 && args[0] === "--activate" && args[1] === "--snapshot-id"
    && UUID.test(args[2])) {
    return { mode: "activate", snapshotId: args[2].toLowerCase() };
  }
  throw new BuildError("build_mode_required");
}

export function parseDryRunArgs(args) {
  return parseBuildArgs(args).mode;
}

export function parseBuilderEnv(env) {
  const connection = buildClientConfig(env);
  const stabilityLagMinutes = parseStabilityLagMinutes(env);
  const keyId = env.RELATED_REVIEW_HMAC_KEY_ID;
  check(typeof keyId === "string" && keyId.trim().length > 0 && keyId === keyId.trim(),
    "invalid_hmac_key_id");
  const encoded = env.RELATED_REVIEW_HMAC_KEY;
  check(typeof encoded === "string" && encoded.length > 0
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded),
  "invalid_hmac_key");
  const keyBytes = Buffer.from(encoded, "base64");
  if (keyBytes.length < 32 || keyBytes.toString("base64") !== encoded) {
    keyBytes.fill(0);
    throw new BuildError("invalid_hmac_key");
  }
  return { connection, keyBytes, keyId, stabilityLagMinutes };
}

export function parseStabilityLagMinutes(env = process.env) {
  const raw = env.RELATED_REVIEW_STABILITY_LAG_MINUTES;
  if (raw == null || raw === "") return DEFAULT_STABILITY_LAG_MINUTES;
  check(typeof raw === "string" && /^(?:0|[1-9][0-9]*)$/.test(raw),
    "invalid_stability_lag_minutes");
  const value = Number(raw);
  check(Number.isSafeInteger(value)
    && value >= MIN_STABILITY_LAG_MINUTES
    && value <= MAX_STABILITY_LAG_MINUTES,
  "invalid_stability_lag_minutes");
  return value;
}

export function frameSegment(value) {
  if (value === null) {
    const nullMarker = Buffer.alloc(4);
    nullMarker.writeUInt32BE(0xffffffff);
    return nullMarker;
  }
  check(typeof value === "string", "non_string_manifest_value");
  const bytes = Buffer.from(value, "utf8");
  check(bytes.length <= 0xfffffffe, "manifest_segment_too_long");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

export function groupId(ruleKey, keyKind, keyValue, keyBytes) {
  check(ruleKey === RULE && ["EXACT_EMAIL", "NO_EMAIL_SOURCE_ROW"].includes(keyKind)
    && typeof keyValue === "string" && keyValue.length > 0
    && Buffer.isBuffer(keyBytes) && keyBytes.length >= 32, "invalid_group_input");
  const hmac = createHmac("sha256", keyBytes);
  for (const value of [ruleKey, keyKind, keyValue]) hmac.update(frameSegment(value));
  return hmac.digest("hex");
}

function decimal(value) {
  check(typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value), "noncanonical_decimal");
  return value;
}

function sourceRow(value) {
  check(typeof value === "string" && /^[1-9][0-9]*$/.test(value), "invalid_source_row");
  return value;
}

function canonicalManifestValue(value) {
  if (value === null) return null;
  if (typeof value === "boolean") return value ? "1" : "0";
  check(typeof value === "string", "non_string_manifest_value");
  return value;
}

export const ACTIVITY_AT_SQL = `greatest(booking.created_at, booking.updated_at,
    booking.source_synced_at, link.created_at, link.updated_at)`;

const CUTOFF_SQL = `
  create temp table rr_cutoff on commit drop as
  select coalesce($1::timestamptz, clock.captured_at) as captured_at,
    coalesce($1::timestamptz, clock.captured_at)
      - pg_catalog.make_interval(mins => $2::integer) as stability_cutoff_at
  from (select pg_catalog.transaction_timestamp() as captured_at) clock
`;

const HOT_AUDIT_SQL = `
  select count(distinct booking.source_row_id)::text as hot_valid_source_count
  from public.customer_source_bookings_mcp_eap booking
  left join public.customer_booking_profile_links link
    on link.source = booking.source and link.source_row_id = booking.source_row_id
  cross join rr_cutoff cutoff
  where booking.source = 'MCP_EAP' and booking.booking_status in (1, 8)
    and ${ACTIVITY_AT_SQL} > cutoff.stability_cutoff_at
`;

const STAGING_SQL = `
  create temp table rr_source on commit drop as
  with linked as (
    select booking.source, booking.source_row_id, booking.email_normalized,
      booking.phone_normalized, booking.source_customer_id, booking.source_created_at,
      link.id as booking_link_id, link.profile_id, link.status as link_status,
      link.resolver_version,
      count(link.id) over (partition by booking.source, booking.source_row_id) as link_count,
      profile.status as profile_status, profile.merged_into_profile_id,
      (metrics.customer_id is not null) as has_metrics
    from public.customer_source_bookings_mcp_eap booking
    left join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    left join public.customer_profiles profile on profile.id = link.profile_id
    left join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
    cross join rr_cutoff cutoff
    where booking.source = 'MCP_EAP' and booking.booking_status in (1, 8)
      and ${ACTIVITY_AT_SQL} <= cutoff.stability_cutoff_at
  )
  select linked.*,
    case
      when link_count = 1 and link_status = 'active'
        and profile_status = 'active' and merged_into_profile_id is null
        and has_metrics then 'confirmed_customer'
      when link_count = 1 and link_status in ('conflict', 'candidate')
        and profile_status = 'active' and merged_into_profile_id is null
        then 'related_review'
      else null
    end as representation_type
  from linked
`;

const STAGING_AUDIT_SQL = `
  select count(*)::text as rows, count(distinct source_row_id)::text as distinct_rows,
    count(*) filter (where representation_type = 'confirmed_customer')::text as confirmed,
    count(*) filter (where representation_type = 'related_review')::text as related,
    count(*) filter (where booking_link_id is not null and (resolver_version is null
      or resolver_version not in ('customer_identity_v1', 'customer_identity_v2')))
      ::text as unexpected_resolver_versions,
    count(*) filter (where representation_type is null or link_count <> 1
      or booking_link_id is null or profile_id is null or profile_status <> 'active'
      or merged_into_profile_id is not null or resolver_version is null
      or resolver_version not in ('customer_identity_v1', 'customer_identity_v2')
      or source_created_at is null)::text as anomalies,
    count(*) filter (where link_status = 'active' and not has_metrics)::text as active_without_metrics
  from rr_source
`;

export const STABLE_COVERAGE_SQL = `
  with snapshot_clock as materialized (
    select snapshot.captured_at
    from public.customer_related_review_snapshots snapshot
    where snapshot.snapshot_id = $1::uuid
      and snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
  ), valid_bookings as materialized (
    select booking.source, booking.source_row_id,
      max(${ACTIVITY_AT_SQL}) as activity_at
    from public.customer_source_bookings_mcp_eap booking
    left join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    where booking.source = 'MCP_EAP' and booking.booking_status in (1, 8)
    group by booking.source, booking.source_row_id
  ), classified as materialized (
    select valid.source, valid.source_row_id,
      valid.activity_at <= snapshot_clock.captured_at
        - ($2::integer * interval '1 minute') as is_stable
    from valid_bookings valid
    cross join snapshot_clock
  ), stable as materialized (
    select source, source_row_id from classified where is_stable
  ), assignment_keys as materialized (
    select assignment.source, assignment.source_row_id
    from public.customer_analytical_booking_assignments assignment
    where assignment.snapshot_id = $1::uuid
  ), stable_assignment_presence as materialized (
    select key_row.source, key_row.source_row_id,
      pg_catalog.bool_or(key_row.is_stable) as is_stable,
      pg_catalog.bool_or(key_row.is_assigned) as is_assigned
    from (
      select stable.source, stable.source_row_id,
        true as is_stable, false as is_assigned
      from stable
      union all
      select assignment.source, assignment.source_row_id, false, true
      from assignment_keys assignment
    ) key_row
    group by key_row.source, key_row.source_row_id
  ), coverage_counts as (
    select
      count(*) filter (where presence.is_stable)::bigint as stable_valid_bookings,
      count(*) filter (where presence.is_stable and presence.is_assigned)::bigint
        as stable_assigned_bookings,
      count(*) filter (where presence.is_stable and not presence.is_assigned)::bigint
        as stable_missing_bookings
    from stable_assignment_presence presence
  )
  select
    coverage.stable_valid_bookings::text as stable_valid_bookings,
    coverage.stable_assigned_bookings::text as stable_assigned_bookings,
    coverage.stable_missing_bookings::text as stable_missing_bookings,
    (select count(*)::text from classified where not is_stable) as hot_valid_bookings
  from coverage_counts coverage
`;

const HMAC_STAGE_SQL = `
  create temp table rr_hmac (
    source_row_id bigint primary key,
    group_id text not null,
    key_kind text not null check (key_kind in ('EXACT_EMAIL', 'NO_EMAIL_SOURCE_ROW'))
  ) on commit drop
`;

const HMAC_PAGE_SQL = `
  select source_row_id::text as source_row_id, email_normalized
  from rr_source
  where representation_type = 'related_review' and source_row_id > $1::bigint
  order by source_row_id limit $2::integer
`;

const HMAC_INSERT_SQL = `
  insert into rr_hmac (source_row_id, group_id, key_kind)
  select row_id, group_id, key_kind
  from unnest($1::bigint[], $2::text[], $3::text[]) as batch(row_id, group_id, key_kind)
`;

const GROUP_EVIDENCE_SQL = `
  create temp table rr_group_evidence on commit drop as
  select group_id,
    bool_or(kind = 'phone' and booking_count >= 2) as same_email_phone,
    bool_or(kind = 'source_customer' and booking_count >= 2) as same_source_customer_email
  from (
    select h.group_id, 'phone'::text as kind, count(*) as booking_count
    from rr_source source_row join rr_hmac h using (source_row_id)
    where nullif(source_row.phone_normalized, '') is not null
      and h.key_kind = 'EXACT_EMAIL'
    group by h.group_id, source_row.phone_normalized
    union all
    select h.group_id, 'source_customer'::text as kind, count(*) as booking_count
    from rr_source source_row join rr_hmac h using (source_row_id)
    where source_row.source_customer_id is not null
      and h.key_kind = 'EXACT_EMAIL'
    group by h.group_id, source_row.source_customer_id
  ) evidence
  group by group_id
`;

const GROUP_INSERT_SQL = `
  insert into public.customer_related_review_groups (
    snapshot_id, group_id, key_kind, booking_count, profile_count, email_count,
    phone_count, source_customer_count, conflict_count, candidate_count,
    v1_booking_count, v2_booking_count, has_exact_email_phone_corroboration,
    has_source_customer_email_corroboration
  )
  select $1::uuid, h.group_id, min(h.key_kind), count(*)::integer,
    count(distinct source_row.profile_id)::integer,
    count(distinct nullif(source_row.email_normalized, ''))::integer,
    count(distinct nullif(source_row.phone_normalized, ''))::integer,
    count(distinct source_row.source_customer_id)::integer,
    count(*) filter (where source_row.link_status = 'conflict')::integer,
    count(*) filter (where source_row.link_status = 'candidate')::integer,
    count(*) filter (where source_row.resolver_version = 'customer_identity_v1')::integer,
    count(*) filter (where source_row.resolver_version = 'customer_identity_v2')::integer,
    coalesce(bool_or(evidence.same_email_phone), false),
    coalesce(bool_or(evidence.same_source_customer_email), false)
  from rr_source source_row
  join rr_hmac h using (source_row_id)
  left join rr_group_evidence evidence on evidence.group_id = h.group_id
  group by h.group_id
`;

const GROUP_KEY_AUDIT_SQL = `
  select count(*)::text as mixed_group_keys
  from (
    select h.group_id
    from rr_hmac h join rr_source source_row using (source_row_id)
    group by h.group_id
    having count(distinct h.key_kind) <> 1
      or count(distinct nullif(source_row.email_normalized, '')) > 1
      or (min(h.key_kind) = 'NO_EMAIL_SOURCE_ROW' and count(*) <> 1)
  ) invalid_group
`;

const MEMBERS_INSERT_SQL = `
  insert into public.customer_related_review_members (
    snapshot_id, source, source_row_id, group_id, booking_link_id, profile_id,
    link_status, resolver_version, relationship_type, reason_code
  )
  select $1::uuid, source_row.source, source_row.source_row_id, h.group_id,
    source_row.booking_link_id, source_row.profile_id, source_row.link_status,
    source_row.resolver_version, h.key_kind, null
  from rr_source source_row join rr_hmac h using (source_row_id)
`;

const ASSIGNMENTS_INSERT_SQL = `
  insert into public.customer_analytical_booking_assignments (
    snapshot_id, source, source_row_id, booking_link_id, representation_type,
    customer_id, related_group_id
  )
  select $1::uuid, source_row.source, source_row.source_row_id,
    source_row.booking_link_id, source_row.representation_type,
    case when source_row.representation_type = 'confirmed_customer'
      then source_row.profile_id else null end,
    case when source_row.representation_type = 'related_review'
      then h.group_id else null end
  from rr_source source_row
  left join rr_hmac h using (source_row_id)
`;

const METRICS_INSERT_SQL = `
  insert into public.customer_related_review_metrics (
    snapshot_id, group_id, total_reservations, first_purchase_at, last_purchase_at
  )
  select $1::uuid, h.group_id, count(*)::bigint,
    min(source_row.source_created_at), max(source_row.source_created_at)
  from rr_source source_row join rr_hmac h using (source_row_id)
  group by h.group_id
`;

const GROUP_ANALYTICS_INSERT_SQL = `
  with params as materialized (
    select snapshot.captured_at,
      pg_catalog.timezone('America/Santiago', snapshot.captured_at)::date as today
    from public.customer_related_review_snapshots snapshot
    where snapshot.snapshot_id = $1::uuid and snapshot.status = 'building'
  ), base as materialized (
    select h.group_id, booking.source_created_at, booking.planned_arrival_at,
      booking.duration_days, booking.booking_paid, booking.promotion_discount_amount,
      booking.is_pack, booking.brand_normalized, booking.parking_normalized,
      parking_rule.parking_family,
      case when booking.source_created_at is null or booking.planned_arrival_at is null then null
        else booking.planned_arrival_at::date - booking.source_created_at::date end as lead_days,
      (
        booking.booking_paid is not null
        and booking.promotion_discount_amount is not null
        and booking.promotion_discount_amount >= 0
        and booking.duration_days is not null
        and booking.duration_days > 0
        and booking.paying_status = 1
        and booking.is_pack is false
      ) as economic_eligible
    from rr_source source_row
    join rr_hmac h using (source_row_id)
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = source_row.source and booking.source_row_id = source_row.source_row_id
    left join public.customer_window_parking_family_rules parking_rule
      on parking_rule.source = 'MCP_EAP' and parking_rule.parking = booking.parking_normalized
  ), group_list as materialized (
    select distinct group_id from base
  ), boletas as materialized (
    select * from base where is_pack is false
  ), base_stats as (
    select group_row.group_id,
      count(base.group_id)::bigint as total_count,
      count(base.group_id) filter (where base.is_pack is false)::bigint as boleta_count,
      count(base.group_id) filter (where base.is_pack is true)::bigint as pack_count,
      min(base.source_created_at) as first_activity_at,
      max(base.source_created_at) as last_activity_at,
      count(base.group_id) filter (
        where base.source_created_at >= params.today - interval '12 months')::bigint as bookings_12m,
      count(base.group_id) filter (
        where base.source_created_at >= params.today - interval '24 months')::bigint as bookings_24m,
      count(base.group_id) filter (
        where base.is_pack is false and base.booking_paid is null)::bigint as missing_amount,
      count(base.group_id) filter (
        where base.is_pack is false and (base.duration_days is null or base.duration_days <= 0))::bigint
        as missing_duration,
      count(base.group_id) filter (
        where base.is_pack is false and base.lead_days is null)::bigint as missing_lead,
      count(base.group_id) filter (
        where base.is_pack is false and base.lead_days < 0)::bigint as invalid_lead,
      count(base.group_id) filter (where base.parking_family is null)::bigint as missing_parking_family
    from group_list group_row
    cross join params
    left join base using (group_id)
    group by group_row.group_id
  ), stay_stats as (
    select group_id, count(*)::bigint as sample_size, sum(duration_days)::bigint as total_value,
      avg(duration_days)::numeric as average_value,
      pg_catalog.percentile_cont(0.5) within group (order by duration_days)::numeric as median_value
    from boletas where duration_days > 0 group by group_id
  ), lead_stats as (
    select group_id, count(*)::bigint as sample_size, avg(lead_days)::numeric as average_value,
      pg_catalog.percentile_cont(0.5) within group (order by lead_days)::numeric as median_value
    from boletas where lead_days >= 0 group by group_id
  ), arrival_stats as (
    select group_id,
      count(*) filter (where extract(isodow from planned_arrival_at) between 1 and 5)::bigint
        as weekday_count,
      count(*) filter (where extract(isodow from planned_arrival_at) in (6, 7))::bigint
        as weekend_count,
      count(*)::bigint as sample_size
    from boletas where planned_arrival_at is not null group by group_id
  ), month_counts as (
    select group_row.group_id, month.value::smallint as month_number,
      count(boleta.group_id) filter (
        where extract(month from boleta.planned_arrival_at) = month.value)::bigint as booking_count
    from group_list group_row
    cross join pg_catalog.generate_series(1, 12) month(value)
    left join boletas boleta
      on boleta.group_id = group_row.group_id and boleta.planned_arrival_at is not null
    group by group_row.group_id, month.value
  ), month_summary as (
    select group_id,
      pg_catalog.jsonb_agg(booking_count order by month_number) as counts,
      count(*) filter (where booking_count > 0)::smallint as active_months
    from month_counts group by group_id
  ), dimension_counts as (
    select group_id, 'brand'::text as dimension, brand_normalized as value, count(*)::bigint as booking_count
    from base group by group_id, brand_normalized
    union all
    select group_id, 'parking', parking_normalized, count(*)::bigint
    from base group by group_id, parking_normalized
    union all
    select group_id, 'parking_family', coalesce(parking_family, 'UNMAPPED'), count(*)::bigint
    from base group by group_id, coalesce(parking_family, 'UNMAPPED')
  ), dimensions as (
    select group_id,
      coalesce(pg_catalog.jsonb_object_agg(value, booking_count order by value)
        filter (where dimension = 'brand'), '{}'::jsonb) as brand_counts,
      coalesce(pg_catalog.jsonb_object_agg(value, booking_count order by value)
        filter (where dimension = 'parking'), '{}'::jsonb) as parking_counts,
      coalesce(pg_catalog.jsonb_object_agg(value, booking_count order by value)
        filter (where dimension = 'parking_family'), '{}'::jsonb) as parking_family_counts
    from dimension_counts group by group_id
  ), economics as (
    select group_id, count(*)::bigint as sample_size,
      sum(booking_paid)::numeric(18,2) as paid_amount,
      sum(booking_paid + promotion_discount_amount)::numeric(18,2) as list_amount,
      sum(promotion_discount_amount)::numeric(18,2) as discount_amount,
      avg(booking_paid)::numeric as average_ticket,
      pg_catalog.percentile_cont(0.5) within group (order by booking_paid)::numeric as median_ticket,
      sum(booking_paid) / nullif(sum(duration_days), 0) as paid_adr,
      sum(booking_paid + promotion_discount_amount) / nullif(sum(duration_days), 0) as list_adr,
      count(*) filter (where promotion_discount_amount > 0)::bigint as discounted_count
    from boletas where economic_eligible is true group by group_id
  )
  insert into public.customer_related_review_group_analytics (
    snapshot_id, group_id, total_valid_bookings, boleta_booking_count, pack_booking_count,
    first_activity_at, last_activity_at, bookings_12m, bookings_24m,
    total_economic_days, average_economic_days, median_economic_days,
    economic_days_sample_size, average_booking_lead_days, median_booking_lead_days,
    booking_lead_sample_size, weekday_arrival_count, weekend_arrival_count,
    arrival_sample_size, arrival_month_counts, active_arrival_month_count,
    brand_counts, parking_counts, parking_family_counts, boleta_economic_sample_size,
    boleta_paid_amount, boleta_list_amount, boleta_discount_amount, average_boleta_ticket,
    median_boleta_ticket, paid_adr, list_adr, discounted_boleta_count, discount_usage_pct,
    weighted_discount_pct, missing_paid_amount_count, missing_duration_count,
    missing_lead_time_count, invalid_lead_time_count, missing_parking_family_count,
    as_of_date, calculation_version, computed_at
  )
  select $1::uuid, base.group_id, base.total_count, base.boleta_count, base.pack_count,
    base.first_activity_at, base.last_activity_at, base.bookings_12m, base.bookings_24m,
    stay.total_value, stay.average_value, stay.median_value, coalesce(stay.sample_size, 0),
    lead.average_value, lead.median_value, coalesce(lead.sample_size, 0),
    coalesce(arrival.weekday_count, 0), coalesce(arrival.weekend_count, 0),
    coalesce(arrival.sample_size, 0), months.counts, months.active_months,
    dimensions.brand_counts, dimensions.parking_counts, dimensions.parking_family_counts,
    coalesce(economics.sample_size, 0), economics.paid_amount, economics.list_amount,
    economics.discount_amount, economics.average_ticket, economics.median_ticket,
    economics.paid_adr, economics.list_adr, coalesce(economics.discounted_count, 0),
    economics.discounted_count::numeric / nullif(economics.sample_size, 0),
    economics.discount_amount / nullif(economics.list_amount, 0),
    base.missing_amount, base.missing_duration, base.missing_lead, base.invalid_lead,
    base.missing_parking_family, params.today,
    'CUSTOMER_360_RELATED_GROUP_ANALYTICS_V1', params.captured_at
  from base_stats base
  cross join params
  left join stay_stats stay using (group_id)
  left join lead_stats lead using (group_id)
  left join arrival_stats arrival using (group_id)
  join month_summary months using (group_id)
  join dimensions using (group_id)
  left join economics using (group_id)
  order by base.group_id
`;

const CONTACT_CANDIDATES_INSERT_SQL = `
  with contact_values as materialized (
    select h.group_id, 'email'::text as type, source_row.email_normalized as normalized_value,
      source_row.source_created_at, source_row.profile_id, source_row.link_status
    from rr_source source_row join rr_hmac h using (source_row_id)
    where nullif(source_row.email_normalized, '') is not null
    union all
    select h.group_id, 'phone', source_row.phone_normalized,
      source_row.source_created_at, source_row.profile_id, source_row.link_status
    from rr_source source_row join rr_hmac h using (source_row_id)
    where nullif(source_row.phone_normalized, '') is not null
  ), summarized as (
    select value.group_id, value.type, value.normalized_value,
      min(value.source_created_at) as first_seen_at,
      max(value.source_created_at) as last_seen_at,
      count(*)::bigint as booking_count,
      count(distinct value.profile_id)::bigint as profile_count,
      bool_or(value.link_status = 'conflict') as conflict_involvement,
      max(group_row.profile_count) as group_profile_count,
      max(group_row.phone_count) as group_phone_count
    from contact_values value
    join public.customer_related_review_groups group_row
      on group_row.snapshot_id = $1::uuid and group_row.group_id = value.group_id
    group by value.group_id, value.type, value.normalized_value
  )
  insert into public.customer_related_review_contact_candidates (
    snapshot_id, group_id, type, normalized_value, display_value, relation, sources,
    source_count, first_seen_at, last_seen_at, booking_count, profile_count,
    current_group_membership, conflict_involvement, contradictory_signals,
    same_phone_history, same_email_history, quality_flags, eligibility_status,
    eligibility_reason_codes, policy_version
  )
  select $1::uuid, summary.group_id, summary.type, summary.normalized_value,
    summary.normalized_value, 'observed_in_group', array['MCP_EAP']::text[], 1,
    summary.first_seen_at, summary.last_seen_at, summary.booking_count, summary.profile_count,
    true, summary.conflict_involvement, null, null, null,
    array['NORMALIZED_SOURCE_VALUE']::text[],
    case when summary.conflict_involvement or summary.group_profile_count > 1
      or summary.group_phone_count > 1 then 'BLOCKED' else 'REVIEW' end,
    pg_catalog.array_remove(array[
      'AUTOMATION_NOT_AUTHORIZED_V1',
      case when summary.conflict_involvement then 'CURRENT_CONFLICT_LINK' end,
      case when summary.group_profile_count > 1 then 'MULTIPLE_PROFILES_IN_GROUP' end,
      case when summary.group_phone_count > 1 then 'MULTIPLE_PHONES_IN_GROUP' end
    ]::text[], null),
    'RELATED_CONTACTABILITY_V1'
  from summarized summary
  order by summary.group_id, summary.type, summary.normalized_value
`;

const ANALYTICS_AUDIT_SQL = `
  with expected_contacts as (
    select count(*)::text as contact_count
    from (
      select h.group_id, 'email'::text as type, source_row.email_normalized as normalized_value
      from rr_source source_row join rr_hmac h using (source_row_id)
      where nullif(source_row.email_normalized, '') is not null
      group by h.group_id, source_row.email_normalized
      union all
      select h.group_id, 'phone', source_row.phone_normalized
      from rr_source source_row join rr_hmac h using (source_row_id)
      where nullif(source_row.phone_normalized, '') is not null
      group by h.group_id, source_row.phone_normalized
    ) contact
  )
  select
    (select count(*)::text from public.customer_related_review_group_analytics
      where snapshot_id = $1::uuid) as analytics_count,
    (select count(*)::text from public.customer_related_review_contact_candidates
      where snapshot_id = $1::uuid) as contact_candidate_count,
    (select contact_count from expected_contacts) as expected_contact_candidate_count,
    (select count(*)::text
      from public.customer_related_review_groups group_row
      full join public.customer_related_review_group_analytics analytics
        on analytics.snapshot_id = group_row.snapshot_id and analytics.group_id = group_row.group_id
      where coalesce(group_row.snapshot_id, analytics.snapshot_id) = $1::uuid
        and (group_row.group_id is null or analytics.group_id is null
          or analytics.total_valid_bookings <> group_row.booking_count
          or analytics.boleta_booking_count + analytics.pack_booking_count
            <> analytics.total_valid_bookings)) as bad_analytics,
    (select count(*)::text
      from public.customer_related_review_contact_candidates candidate
      where candidate.snapshot_id = $1::uuid
        and (candidate.eligibility_status not in ('REVIEW', 'BLOCKED')
          or candidate.current_group_membership is not true
          or candidate.relation <> 'observed_in_group')) as bad_contact_candidates
`;

const EXPECTED_GROUPS_SQL = `
  create temp table rr_expected_groups on commit drop as
  select h.group_id, count(*)::integer as booking_count,
    count(distinct source_row.profile_id)::integer as profile_count,
    count(distinct nullif(source_row.email_normalized, ''))::integer as email_count,
    count(distinct nullif(source_row.phone_normalized, ''))::integer as phone_count,
    count(distinct source_row.source_customer_id)::integer as source_customer_count,
    count(*) filter (where source_row.link_status = 'conflict')::integer as conflict_count,
    count(*) filter (where source_row.link_status = 'candidate')::integer as candidate_count,
    count(*) filter (where source_row.resolver_version = 'customer_identity_v1')::integer as v1_count,
    count(*) filter (where source_row.resolver_version = 'customer_identity_v2')::integer as v2_count,
    min(source_row.source_created_at) as first_purchase_at,
    max(source_row.source_created_at) as last_purchase_at
  from rr_source source_row join rr_hmac h using (source_row_id)
  group by h.group_id
`;

const EXPECTED_ASSIGNMENTS_SQL = `
  create temp table rr_expected_assignments on commit drop as
  select source_row.source, source_row.source_row_id, source_row.booking_link_id,
    source_row.representation_type,
    case when source_row.representation_type = 'confirmed_customer'
      then source_row.profile_id else null end as customer_id,
    case when source_row.representation_type = 'related_review'
      then h.group_id else null end as related_group_id
  from rr_source source_row
  left join rr_hmac h using (source_row_id)
`;

const EXPECTED_MEMBERS_SQL = `
  create temp table rr_expected_members on commit drop as
  select source_row.source, source_row.source_row_id, h.group_id,
    source_row.booking_link_id, source_row.profile_id, source_row.link_status,
    source_row.resolver_version, h.key_kind as relationship_type, null::text as reason_code
  from rr_source source_row join rr_hmac h using (source_row_id)
`;

const ACTUAL_ASSIGNMENTS_SQL = `
  create temp table rr_actual_assignments on commit drop as
  select source, source_row_id, booking_link_id, representation_type,
    customer_id, related_group_id
  from public.customer_analytical_booking_assignments where snapshot_id = $1
`;

const ACTUAL_MEMBERS_SQL = `
  create temp table rr_actual_members on commit drop as
  select source, source_row_id, group_id, booking_link_id, profile_id,
    link_status, resolver_version, relationship_type, reason_code
  from public.customer_related_review_members where snapshot_id = $1
`;

const ACTUAL_GROUPS_SQL = `
  create temp table rr_actual_groups on commit drop as
  select group_id, key_kind, booking_count, profile_count, email_count, phone_count,
    source_customer_count, conflict_count, candidate_count, v1_booking_count, v2_booking_count
  from public.customer_related_review_groups where snapshot_id = $1
`;

const ACTUAL_METRICS_SQL = `
  create temp table rr_actual_metrics on commit drop as
  select group_id, total_reservations, first_purchase_at, last_purchase_at
  from public.customer_related_review_metrics where snapshot_id = $1
`;

const AUDIT_COUNTS_SQL = `
  with source_counts as materialized (
    select count(*)::text as valid_source_count,
      count(*) filter (where representation_type = 'confirmed_customer')::text as confirmed_count,
      count(*) filter (where representation_type = 'related_review')::text as related_count,
      count(*) filter (where representation_type is null or link_count <> 1)::text as anomaly_count,
      count(*) filter (where link_status = 'active' and not has_metrics)::text as missing_metrics_count
    from rr_source
  )
  select source_counts.*,
    (select count(*)::text from rr_hmac) as hmac_count
  from source_counts
`;

const AUDIT_ASSIGNMENTS_SQL = `
  with actual as materialized (
    select * from rr_actual_assignments
  ), comparison as materialized (
    select expected.source_row_id as expected_row_id, actual.source_row_id as actual_row_id,
      expected.booking_link_id as expected_booking_link_id,
      actual.booking_link_id as actual_booking_link_id,
      expected.representation_type as expected_representation_type,
      actual.representation_type as actual_representation_type,
      expected.customer_id as expected_customer_id, actual.customer_id as actual_customer_id,
      expected.related_group_id as expected_related_group_id,
      actual.related_group_id as actual_related_group_id
    from rr_expected_assignments expected
    full join actual using (source, source_row_id)
  )
  select (select count(*)::text from actual) as assignment_count,
    (select count(*)::text from comparison
      where expected_row_id is null or actual_row_id is null
        or actual_booking_link_id is distinct from expected_booking_link_id
        or actual_representation_type is distinct from expected_representation_type
        or actual_customer_id is distinct from expected_customer_id
        or actual_related_group_id is distinct from expected_related_group_id) as bad_assignments
`;

const AUDIT_MEMBERS_SQL = `
  with actual as materialized (
    select * from rr_actual_members
  ), comparison as materialized (
    select expected.source_row_id as expected_row_id, actual.source_row_id as actual_row_id,
      expected.group_id as expected_group_id, actual.group_id as actual_group_id,
      expected.booking_link_id as expected_booking_link_id,
      actual.booking_link_id as actual_booking_link_id,
      expected.profile_id as expected_profile_id, actual.profile_id as actual_profile_id,
      expected.link_status as expected_link_status, actual.link_status as actual_link_status,
      expected.resolver_version as expected_resolver_version,
      actual.resolver_version as actual_resolver_version,
      expected.relationship_type as expected_relationship_type,
      actual.relationship_type as actual_relationship_type,
      expected.reason_code as expected_reason_code, actual.reason_code as actual_reason_code
    from rr_expected_members expected
    full join actual using (source, source_row_id)
  )
  select (select count(*)::text from actual) as member_count,
    (select count(*)::text from comparison
      where expected_row_id is null or actual_row_id is null
        or actual_group_id is distinct from expected_group_id
        or actual_booking_link_id is distinct from expected_booking_link_id
        or actual_profile_id is distinct from expected_profile_id
        or actual_link_status is distinct from expected_link_status
        or actual_resolver_version is distinct from expected_resolver_version
        or actual_relationship_type is distinct from expected_relationship_type
        or actual_reason_code is distinct from expected_reason_code) as bad_members
`;

const AUDIT_GROUPS_SQL = `
  with actual as materialized (
    select * from rr_actual_groups
  ), member_counts as materialized (
    select group_id, count(*)::integer as member_count
    from rr_actual_members group by group_id
  ), aggregate_comparison as materialized (
    select expected.group_id as expected_group_id, actual.group_id as actual_group_id,
      expected.*, actual.booking_count as actual_booking_count,
      actual.profile_count as actual_profile_count, actual.email_count as actual_email_count,
      actual.phone_count as actual_phone_count,
      actual.source_customer_count as actual_source_customer_count,
      actual.conflict_count as actual_conflict_count, actual.candidate_count as actual_candidate_count,
      actual.v1_booking_count as actual_v1_count, actual.v2_booking_count as actual_v2_count
    from rr_expected_groups expected full join actual using (group_id)
  )
  select (select count(*)::text from actual) as group_count,
    (select count(*)::text from actual grp
      left join member_counts member on member.group_id = grp.group_id
      where coalesce(member.member_count, 0) <> grp.booking_count
        or coalesce(member.member_count, 0) = 0
        or grp.v1_booking_count + grp.v2_booking_count <> grp.booking_count
        or (grp.key_kind = 'EXACT_EMAIL' and grp.email_count <> 1)
        or (grp.key_kind = 'NO_EMAIL_SOURCE_ROW'
          and (grp.booking_count <> 1 or grp.email_count <> 0))) as bad_groups,
    (select count(*)::text from aggregate_comparison comparison
      where expected_group_id is null or actual_group_id is null
        or actual_booking_count <> booking_count
        or actual_profile_count <> profile_count
        or actual_email_count <> email_count
        or actual_phone_count <> phone_count
        or actual_source_customer_count <> source_customer_count
        or actual_conflict_count <> conflict_count
        or actual_candidate_count <> candidate_count
        or actual_v1_count <> v1_count or actual_v2_count <> v2_count
        or v1_count + v2_count <> booking_count) as bad_group_aggregates
`;

const AUDIT_METRICS_SQL = `
  with actual as materialized (
    select * from rr_actual_metrics
  ), comparison as materialized (
    select expected.group_id as expected_group_id, actual.group_id as actual_group_id,
      expected.booking_count, expected.first_purchase_at, expected.last_purchase_at,
      actual.total_reservations, actual.first_purchase_at as actual_first_purchase_at,
      actual.last_purchase_at as actual_last_purchase_at
    from rr_expected_groups expected full join actual using (group_id)
  )
  select (select count(*)::text from actual) as metrics_count,
    (select count(*)::text from comparison
      where expected_group_id is null or actual_group_id is null
        or total_reservations <> booking_count) as bad_metrics,
    (select count(*)::text from comparison
      where expected_group_id is null or actual_group_id is null
        or total_reservations <> booking_count
        or actual_first_purchase_at <> first_purchase_at
        or actual_last_purchase_at <> last_purchase_at) as bad_metric_dates
`;

const AUDIT_OVERLAP_SQL = `
  select count(*)::text as confirmed_related_overlap
  from rr_actual_assignments assignment
  join rr_actual_members member using (source, source_row_id)
  where assignment.representation_type = 'confirmed_customer'
`;

const MANIFEST_SECTIONS = [
  { type: "A", table: "customer_analytical_booking_assignments", order: "source, source_row_id" },
  { type: "G", table: "customer_related_review_groups", order: "group_id" },
  { type: "M", table: "customer_related_review_members", order: "source, source_row_id" },
  { type: "R", table: "customer_related_review_metrics", order: "group_id" },
];

export function manifestPageSql(section) {
  const columns = MANIFEST_COLUMNS[section.type].map((column) => {
    if (column === "first_purchase_at" || column === "last_purchase_at") {
      return `to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.US') as ${column}`;
    }
    return `${column}::text as ${column}`;
  });
  const cursor = section.type === "A" || section.type === "M"
    ? "source_row_id > $2::bigint" : "group_id > $2::text";
  return `select ${columns.join(", ")} from public.${section.table}
    where snapshot_id = $1::uuid and ${cursor}
    order by ${section.order} limit $3::integer`;
}

function validateManifestRow(type, row) {
  for (const field of MANIFEST_COLUMNS[type]) {
    const value = row[field];
    if (value === null) {
      check(["customer_id", "related_group_id", "reason_code"].includes(field),
        "unexpected_null_manifest_value");
      continue;
    }
    check(typeof value === "string", "manifest_value_not_text");
    if (["source_row_id", "booking_count", "profile_count", "email_count", "phone_count",
      "source_customer_count", "conflict_count", "candidate_count", "v1_booking_count",
      "v2_booking_count", "total_reservations"].includes(field)) decimal(value);
    if (field === "source_row_id") sourceRow(value);
    if (field === "first_purchase_at" || field === "last_purchase_at") {
      check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(value),
        "invalid_manifest_timestamp");
    }
    if (field.startsWith("has_")) check(value === "true" || value === "false",
      "invalid_manifest_boolean");
  }
}

export async function hashManifest(client, snapshotId, keyId, stats = {}) {
  const hash = createHash("sha256");
  const verifier = createHash("sha256");
  stats.queryCount = 0;
  stats.rowsHashed = 0;
  const write = (value) => {
    const frame = frameSegment(value);
    const verificationFrame = frameSegment(value);
    check(frame.equals(verificationFrame), "manifest_frame_nondeterministic");
    hash.update(frame);
    verifier.update(verificationFrame);
  };
  for (const field of ["RR-MCP-EAP-MANIFEST-V1", RULE, keyId, "1"]) write(field);
  for (const section of MANIFEST_SECTIONS) {
    stats.queryCount++;
    const total = (await client.query(
      `select count(*)::text as count from public.${section.table} where snapshot_id = $1::uuid`,
      [snapshotId],
    )).rows[0]?.count;
    decimal(total);
    write(section.type);
    write(total);
    let cursor = section.type === "A" || section.type === "M" ? "0" : "";
    let seen = 0n;
    const sql = manifestPageSql(section);
    while (true) {
      stats.queryCount++;
      const rows = (await client.query(sql, [snapshotId, cursor, MANIFEST_BATCH_SIZE])).rows;
      check(rows.length <= MANIFEST_BATCH_SIZE, "manifest_page_too_large");
      if (rows.length === 0) break;
      for (const row of rows) {
        validateManifestRow(section.type, row);
        const nextCursor = section.type === "A" || section.type === "M"
          ? sourceRow(row.source_row_id) : row.group_id;
        check(section.type === "A" || section.type === "M"
          ? BigInt(nextCursor) > BigInt(cursor) : nextCursor > cursor,
        "manifest_order_not_ascending");
        cursor = nextCursor;
        write(section.type);
        for (const field of MANIFEST_COLUMNS[section.type]) {
          const value = row[field];
          write(field.startsWith("has_")
            ? value === "true" ? "1" : "0" : canonicalManifestValue(value));
        }
        seen++;
        stats.rowsHashed++;
      }
    }
    check(seen === BigInt(total), "manifest_section_count_mismatch");
  }
  const digest = hash.digest("hex");
  check(digest === verifier.digest("hex"), "manifest_recompute_mismatch");
  return digest;
}

async function stageHmac(client, keyBytes, expectedRelated) {
  await client.query(HMAC_STAGE_SQL);
  let cursor = "0";
  let count = 0n;
  let batches = 0;
  let maxBatchSize = 0;
  while (true) {
    const rows = (await client.query(HMAC_PAGE_SQL, [cursor, BATCH_SIZE])).rows;
    if (rows.length === 0) break;
    const ids = [], groups = [], kinds = [];
    for (const row of rows) {
      const id = sourceRow(row.source_row_id);
      check(BigInt(id) > BigInt(cursor), "hmac_cursor_not_ascending");
      const kind = row.email_normalized ? "EXACT_EMAIL" : "NO_EMAIL_SOURCE_ROW";
      ids.push(id);
      groups.push(groupId(RULE, kind,
        kind === "EXACT_EMAIL" ? row.email_normalized : `MCP_EAP:${id}`, keyBytes));
      kinds.push(kind);
      cursor = id;
    }
    await client.query(HMAC_INSERT_SQL, [ids, groups, kinds]);
    count += BigInt(rows.length);
    batches++;
    maxBatchSize = Math.max(maxBatchSize, rows.length);
  }
  check(count === BigInt(expectedRelated), "hmac_count_mismatch");
  return { count, batches, maxBatchSize };
}

async function verifyHmac(client, keyBytes, expectedRelated) {
  let cursor = "0";
  let count = 0n;
  const sql = `select source_row.source_row_id::text as source_row_id,
    source_row.email_normalized, h.group_id, h.key_kind
    from rr_source source_row join rr_hmac h using (source_row_id)
    where source_row.representation_type = 'related_review'
      and source_row.source_row_id > $1::bigint
    order by source_row.source_row_id limit $2::integer`;
  while (true) {
    const rows = (await client.query(sql, [cursor, BATCH_SIZE])).rows;
    if (rows.length === 0) break;
    for (const row of rows) {
      const id = sourceRow(row.source_row_id);
      check(BigInt(id) > BigInt(cursor), "hmac_cursor_not_ascending");
      const kind = row.email_normalized ? "EXACT_EMAIL" : "NO_EMAIL_SOURCE_ROW";
      check(row.key_kind === kind && row.group_id === groupId(RULE, kind,
        kind === "EXACT_EMAIL" ? row.email_normalized : `MCP_EAP:${id}`, keyBytes),
      "hmac_recomposition_failed");
      cursor = id;
      count++;
    }
  }
  check(count === BigInt(expectedRelated), "hmac_verification_count_mismatch");
}

function assertAudit(audit, stage) {
  const valid = BigInt(decimal(audit.valid_source_count));
  const confirmed = BigInt(decimal(audit.confirmed_count));
  const related = BigInt(decimal(audit.related_count));
  check(valid === confirmed + related && valid === BigInt(stage.rows), "coverage_mismatch");
  check(BigInt(audit.hmac_count) === related && BigInt(audit.member_count) === related,
    "member_coverage_mismatch");
  check(BigInt(audit.assignment_count) === valid, "assignment_coverage_mismatch");
  check(BigInt(audit.group_count) === BigInt(audit.metrics_count), "group_metrics_mismatch");
  check(BigInt(audit.group_count) === BigInt(audit.analytics_count),
    "group_analytics_mismatch");
  check(BigInt(audit.contact_candidate_count) === BigInt(audit.expected_contact_candidate_count),
    "contact_candidate_coverage_mismatch");
  for (const name of ["anomaly_count", "missing_metrics_count", "bad_assignments",
    "bad_members", "bad_groups", "bad_group_aggregates", "bad_metrics", "bad_metric_dates",
    "bad_analytics", "bad_contact_candidates", "confirmed_related_overlap"]) {
    check(BigInt(decimal(audit[name])) === 0n, `${name}_nonzero`);
  }
}

export async function runBuild({ mode, env = process.env, ClientClass = pg.Client,
  now = () => Date.now(), parseEnv = parseBuilderEnv, capturedAt = null } = {}) {
  let phase = "initializing";
  let keyBytes;
  let client;
  let transactionOpen = false;
  let committed = false;
  let completed = false;
  const started = now();
  const timings = {};
  try {
    check(["dry-run", "build-ready"].includes(mode), "invalid_build_mode");
    check(capturedAt === null || (typeof capturedAt === "string"
      && !Number.isNaN(Date.parse(capturedAt))), "invalid_captured_at");
    phase = "env";
    const parsed = parseEnv(env);
    const { connection, keyId } = parsed;
    const stabilityLagMinutes = parsed.stabilityLagMinutes ?? parseStabilityLagMinutes(env);
    keyBytes = parsed.keyBytes;
    connection.query_timeout = 11 * 60 * 1000;
    phase = "connect";
    client = new ClientClass(connection);
    await client.connect();
    phase = "begin";
    await client.query("BEGIN");
    transactionOpen = true;
    phase = "preflight";
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL statement_timeout = '10min'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '10min'");
    await client.query("select pg_catalog.pg_advisory_xact_lock(181923741, 1)");
    const preflight = (await client.query(`
      select current_user as current_user, session_user as session_user,
        pg_catalog.pg_has_role(current_user, 'customer_related_review_builder', 'USAGE')
          as inherited_capability,
        pg_catalog.row_security_active('public.customer_source_bookings_mcp_eap') as source_rls,
        pg_catalog.row_security_active('public.customer_booking_profile_links') as links_rls,
        pg_catalog.row_security_active('public.customer_profiles') as profiles_rls,
        pg_catalog.row_security_active('public.customer_related_review_snapshots') as snapshots_rls,
        pg_catalog.pg_backend_pid() as backend_pid,
        (select count(*)::integer from public.customer_window_classification_rules
          where rule_key = 'CUSTOMER_CLASSIFICATION_V1') as classification_count,
        (select count(*)::integer from public.customer_related_review_snapshots
          where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active') as active_count,
        (select count(*)::integer from public.customer_related_review_snapshots
          where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'ready') as ready_count
    `)).rows[0];
    check(preflight?.current_user === LOGIN && preflight?.session_user === LOGIN
      && preflight?.inherited_capability === true, "builder_identity_mismatch");
    check(preflight.source_rls && preflight.links_rls && preflight.profiles_rls
      && preflight.snapshots_rls, "builder_rls_inactive");
    check(preflight.classification_count === 1, "classification_rule_missing");
    check(preflight.active_count <= 1, "multiple_active_snapshots");
    if (mode === "build-ready") {
      check(preflight.ready_count === 0, "ready_snapshot_already_exists");
    }
    check(Number.isInteger(preflight.backend_pid), "invalid_backend_pid");
    timings.preflightMs = now() - started;

    const stagingStart = now();
    phase = "cutoff_capture";
    await client.query(CUTOFF_SQL, [capturedAt, stabilityLagMinutes]);
    phase = "staging_create";
    await client.query(STAGING_SQL);
    phase = "hot_audit";
    const hotValidSourceCount = decimal((await client.query(HOT_AUDIT_SQL))
      .rows[0]?.hot_valid_source_count);
    phase = "staging_audit";
    const stage = (await client.query(STAGING_AUDIT_SQL)).rows[0];
    check(stage && BigInt(decimal(stage.rows)) === BigInt(decimal(stage.distinct_rows)),
      "source_or_link_anomaly");
    check(BigInt(decimal(stage.unexpected_resolver_versions)) === 0n,
      "unexpected_resolver_versions");
    check(BigInt(decimal(stage.anomalies)) === 0n, "source_or_link_anomaly");
    check(BigInt(decimal(stage.active_without_metrics)) === 0n, "active_profiles_without_metrics");
    check(BigInt(stage.rows) === BigInt(stage.confirmed) + BigInt(stage.related),
      "classification_incomplete");
    phase = "staging_index";
    await client.query("create unique index rr_source_row_idx on rr_source(source_row_id)");
    timings.stagingMs = now() - stagingStart;

    const hmacStart = now();
    phase = "hmac_stage";
    const hmac = await stageHmac(client, keyBytes, stage.related);
    phase = "hmac_verify";
    await verifyHmac(client, keyBytes, stage.related);
    phase = "group_key_audit";
    const groupKeys = (await client.query(GROUP_KEY_AUDIT_SQL)).rows[0];
    check(BigInt(decimal(groupKeys?.mixed_group_keys)) === 0n, "mixed_group_keys");
    timings.hmacMs = now() - hmacStart;

    const insertStart = now();
    const snapshotId = randomUUID();
    phase = "snapshot_insert";
    await client.query(`
      insert into public.customer_related_review_snapshots
        (snapshot_id, rule_key, key_id, status)
      values ($1::uuid, 'RELATED_REVIEW_MCP_EAP_V1', $2::text, 'building')
    `, [snapshotId, keyId]);
    phase = "group_evidence";
    await client.query(GROUP_EVIDENCE_SQL);
    phase = "groups_insert";
    await client.query(GROUP_INSERT_SQL, [snapshotId]);
    phase = "members_insert";
    await client.query(MEMBERS_INSERT_SQL, [snapshotId]);
    phase = "assignments_insert";
    await client.query(ASSIGNMENTS_INSERT_SQL, [snapshotId]);
    phase = "metrics_insert";
    await client.query(METRICS_INSERT_SQL, [snapshotId]);
    phase = "group_analytics_insert";
    await client.query(GROUP_ANALYTICS_INSERT_SQL, [snapshotId]);
    phase = "contact_candidates_insert";
    await client.query(CONTACT_CANDIDATES_INSERT_SQL, [snapshotId]);
    timings.insertMs = now() - insertStart;

    const auditStart = now();
    phase = "audit_prepare";
    await client.query(EXPECTED_GROUPS_SQL);
    await client.query("create unique index rr_expected_groups_id_idx on rr_expected_groups(group_id)");
    await client.query(EXPECTED_ASSIGNMENTS_SQL);
    await client.query(`create unique index rr_expected_assignments_source_idx
      on rr_expected_assignments(source, source_row_id)`);
    await client.query(EXPECTED_MEMBERS_SQL);
    await client.query(`create unique index rr_expected_members_source_idx
      on rr_expected_members(source, source_row_id)`);
    const auditSnapshotLoadStart = now();
    await client.query(ACTUAL_ASSIGNMENTS_SQL, [snapshotId]);
    await client.query(`create unique index rr_actual_assignments_source_idx
      on rr_actual_assignments(source, source_row_id)`);
    await client.query(ACTUAL_MEMBERS_SQL, [snapshotId]);
    await client.query(`create unique index rr_actual_members_source_idx
      on rr_actual_members(source, source_row_id)`);
    await client.query("create index rr_actual_members_group_idx on rr_actual_members(group_id)");
    await client.query(ACTUAL_GROUPS_SQL, [snapshotId]);
    await client.query("create unique index rr_actual_groups_id_idx on rr_actual_groups(group_id)");
    await client.query(ACTUAL_METRICS_SQL, [snapshotId]);
    await client.query("create unique index rr_actual_metrics_id_idx on rr_actual_metrics(group_id)");
    timings.auditSnapshotLoadMs = now() - auditSnapshotLoadStart;
    timings.auditPrepareMs = now() - auditStart;
    const auditCheckStart = now();
    phase = "audit";
    const coverageStart = now();
    const coverageAudit = (await client.query(AUDIT_COUNTS_SQL)).rows[0];
    timings.auditCoverageMs = now() - coverageStart;
    const assignmentsStart = now();
    const assignmentsAudit = (await client.query(AUDIT_ASSIGNMENTS_SQL)).rows[0];
    timings.auditAssignmentsMs = now() - assignmentsStart;
    const membersStart = now();
    const membersAudit = (await client.query(AUDIT_MEMBERS_SQL)).rows[0];
    timings.auditMembersMs = now() - membersStart;
    const groupsStart = now();
    const groupsAudit = (await client.query(AUDIT_GROUPS_SQL)).rows[0];
    timings.auditGroupsMs = now() - groupsStart;
    const metricsStart = now();
    const metricsAudit = (await client.query(AUDIT_METRICS_SQL)).rows[0];
    timings.auditMetricsMs = now() - metricsStart;
    const analyticsStart = now();
    const analyticsAudit = (await client.query(ANALYTICS_AUDIT_SQL, [snapshotId])).rows[0];
    timings.auditAnalyticsMs = now() - analyticsStart;
    const overlapStart = now();
    const overlapAudit = (await client.query(AUDIT_OVERLAP_SQL)).rows[0];
    timings.auditOverlapMs = now() - overlapStart;
    const auditParts = [coverageAudit, assignmentsAudit, membersAudit, groupsAudit,
      metricsAudit, analyticsAudit, overlapAudit];
    check(auditParts.every(Boolean), "audit_missing");
    const audit = Object.assign({}, ...auditParts);
    assertAudit(audit, stage);
    timings.auditCheckMs = now() - auditCheckStart;
    timings.auditMs = now() - auditStart;

    const manifestStart = now();
    phase = "manifest_first";
    const manifestStats = {};
    const manifestSha256 = await hashManifest(client, snapshotId, keyId, manifestStats);
    phase = "snapshot_ready";
    await client.query(`
      update public.customer_related_review_snapshots
      set status = 'ready', built_at = now(), manifest_sha256 = $2::text,
        valid_source_count = $3::bigint, confirmed_count = $4::bigint,
        related_count = $5::bigint, group_count = $6::bigint,
        anomaly_count = 0, active_profiles_without_metrics_count = 0
      where snapshot_id = $1::uuid and status = 'building'
    `, [snapshotId, manifestSha256, audit.valid_source_count, audit.confirmed_count,
      audit.related_count, audit.group_count]);
    const ready = (await client.query(`
      select status, manifest_sha256 from public.customer_related_review_snapshots
      where snapshot_id = $1::uuid
    `, [snapshotId])).rows[0];
    check(ready?.status === "ready" && ready.manifest_sha256 === manifestSha256,
      "ready_contract_failed");
    timings.manifestMs = now() - manifestStart;
    phase = "backend_check";
    const beforeRollbackPid = (await client.query(
      "select pg_catalog.pg_backend_pid() as backend_pid",
    )).rows[0]?.backend_pid;
    check(beforeRollbackPid === preflight.backend_pid, "backend_changed");
    let rollbackCleanupOk;
    let postCommitVerificationOk;
    if (mode === "dry-run") {
      phase = "rollback";
      await client.query("ROLLBACK");
      transactionOpen = false;
      phase = "rollback_cleanup";
      const cleanup = (await client.query(`
        select not exists (select 1 from public.customer_related_review_snapshots
          where snapshot_id = $1::uuid) as absent,
          pg_catalog.pg_backend_pid() as backend_pid
      `, [snapshotId])).rows[0];
      check(cleanup?.absent === true && cleanup.backend_pid === preflight.backend_pid,
        "rollback_cleanup_failed");
      rollbackCleanupOk = true;
    } else {
      phase = "commit";
      await client.query("COMMIT");
      transactionOpen = false;
      committed = true;
      phase = "post_commit_verification";
      const persisted = (await client.query(`
        select snapshot_id::text as snapshot_id, status, rule_key, key_id, manifest_sha256,
          valid_source_count::text as valid_source_count,
          confirmed_count::text as confirmed_count, related_count::text as related_count,
          group_count::text as group_count, anomaly_count::text as anomaly_count,
          active_profiles_without_metrics_count::text as active_profiles_without_metrics_count,
          built_at
        from public.customer_related_review_snapshots where snapshot_id = $1::uuid
      `, [snapshotId])).rows[0];
      check(persisted?.snapshot_id === snapshotId && persisted.status === "ready"
        && persisted.rule_key === RULE && persisted.key_id === keyId
        && persisted.manifest_sha256 === manifestSha256
        && persisted.valid_source_count === audit.valid_source_count
        && persisted.confirmed_count === audit.confirmed_count
        && persisted.related_count === audit.related_count
        && persisted.group_count === audit.group_count
        && persisted.anomaly_count === "0"
        && persisted.active_profiles_without_metrics_count === "0"
        && persisted.built_at != null, "post_commit_verification_failed");
      postCommitVerificationOk = true;
    }
    timings.totalMs = now() - started;
    completed = true;
    const result = {
      ok: true,
      mode,
      validSourceCount: audit.valid_source_count,
      confirmedCount: audit.confirmed_count,
      relatedCount: audit.related_count,
      groupCount: audit.group_count,
      memberCount: audit.member_count,
      assignmentCount: audit.assignment_count,
      metricsCount: audit.metrics_count,
      analyticsCount: audit.analytics_count,
      contactCandidateCount: audit.contact_candidate_count,
      manifestSha256,
      manifestQueryCount: manifestStats.queryCount,
      manifestRowsHashed: manifestStats.rowsHashed,
      anomalyCount: 0,
      containsPii: false,
      pendingBatches: hmac.batches,
      maxBatchSize: hmac.maxBatchSize,
      stabilityLagMinutes,
      stabilityWindowMinutes: stabilityLagMinutes,
      hotValidSourceCount,
      timings,
    };
    if (mode === "dry-run") return { ...result, rollbackCleanupOk };
    return {
      ...result,
      snapshotId,
      snapshotStatus: "ready",
      committed,
      postCommitVerificationOk,
    };
  } catch (error) {
    if (error && typeof error === "object") {
      errorPhases.set(error, phase);
      errorCommitted.set(error, committed);
    }
    throw error;
  } finally {
    keyBytes?.fill(0);
    if (transactionOpen && client) {
      try { await client.query("ROLLBACK"); } catch { /* Disconnect also aborts the transaction. */ }
    }
    if (client) {
      phase = "client_end";
      try { await client.end(); } catch {
        if (completed) {
          const error = new BuildError("client_close_failed");
          errorPhases.set(error, phase);
          errorCommitted.set(error, committed);
          throw error;
        }
      }
    }
  }
}

export async function runDryRun(options = {}) {
  return runBuild({ ...options, mode: "dry-run" });
}

async function defaultReadyAudit(client, snapshotId, { onPhase } = {}) {
  return auditReadySnapshotWithClient(client, snapshotId, {
    hashManifestFn: hashManifest, onPhase,
  });
}

function withTimeout(task, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new BuildError("activation_phase_timeout")), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([Promise.resolve().then(task), timeout])
    .finally(() => clearTimeout(timer));
}

function guardClientErrors(client, timeoutMs) {
  let clientError;
  const onError = (error) => {
    if (!clientError) clientError = error instanceof Error ? error : new Error("database_client_error");
  };
  client.on?.("error", onError);
  return {
    async query(...args) {
      if (clientError) throw clientError;
      const result = await withTimeout(() => client.query(...args), timeoutMs);
      if (clientError) throw clientError;
      return result;
    },
    throwIfFailed() {
      if (clientError) throw clientError;
    },
    detach() {
      client.off?.("error", onError);
    },
  };
}

export async function runActivate({ snapshotId, env = process.env, ClientClass = pg.Client,
  buildConfig = buildClientConfig, readyAuditFn = defaultReadyAudit,
  watchdogMs = ACTIVATE_WATCHDOG_MS, onPhase } = {}) {
  let phase = "initializing";
  let client;
  let guarded;
  let transactionOpen = false;
  let committed = false;
  let completed = false;
  const enterPhase = (nextPhase) => {
    phase = nextPhase;
    try { onPhase?.(nextPhase); } catch { /* Observability cannot change activation behavior. */ }
  };
  try {
    check(typeof snapshotId === "string" && UUID.test(snapshotId), "invalid_snapshot_id");
    check(Number.isInteger(watchdogMs) && watchdogMs > 0, "invalid_activation_watchdog");
    snapshotId = snapshotId.toLowerCase();
    enterPhase("activate_env");
    const connection = buildConfig(env);
    connection.query_timeout = 11 * 60 * 1000;
    enterPhase("activate_connect");
    client = new ClientClass(connection);
    guarded = guardClientErrors(client, watchdogMs);
    await withTimeout(() => client.connect(), watchdogMs);

    enterPhase("activate_prevalidate_start");
    const identity = (await guarded.query(`
      select current_user as current_user, session_user as session_user,
        pg_catalog.pg_has_role(current_user, 'customer_related_review_builder', 'USAGE')
          as inherited_capability,
        pg_catalog.row_security_active('public.customer_related_review_snapshots')
          as snapshots_rls,
        pg_catalog.pg_backend_pid() as backend_pid
    `)).rows[0];
    check(identity?.current_user === LOGIN && identity?.session_user === LOGIN
      && identity?.inherited_capability === true, "builder_identity_mismatch");
    check(identity.snapshots_rls === true, "builder_rls_inactive");
    check(Number.isInteger(identity.backend_pid), "invalid_backend_pid");
    let audited;
    try {
      audited = await withTimeout(() => readyAuditFn(client, snapshotId, {
        onPhase: (auditPhase) => enterPhase(`activate_prevalidate_${auditPhase}`),
      }), watchdogMs);
      guarded.throwIfFailed();
    } catch (error) {
      if (error instanceof BuildError || /^[A-Z0-9]{5}$/.test(error?.code || "")) throw error;
      throw new BuildError(error?.code || "activation_revalidation_failed");
    }
    check(audited?.result?.ok === true && audited.snapshot?.snapshot_id === snapshotId,
      "activation_revalidation_failed");
    const expected = audited.snapshot;
    enterPhase("activate_prevalidate_done");

    enterPhase("activate_begin");
    await guarded.query("BEGIN");
    transactionOpen = true;
    await guarded.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await guarded.query("SET LOCAL lock_timeout = '3s'");
    await guarded.query("SET LOCAL statement_timeout = '10min'");
    await guarded.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");

    enterPhase("activate_lock");
    await guarded.query("select pg_catalog.pg_advisory_xact_lock(181923741, 1)");
    const target = (await guarded.query(`
      select snapshot_id::text as snapshot_id, status, rule_key, key_id, manifest_sha256,
        valid_source_count::text as valid_source_count,
        confirmed_count::text as confirmed_count, related_count::text as related_count,
        group_count::text as group_count, anomaly_count::text as anomaly_count,
        active_profiles_without_metrics_count::text as active_profiles_without_metrics_count,
        built_at::text as built_at
      from public.customer_related_review_snapshots
      where snapshot_id = $1::uuid
      for update
    `, [snapshotId])).rows[0];
    check(target?.snapshot_id === snapshotId, "snapshot_not_found");
    check(target.rule_key === RULE, "snapshot_contract_invalid");
    check(target.status !== "active", "snapshot_already_active");
    check(target.status === "ready", "snapshot_not_ready");

    const activeRows = (await guarded.query(`
      select snapshot_id::text as snapshot_id, activated_at
      from public.customer_related_review_snapshots
      where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active'
      order by snapshot_id
      for update
    `)).rows;
    check(activeRows.length <= 1, "multiple_active_snapshots");
    const previousActiveSnapshotId = activeRows[0]?.snapshot_id ?? null;

    enterPhase("activate_recheck");
    check(target.key_id === expected.key_id
      && target.manifest_sha256 === expected.manifest_sha256
      && target.valid_source_count === expected.valid_source_count
      && target.confirmed_count === expected.confirmed_count
      && target.related_count === expected.related_count
      && target.group_count === expected.group_count
      && target.anomaly_count === expected.anomaly_count
      && target.active_profiles_without_metrics_count
        === expected.active_profiles_without_metrics_count
      && target.built_at === expected.built_at,
    "snapshot_changed_since_prevalidation");

    enterPhase("activate_swap");
    if (previousActiveSnapshotId) {
      const superseded = (await guarded.query(`
        update public.customer_related_review_snapshots
        set status = 'superseded', superseded_at = now(), updated_at = now()
        where snapshot_id = $1::uuid and status = 'active'
        returning snapshot_id::text as snapshot_id, status, activated_at, superseded_at
      `, [previousActiveSnapshotId])).rows[0];
      check(superseded?.snapshot_id === previousActiveSnapshotId
        && superseded.status === "superseded"
        && superseded.activated_at != null
        && superseded.superseded_at != null, "previous_snapshot_supersede_failed");
    }
    const activated = (await guarded.query(`
      update public.customer_related_review_snapshots
      set status = 'active', activated_at = now(), superseded_at = null, updated_at = now()
      where snapshot_id = $1::uuid and status = 'ready'
      returning snapshot_id::text as snapshot_id, status, activated_at
    `, [snapshotId])).rows[0];
    check(activated?.snapshot_id === snapshotId && activated.status === "active"
      && activated.activated_at != null, "activation_update_failed");

    enterPhase("activate_verify");
    const verified = (await guarded.query(`
      select snapshot_id::text as snapshot_id, status, rule_key, key_id, manifest_sha256,
        valid_source_count::text as valid_source_count,
        confirmed_count::text as confirmed_count, related_count::text as related_count,
        group_count::text as group_count, anomaly_count::text as anomaly_count,
        active_profiles_without_metrics_count::text as active_profiles_without_metrics_count,
        built_at::text as built_at, activated_at,
        count(*) over ()::integer as active_count
      from public.customer_related_review_snapshots
      where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active'
    `)).rows[0];
    check(verified?.active_count === 1 && verified.snapshot_id === snapshotId
      && verified.status === "active" && verified.rule_key === RULE
      && verified.key_id === expected.key_id
      && verified.manifest_sha256 === expected.manifest_sha256
      && verified.valid_source_count === expected.valid_source_count
      && verified.confirmed_count === expected.confirmed_count
      && verified.related_count === expected.related_count
      && verified.group_count === expected.group_count
      && verified.anomaly_count === "0"
      && verified.active_profiles_without_metrics_count === "0"
      && verified.built_at != null && verified.activated_at != null,
    "activation_verification_failed");
    if (previousActiveSnapshotId) {
      const previousVerified = (await guarded.query(`
        select snapshot_id::text as snapshot_id, status, activated_at, superseded_at
        from public.customer_related_review_snapshots
        where snapshot_id = $1::uuid
      `, [previousActiveSnapshotId])).rows[0];
      check(previousVerified?.snapshot_id === previousActiveSnapshotId
        && previousVerified.status === "superseded"
        && previousVerified.activated_at != null
        && previousVerified.superseded_at != null, "previous_snapshot_verification_failed");
    }

    enterPhase("activate_commit");
    await guarded.query("COMMIT");
    transactionOpen = false;
    committed = true;

    enterPhase("activate_postcommit");
    const persisted = (await guarded.query(`
      select snapshot_id::text as snapshot_id, status, rule_key, key_id, manifest_sha256,
        valid_source_count::text as valid_source_count,
        confirmed_count::text as confirmed_count, related_count::text as related_count,
        group_count::text as group_count, anomaly_count::text as anomaly_count,
        active_profiles_without_metrics_count::text as active_profiles_without_metrics_count,
        built_at::text as built_at, activated_at,
        count(*) over ()::integer as active_count
      from public.customer_related_review_snapshots
      where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active'
    `)).rows[0];
    check(persisted?.active_count === 1 && persisted.snapshot_id === snapshotId
      && persisted.status === "active" && persisted.rule_key === RULE
      && persisted.key_id === expected.key_id
      && persisted.manifest_sha256 === expected.manifest_sha256
      && persisted.valid_source_count === expected.valid_source_count
      && persisted.confirmed_count === expected.confirmed_count
      && persisted.related_count === expected.related_count
      && persisted.group_count === expected.group_count
      && persisted.anomaly_count === "0"
      && persisted.active_profiles_without_metrics_count === "0"
      && persisted.built_at != null && persisted.activated_at != null,
    "post_commit_verification_failed");
    if (previousActiveSnapshotId) {
      const previousPersisted = (await guarded.query(`
        select snapshot_id::text as snapshot_id, status, activated_at, superseded_at
        from public.customer_related_review_snapshots
        where snapshot_id = $1::uuid
      `, [previousActiveSnapshotId])).rows[0];
      check(previousPersisted?.snapshot_id === previousActiveSnapshotId
        && previousPersisted.status === "superseded"
        && previousPersisted.activated_at != null
        && previousPersisted.superseded_at != null,
      "post_commit_previous_snapshot_verification_failed");
    }
    completed = true;
    return {
      ok: true,
      mode: "activate",
      snapshotId,
      status: "active",
      previousActiveSnapshotId,
      manifestSha256: expected.manifest_sha256,
      validSourceCount: expected.valid_source_count,
      confirmedCount: expected.confirmed_count,
      relatedCount: expected.related_count,
      groupCount: expected.group_count,
      anomalyCount: 0,
      containsPii: false,
      committed: true,
      postCommitVerificationOk: true,
    };
  } catch (error) {
    if (error && typeof error === "object") {
      errorPhases.set(error, phase);
      errorCommitted.set(error, committed);
    }
    throw error;
  } finally {
    if (transactionOpen && client) {
      try { await client.query("ROLLBACK"); } catch { /* Disconnect also aborts the transaction. */ }
    }
    if (client) {
      enterPhase("activate_end");
      try { await withTimeout(() => client.end(), Math.min(watchdogMs, 30_000)); } catch {
        if (completed) {
          const error = new BuildError("client_close_failed");
          errorPhases.set(error, phase);
          errorCommitted.set(error, committed);
          throw error;
        }
      } finally { guarded?.detach(); }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseBuildArgs(process.argv.slice(2));
    const result = args.mode === "activate" ? await runActivate({ ...args,
      onPhase: (phase) => console.error(JSON.stringify({
        ok: true, code: "activate_phase", phase,
      })),
    }) : await runBuild(args);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify(formatBuilderError(error)));
    process.exitCode = 1;
  }
}
