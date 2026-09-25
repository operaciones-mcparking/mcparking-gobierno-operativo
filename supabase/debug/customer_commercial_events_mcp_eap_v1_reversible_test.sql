begin;

-- BEGIN EMBEDDED MIGRATION
-- Private append-oriented commercial facts for MCP/EAP.
-- Identity resolution and cross-source journey linking intentionally remain separate.

create table public.customer_commercial_events (
  event_id uuid primary key default gen_random_uuid(),
  event_key text not null,
  event_type text not null,
  event_at timestamptz,
  event_time_authority text not null,
  source_event_at timestamp without time zone,
  source_timezone text,
  timestamp_parser_version text,
  source text not null,
  source_entity text not null,
  source_record_key text not null,
  source_change_id uuid,
  brand text,
  parking text,
  amount numeric(14,2),
  amount_kind text,
  currency text,
  source_total_amount numeric(14,2),
  source_status integer,
  source_paying_status text,
  source_row_hash text,
  materialization_version text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint customer_commercial_events_event_key_unique unique (event_key),
  constraint customer_commercial_events_structural_unique
    unique (source, source_entity, source_record_key, event_type),
  constraint customer_commercial_events_event_key_check
    check (
      event_key = source || ':' || source_entity || ':' || source_record_key || ':' || event_type
      and length(event_key) between 1 and 700
    ),
  constraint customer_commercial_events_event_type_check
    check (event_type in (
      'purchase',
      'booking_cancelled',
      'payment_review',
      'checkout_abandoned',
      'checkout_cancelled'
    )),
  constraint customer_commercial_events_source_nonempty_check
    check (length(btrim(source)) between 1 and 100),
  constraint customer_commercial_events_source_entity_nonempty_check
    check (length(btrim(source_entity)) between 1 and 200),
  constraint customer_commercial_events_source_record_key_nonempty_check
    check (length(btrim(source_record_key)) between 1 and 300),
  constraint customer_commercial_events_mcp_eap_entity_check
    check (
      source <> 'MCP_EAP'
      or source_entity in ('mcp_Buchungen', 'BackendIncompleteBookings2')
    ),
  constraint customer_commercial_events_mcp_eap_event_entity_check
    check (
      source <> 'MCP_EAP'
      or (
        event_type in ('purchase', 'booking_cancelled', 'payment_review')
        and source_entity = 'mcp_Buchungen'
      )
      or (
        event_type in ('checkout_abandoned', 'checkout_cancelled')
        and source_entity = 'BackendIncompleteBookings2'
      )
    ),
  constraint customer_commercial_events_time_authority_check
    check (event_time_authority in ('source_event_at', 'observation_only')),
  constraint customer_commercial_events_time_contract_check
    check (
      (
        event_time_authority = 'source_event_at'
        and event_at is not null
        and source_event_at is not null
        and source_timezone = 'America/Santiago'
        and nullif(btrim(timestamp_parser_version), '') is not null
        and event_at = source_event_at at time zone 'America/Santiago'
      )
      or (
        event_time_authority = 'observation_only'
        and event_at is null
        and source_event_at is null
        and source_timezone is null
        and timestamp_parser_version is null
      )
    ),
  constraint customer_commercial_events_source_time_required_check
    check (
      event_type not in ('checkout_abandoned', 'checkout_cancelled')
      or event_time_authority = 'source_event_at'
    ),
  constraint customer_commercial_events_observation_evidence_check
    check (
      event_time_authority <> 'observation_only'
      or source <> 'MCP_EAP'
      or source_change_id is not null
      or coalesce(
        source_entity = 'mcp_Buchungen'
        and (
          (event_type = 'booking_cancelled' and source_status = 2)
          or (
            event_type = 'payment_review'
            and source_status = 9
            and source_paying_status = '1'
          )
        ),
        false
      )
    ),
  constraint customer_commercial_events_source_change_time_check
    check (
      source_change_id is null
      or event_time_authority = 'observation_only'
    ),
  constraint customer_commercial_events_amount_nonnegative_check
    check (
      (amount is null or amount >= 0)
      and (source_total_amount is null or source_total_amount >= 0)
    ),
  constraint customer_commercial_events_amount_presence_check
    check (
      (amount is null and amount_kind is null and currency is null)
      or (amount is not null and amount_kind is not null and currency = 'CLP')
    ),
  constraint customer_commercial_events_amount_kind_check
    check (
      (event_type = 'purchase' and amount is not null and amount_kind = 'paid_amount' and currency = 'CLP')
      or (
        event_type in ('booking_cancelled', 'payment_review')
        and (amount is null or amount_kind = 'observed_booking_amount')
      )
      or (
        event_type in ('checkout_abandoned', 'checkout_cancelled')
        and (amount is null or amount_kind = 'quoted_amount')
      )
    ),
  constraint customer_commercial_events_row_hash_check
    check (source_row_hash is null or source_row_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_commercial_events_materialization_version_check
    check (length(btrim(materialization_version)) between 1 and 100),
  constraint customer_commercial_events_observed_order_check
    check (updated_at >= created_at)
);

create index customer_commercial_events_type_time_idx
  on public.customer_commercial_events(event_type, event_at desc, event_id)
  where event_at is not null;

create index customer_commercial_events_source_record_idx
  on public.customer_commercial_events(source, source_entity, source_record_key);

create index customer_commercial_events_observed_at_idx
  on public.customer_commercial_events(observed_at desc, event_id);

create index customer_commercial_events_source_change_idx
  on public.customer_commercial_events(source_change_id)
  where source_change_id is not null;

alter table public.customer_commercial_events enable row level security;

revoke all on table public.customer_commercial_events
  from public, anon, authenticated, service_role;

create or replace function public.customer_commercial_events_upsert_v1_m2m(
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_received integer;
  v_affected integer;
  v_distinct integer;
begin
  if p_events is null or pg_catalog.jsonb_typeof(p_events) <> 'array' then
    raise exception 'events_array_required' using errcode = '22023';
  end if;

  v_received := pg_catalog.jsonb_array_length(p_events);
  if v_received < 1 or v_received > 1000 then
    raise exception 'events_batch_size_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_events) item(value)
    where pg_catalog.jsonb_typeof(item.value) <> 'object'
  ) then
    raise exception 'event_object_required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_events) item(value)
    where coalesce(item.value ->> 'source', '') <> 'MCP_EAP'
  ) then
    raise exception 'event_source_not_supported' using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_events) item(value)
    cross join lateral pg_catalog.jsonb_object_keys(item.value) property(key)
    where property.key not in (
      'event_type', 'event_at', 'event_time_authority', 'source_event_at',
      'source_timezone', 'timestamp_parser_version', 'source', 'source_entity',
      'source_record_key', 'source_change_id', 'brand', 'parking', 'amount',
      'amount_kind', 'currency', 'source_total_amount', 'source_status',
      'source_paying_status', 'source_row_hash', 'materialization_version', 'observed_at'
    )
  ) then
    raise exception 'unexpected_event_field' using errcode = '22023';
  end if;

  with input as (
    select
      btrim(event_type) as event_type,
      case
        when btrim(event_time_authority) = 'source_event_at'
          then source_event_at at time zone 'America/Santiago'
        else null
      end as event_at,
      btrim(event_time_authority) as event_time_authority,
      source_event_at,
      nullif(btrim(source_timezone), '') as source_timezone,
      nullif(btrim(timestamp_parser_version), '') as timestamp_parser_version,
      btrim(source) as source,
      btrim(source_entity) as source_entity,
      btrim(source_record_key) as source_record_key,
      source_change_id,
      nullif(btrim(brand), '') as brand,
      nullif(btrim(parking), '') as parking,
      amount,
      nullif(btrim(amount_kind), '') as amount_kind,
      nullif(btrim(currency), '') as currency,
      source_total_amount,
      source_status,
      nullif(btrim(source_paying_status), '') as source_paying_status,
      nullif(btrim(source_row_hash), '') as source_row_hash,
      btrim(materialization_version) as materialization_version,
      observed_at
    from pg_catalog.jsonb_to_recordset(p_events) as event(
      event_type text,
      event_at timestamptz,
      event_time_authority text,
      source_event_at timestamp without time zone,
      source_timezone text,
      timestamp_parser_version text,
      source text,
      source_entity text,
      source_record_key text,
      source_change_id uuid,
      brand text,
      parking text,
      amount numeric(14,2),
      amount_kind text,
      currency text,
      source_total_amount numeric(14,2),
      source_status integer,
      source_paying_status text,
      source_row_hash text,
      materialization_version text,
      observed_at timestamptz
    )
  ), keyed as (
    select
      input.*,
      input.source || ':' || input.source_entity || ':' || input.source_record_key || ':' || input.event_type as event_key
    from input
  )
  select pg_catalog.count(*), pg_catalog.count(distinct keyed.event_key)
  into v_received, v_distinct
  from keyed;

  if v_received <> v_distinct then
    raise exception 'duplicate_event_key_in_batch' using errcode = '22023';
  end if;

  with input as (
    select
      btrim(event_type) as event_type,
      case
        when btrim(event_time_authority) = 'source_event_at'
          then source_event_at at time zone 'America/Santiago'
        else null
      end as event_at,
      btrim(event_time_authority) as event_time_authority,
      source_event_at,
      nullif(btrim(source_timezone), '') as source_timezone,
      nullif(btrim(timestamp_parser_version), '') as timestamp_parser_version,
      btrim(source) as source,
      btrim(source_entity) as source_entity,
      btrim(source_record_key) as source_record_key,
      source_change_id,
      nullif(btrim(brand), '') as brand,
      nullif(btrim(parking), '') as parking,
      amount,
      nullif(btrim(amount_kind), '') as amount_kind,
      nullif(btrim(currency), '') as currency,
      source_total_amount,
      source_status,
      nullif(btrim(source_paying_status), '') as source_paying_status,
      nullif(btrim(source_row_hash), '') as source_row_hash,
      btrim(materialization_version) as materialization_version,
      observed_at
    from pg_catalog.jsonb_to_recordset(p_events) as event(
      event_type text,
      event_at timestamptz,
      event_time_authority text,
      source_event_at timestamp without time zone,
      source_timezone text,
      timestamp_parser_version text,
      source text,
      source_entity text,
      source_record_key text,
      source_change_id uuid,
      brand text,
      parking text,
      amount numeric(14,2),
      amount_kind text,
      currency text,
      source_total_amount numeric(14,2),
      source_status integer,
      source_paying_status text,
      source_row_hash text,
      materialization_version text,
      observed_at timestamptz
    )
  ), upserted as (
    insert into public.customer_commercial_events as target (
      event_key, event_type, event_at, event_time_authority, source_event_at,
      source_timezone, timestamp_parser_version, source, source_entity,
      source_record_key, source_change_id, brand, parking, amount, amount_kind,
      currency, source_total_amount, source_status, source_paying_status,
      source_row_hash, materialization_version, observed_at
    )
    select
      input.source || ':' || input.source_entity || ':' || input.source_record_key || ':' || input.event_type,
      input.event_type, input.event_at, input.event_time_authority, input.source_event_at,
      input.source_timezone, input.timestamp_parser_version, input.source, input.source_entity,
      input.source_record_key, input.source_change_id, input.brand, input.parking,
      input.amount, input.amount_kind, input.currency, input.source_total_amount,
      input.source_status, input.source_paying_status, input.source_row_hash,
      input.materialization_version, input.observed_at
    from input
    on conflict (source, source_entity, source_record_key, event_type) do update
    set
      event_at = coalesce(excluded.event_at, target.event_at),
      event_time_authority = case when excluded.event_at is not null then excluded.event_time_authority else target.event_time_authority end,
      source_event_at = coalesce(excluded.source_event_at, target.source_event_at),
      source_timezone = coalesce(excluded.source_timezone, target.source_timezone),
      timestamp_parser_version = coalesce(excluded.timestamp_parser_version, target.timestamp_parser_version),
      source_change_id = case
        when (
          case
            when excluded.event_at is not null then excluded.event_time_authority
            else target.event_time_authority
          end
        ) = 'source_event_at' then null
        else coalesce(excluded.source_change_id, target.source_change_id)
      end,
      brand = coalesce(excluded.brand, target.brand),
      parking = coalesce(excluded.parking, target.parking),
      amount = coalesce(excluded.amount, target.amount),
      amount_kind = case when excluded.amount is not null then excluded.amount_kind else target.amount_kind end,
      currency = case when excluded.amount is not null then excluded.currency else target.currency end,
      source_total_amount = coalesce(excluded.source_total_amount, target.source_total_amount),
      source_status = excluded.source_status,
      source_paying_status = excluded.source_paying_status,
      source_row_hash = coalesce(excluded.source_row_hash, target.source_row_hash),
      materialization_version = excluded.materialization_version,
      observed_at = excluded.observed_at,
      updated_at = pg_catalog.clock_timestamp()
    where (
        excluded.event_time_authority = 'source_event_at'
        and target.event_time_authority = 'observation_only'
      )
      or (
        excluded.event_time_authority = target.event_time_authority
        and (
          excluded.observed_at > target.observed_at
          or (
        excluded.observed_at = target.observed_at
        and row(
          coalesce(excluded.event_at, target.event_at),
          case when excluded.event_at is not null then excluded.event_time_authority else target.event_time_authority end,
          coalesce(excluded.source_event_at, target.source_event_at),
          coalesce(excluded.source_timezone, target.source_timezone),
          coalesce(excluded.timestamp_parser_version, target.timestamp_parser_version),
          case
            when (
              case
                when excluded.event_at is not null then excluded.event_time_authority
                else target.event_time_authority
              end
            ) = 'source_event_at' then null
            else coalesce(excluded.source_change_id, target.source_change_id)
          end,
          coalesce(excluded.brand, target.brand),
          coalesce(excluded.parking, target.parking),
          coalesce(excluded.amount, target.amount),
          case when excluded.amount is not null then excluded.amount_kind else target.amount_kind end,
          case when excluded.amount is not null then excluded.currency else target.currency end,
          coalesce(excluded.source_total_amount, target.source_total_amount),
          excluded.source_status,
          excluded.source_paying_status,
          coalesce(excluded.source_row_hash, target.source_row_hash),
          excluded.materialization_version
        ) is distinct from row(
          target.event_at,
          target.event_time_authority,
          target.source_event_at,
          target.source_timezone,
          target.timestamp_parser_version,
          target.source_change_id,
          target.brand,
          target.parking,
          target.amount,
          target.amount_kind,
          target.currency,
          target.source_total_amount,
          target.source_status,
          target.source_paying_status,
          target.source_row_hash,
          target.materialization_version
        )
          )
        )
      )
    returning 1
  )
  select pg_catalog.count(*) into v_affected from upserted;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'receivedEvents', v_received,
    'affectedEvents', v_affected,
    'containsPii', false
  );
end;
$$;

revoke all on function public.customer_commercial_events_upsert_v1_m2m(jsonb)
  from public, anon, authenticated;
grant execute on function public.customer_commercial_events_upsert_v1_m2m(jsonb)
  to service_role;

comment on table public.customer_commercial_events is
  'Private identity-independent commercial event facts. Journey and identity links are separate contracts.';
comment on column public.customer_commercial_events.event_at is
  'Commercial source time when certified; null when only an observation time is known.';
comment on column public.customer_commercial_events.observed_at is
  'Time at which the source state or transition was observed; never substituted for an unknown commercial event time.';
comment on function public.customer_commercial_events_upsert_v1_m2m(jsonb) is
  'Service-role-only bulk materializer. Derives event_key, promotes canonical source time, then refreshes newer or effectively changed same-authority evidence.';
-- END EMBEDDED MIGRATION

do $assert_catalog$
begin
  if pg_catalog.to_regclass('public.customer_commercial_events') is null then
    raise exception 'commercial events table missing';
  end if;
  if pg_catalog.to_regprocedure('public.customer_commercial_events_upsert_v1_m2m(jsonb)') is null then
    raise exception 'commercial events RPC missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_class relation
    where relation.oid = 'public.customer_commercial_events'::regclass
      and relation.relrowsecurity
  ) then
    raise exception 'commercial events RLS missing';
  end if;
  if pg_catalog.has_table_privilege('service_role', 'public.customer_commercial_events', 'SELECT')
    or pg_catalog.has_table_privilege('service_role', 'public.customer_commercial_events', 'INSERT')
    or pg_catalog.has_table_privilege('service_role', 'public.customer_commercial_events', 'UPDATE')
    or pg_catalog.has_table_privilege('service_role', 'public.customer_commercial_events', 'DELETE') then
    raise exception 'service_role has forbidden direct table access';
  end if;
  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.customer_commercial_events_upsert_v1_m2m(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role RPC execute missing';
  end if;
end;
$assert_catalog$;

set local role service_role;

select public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'purchase',
      'event_time_authority', 'source_event_at',
      'source_event_at', '2026-09-24 10:00:00',
      'source_timezone', 'America/Santiago',
      'timestamp_parser_version', 'mcp_eap_buchungszeit_santiago_v1',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', '100',
      'brand', 'MCP',
      'parking', 'MCPARKING',
      'amount', 10000,
      'amount_kind', 'paid_amount',
      'currency', 'CLP',
      'source_total_amount', 10000,
      'source_status', 1,
      'source_paying_status', '1',
      'source_row_hash', repeat('a', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T13:00:00Z'
    ),
    pg_catalog.jsonb_build_object(
      'event_type', 'booking_cancelled',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', '100',
      'source_status', 2,
      'source_row_hash', repeat('b', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T14:00:00Z'
    ),
    pg_catalog.jsonb_build_object(
      'event_type', 'payment_review',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', '200',
      'amount', 12000,
      'amount_kind', 'observed_booking_amount',
      'currency', 'CLP',
      'source_status', 9,
      'source_paying_status', '1',
      'source_row_hash', repeat('c', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T15:00:00Z'
    ),
    pg_catalog.jsonb_build_object(
      'event_type', 'checkout_abandoned',
      'event_time_authority', 'source_event_at',
      'source_event_at', '2026-09-24 11:00:00',
      'source_timezone', 'America/Santiago',
      'timestamp_parser_version', 'backend_incomplete_form_datetime_santiago_v1',
      'source', 'MCP_EAP',
      'source_entity', 'BackendIncompleteBookings2',
      'source_record_key', '300',
      'source_row_hash', repeat('d', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T14:00:00Z'
    ),
    pg_catalog.jsonb_build_object(
      'event_type', 'checkout_cancelled',
      'event_time_authority', 'source_event_at',
      'source_event_at', '2026-09-24 12:00:00',
      'source_timezone', 'America/Santiago',
      'timestamp_parser_version', 'backend_incomplete_form_datetime_santiago_v1',
      'source', 'MCP_EAP',
      'source_entity', 'BackendIncompleteBookings2',
      'source_record_key', '400',
      'amount', 0,
      'amount_kind', 'quoted_amount',
      'currency', 'CLP',
      'source_row_hash', repeat('e', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T15:00:00Z'
    ),
    pg_catalog.jsonb_build_object(
      'event_type', 'purchase',
      'event_time_authority', 'source_event_at',
      'source_event_at', '2026-09-24 13:00:00',
      'source_timezone', 'America/Santiago',
      'timestamp_parser_version', 'mcp_eap_buchungszeit_santiago_v1',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', '500',
      'amount', 0,
      'amount_kind', 'paid_amount',
      'currency', 'CLP',
      'source_status', 1,
      'source_row_hash', repeat('f', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T16:00:00Z'
    )
  )
);

select public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'purchase',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', '200',
      'source_change_id', '11111111-1111-4111-8111-111111111111',
      'amount', 12000,
      'amount_kind', 'paid_amount',
      'currency', 'CLP',
      'source_status', 1,
      'source_row_hash', repeat('1', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T16:10:00Z'
    ),
    pg_catalog.jsonb_build_object(
      'event_type', 'booking_cancelled',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', '200',
      'source_change_id', '22222222-2222-4222-8222-222222222222',
      'amount', 12000,
      'amount_kind', 'observed_booking_amount',
      'currency', 'CLP',
      'source_status', 2,
      'source_row_hash', repeat('2', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T16:20:00Z'
    )
  )
);

-- A later same-class observation may refresh the existing natural event.
select public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'booking_cancelled',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', '100',
      'source_change_id', '33333333-3333-4333-8333-333333333333',
      'amount', 500,
      'amount_kind', 'observed_booking_amount',
      'currency', 'CLP',
      'source_status', 2,
      'source_row_hash', repeat('3', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T17:00:00Z'
    )
  )
);

reset role;

create temporary table rr_commercial_event_upsert_results (
  case_name text primary key,
  result jsonb not null
) on commit drop;

create temporary table rr_commercial_event_states (
  case_name text primary key,
  updated_at timestamptz not null,
  observed_at timestamptz not null,
  amount numeric(14,2),
  source_row_hash text
) on commit drop;

insert into rr_commercial_event_states
select 'before_identical_replay', updated_at, observed_at, amount, source_row_hash
from public.customer_commercial_events
where source = 'MCP_EAP'
  and source_entity = 'mcp_Buchungen'
  and source_record_key = '100'
  and event_type = 'booking_cancelled';

select pg_catalog.pg_sleep(0.01);

insert into rr_commercial_event_upsert_results (case_name, result)
select 'identical_replay', public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'booking_cancelled',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', '100',
      'source_change_id', '33333333-3333-4333-8333-333333333333',
      'amount', 500,
      'amount_kind', 'observed_booking_amount',
      'currency', 'CLP',
      'source_status', 2,
      'source_row_hash', repeat('3', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T17:00:00Z'
    )
  )
);

insert into rr_commercial_event_states
select 'after_identical_replay', updated_at, observed_at, amount, source_row_hash
from public.customer_commercial_events
where source = 'MCP_EAP'
  and source_entity = 'mcp_Buchungen'
  and source_record_key = '100'
  and event_type = 'booking_cancelled';

select pg_catalog.pg_sleep(0.01);

insert into rr_commercial_event_upsert_results (case_name, result)
select 'same_time_enrichment', public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'booking_cancelled',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', '100',
      'source_change_id', '33333333-3333-4333-8333-333333333333',
      'amount', 600,
      'amount_kind', 'observed_booking_amount',
      'currency', 'CLP',
      'source_status', 2,
      'source_row_hash', repeat('4', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T17:00:00Z'
    )
  )
);

insert into rr_commercial_event_states
select 'after_same_time_enrichment', updated_at, observed_at, amount, source_row_hash
from public.customer_commercial_events
where source = 'MCP_EAP'
  and source_entity = 'mcp_Buchungen'
  and source_record_key = '100'
  and event_type = 'booking_cancelled';

select pg_catalog.pg_sleep(0.01);

insert into rr_commercial_event_upsert_results (case_name, result)
select 'newer_observation', public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'booking_cancelled',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', '100',
      'source_change_id', '33333333-3333-4333-8333-333333333333',
      'amount', 700,
      'amount_kind', 'observed_booking_amount',
      'currency', 'CLP',
      'source_status', 2,
      'source_row_hash', repeat('5', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T18:00:00Z'
    )
  )
);

insert into rr_commercial_event_states
select 'after_newer_observation', updated_at, observed_at, amount, source_row_hash
from public.customer_commercial_events
where source = 'MCP_EAP'
  and source_entity = 'mcp_Buchungen'
  and source_record_key = '100'
  and event_type = 'booking_cancelled';

select pg_catalog.pg_sleep(0.01);

insert into rr_commercial_event_upsert_results (case_name, result)
select 'older_observation', public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'booking_cancelled',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', '100',
      'source_change_id', '33333333-3333-4333-8333-333333333333',
      'amount', 900,
      'amount_kind', 'observed_booking_amount',
      'currency', 'CLP',
      'source_status', 2,
      'source_row_hash', repeat('6', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T16:00:00Z'
    )
  )
);

insert into rr_commercial_event_states
select 'after_older_observation', updated_at, observed_at, amount, source_row_hash
from public.customer_commercial_events
where source = 'MCP_EAP'
  and source_entity = 'mcp_Buchungen'
  and source_record_key = '100'
  and event_type = 'booking_cancelled';

do $assert_upsert_ordering$
declare
  v_before rr_commercial_event_states%rowtype;
  v_identical rr_commercial_event_states%rowtype;
  v_enriched rr_commercial_event_states%rowtype;
  v_newer rr_commercial_event_states%rowtype;
  v_older rr_commercial_event_states%rowtype;
begin
  select * into strict v_before from rr_commercial_event_states where case_name = 'before_identical_replay';
  select * into strict v_identical from rr_commercial_event_states where case_name = 'after_identical_replay';
  select * into strict v_enriched from rr_commercial_event_states where case_name = 'after_same_time_enrichment';
  select * into strict v_newer from rr_commercial_event_states where case_name = 'after_newer_observation';
  select * into strict v_older from rr_commercial_event_states where case_name = 'after_older_observation';

  if (select (result ->> 'affectedEvents')::integer from rr_commercial_event_upsert_results where case_name = 'identical_replay') <> 0
    or v_identical.updated_at <> v_before.updated_at then
    raise exception 'identical same-time replay performed an update';
  end if;
  if (select (result ->> 'affectedEvents')::integer from rr_commercial_event_upsert_results where case_name = 'same_time_enrichment') <> 1
    or v_enriched.updated_at <= v_identical.updated_at
    or v_enriched.amount <> 600 then
    raise exception 'same-time effective enrichment was not applied';
  end if;
  if (select (result ->> 'affectedEvents')::integer from rr_commercial_event_upsert_results where case_name = 'newer_observation') <> 1
    or v_newer.updated_at <= v_enriched.updated_at
    or v_newer.observed_at <> '2026-09-24T18:00:00Z'::timestamptz
    or v_newer.amount <> 700 then
    raise exception 'newer observation was not applied';
  end if;
  if (select (result ->> 'affectedEvents')::integer from rr_commercial_event_upsert_results where case_name = 'older_observation') <> 0
    or v_older.updated_at <> v_newer.updated_at
    or v_older.observed_at <> v_newer.observed_at
    or v_older.amount <> 700 then
    raise exception 'older observation overwrote newer state';
  end if;
end;
$assert_upsert_ordering$;

insert into rr_commercial_event_upsert_results (case_name, result)
select 'promotion_transition_insert', public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'purchase',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', 'temporal-promotion',
      'source_change_id', '55555555-5555-4555-8555-555555555555',
      'amount', 1000,
      'amount_kind', 'paid_amount',
      'currency', 'CLP',
      'source_status', 1,
      'source_row_hash', repeat('9', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T19:00:00Z'
    )
  )
);

insert into rr_commercial_event_upsert_results (case_name, result)
select 'promotion_canonical_update', public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'purchase',
      'event_time_authority', 'source_event_at',
      'source_event_at', '2026-09-24 15:00:00',
      'source_timezone', 'America/Santiago',
      'timestamp_parser_version', 'mcp_eap_buchungszeit_santiago_v1',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', 'temporal-promotion',
      'amount', 1000,
      'amount_kind', 'paid_amount',
      'currency', 'CLP',
      'source_status', 1,
      'source_row_hash', repeat('a', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T18:00:00Z'
    )
  )
);

insert into rr_commercial_event_upsert_results (case_name, result)
select 'canonical_first_insert', public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'purchase',
      'event_time_authority', 'source_event_at',
      'source_event_at', '2026-09-24 16:00:00',
      'source_timezone', 'America/Santiago',
      'timestamp_parser_version', 'mcp_eap_buchungszeit_santiago_v1',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', 'canonical-first',
      'amount', 2000,
      'amount_kind', 'paid_amount',
      'currency', 'CLP',
      'source_status', 1,
      'source_row_hash', repeat('b', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T19:00:00Z'
    )
  )
);

insert into rr_commercial_event_upsert_results (case_name, result)
select 'canonical_first_transition_update', public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'purchase',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', 'canonical-first',
      'source_change_id', '66666666-6666-4666-8666-666666666666',
      'amount', 2000,
      'amount_kind', 'paid_amount',
      'currency', 'CLP',
      'source_status', 1,
      'source_row_hash', repeat('c', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T20:00:00Z'
    )
  )
);

insert into rr_commercial_event_upsert_results (case_name, result)
select 'same_time_transition_insert', public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'purchase',
      'event_time_authority', 'observation_only',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', 'same-time-promotion',
      'source_change_id', '77777777-7777-4777-8777-777777777777',
      'amount', 3000,
      'amount_kind', 'paid_amount',
      'currency', 'CLP',
      'source_status', 1,
      'source_row_hash', repeat('d', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T21:00:00Z'
    )
  )
);

insert into rr_commercial_event_upsert_results (case_name, result)
select 'same_time_canonical_update', public.customer_commercial_events_upsert_v1_m2m(
  pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'event_type', 'purchase',
      'event_time_authority', 'source_event_at',
      'source_event_at', '2026-09-24 17:00:00',
      'source_timezone', 'America/Santiago',
      'timestamp_parser_version', 'mcp_eap_buchungszeit_santiago_v1',
      'source', 'MCP_EAP',
      'source_entity', 'mcp_Buchungen',
      'source_record_key', 'same-time-promotion',
      'amount', 3000,
      'amount_kind', 'paid_amount',
      'currency', 'CLP',
      'source_status', 1,
      'source_row_hash', repeat('e', 64),
      'materialization_version', 'customer_commercial_events_mcp_eap_v1',
      'observed_at', '2026-09-24T21:00:00Z'
    )
  )
);

do $assert_temporal_promotion$
begin
  if (select (result ->> 'affectedEvents')::integer from rr_commercial_event_upsert_results where case_name = 'promotion_canonical_update') <> 1
    or not exists (
      select 1 from public.customer_commercial_events
      where source_record_key = 'temporal-promotion'
        and event_type = 'purchase'
        and event_time_authority = 'source_event_at'
        and event_at is not null
        and source_change_id is null
    ) then
    raise exception 'observation-only purchase was not promoted to certified source time';
  end if;
  if (select (result ->> 'affectedEvents')::integer from rr_commercial_event_upsert_results where case_name = 'canonical_first_transition_update') <> 0
    or not exists (
      select 1 from public.customer_commercial_events
      where source_record_key = 'canonical-first'
        and event_type = 'purchase'
        and event_time_authority = 'source_event_at'
        and event_at is not null
        and source_change_id is null
        and observed_at = '2026-09-24T19:00:00Z'::timestamptz
        and source_row_hash = repeat('b', 64)
    ) then
    raise exception 'newer observation-only evidence degraded certified source time';
  end if;
  if (select (result ->> 'affectedEvents')::integer from rr_commercial_event_upsert_results where case_name = 'same_time_canonical_update') <> 1
    or not exists (
      select 1 from public.customer_commercial_events
      where source_record_key = 'same-time-promotion'
        and event_type = 'purchase'
        and event_time_authority = 'source_event_at'
        and event_at is not null
        and source_change_id is null
    ) then
    raise exception 'same-time certified promotion was not applied';
  end if;
end;
$assert_temporal_promotion$;

do $assert_rows$
declare
  v_count integer;
begin
  select count(*) into v_count from public.customer_commercial_events;
  if v_count <> 11 then
    raise exception 'expected 11 distinct commercial events, got %', v_count;
  end if;
  if (select count(*) from public.customer_commercial_events where source_record_key = '100') <> 2 then
    raise exception 'same source record with distinct event types did not coexist';
  end if;
  if not exists (
    select 1 from public.customer_commercial_events
    where source_record_key = '100'
      and event_type = 'booking_cancelled'
      and amount = 700
      and source_change_id = '33333333-3333-4333-8333-333333333333'::uuid
  ) then
    raise exception 'same-class refresh or row-change replay failed';
  end if;
  if not exists (
    select 1 from public.customer_commercial_events
    where source_record_key = '500' and event_type = 'purchase' and amount = 0
  ) then
    raise exception 'zero amount was not preserved';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_commercial_events'
      and column_name in ('email', 'email_normalized', 'phone', 'phone_normalized', 'plate', 'plate_normalized', 'raw_payload')
  ) then
    raise exception 'PII column found';
  end if;
end;
$assert_rows$;

do $purchase_observation_without_change$
begin
  perform public.customer_commercial_events_upsert_v1_m2m(
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'event_type', 'purchase',
        'event_time_authority', 'observation_only',
        'source', 'MCP_EAP',
        'source_entity', 'mcp_Buchungen',
        'source_record_key', 'purchase-without-change',
        'amount', 1000,
        'amount_kind', 'paid_amount',
        'currency', 'CLP',
        'source_status', 1,
        'source_row_hash', repeat('7', 64),
        'materialization_version', 'customer_commercial_events_mcp_eap_v1',
        'observed_at', '2026-09-24T18:00:00Z'
      )
    )
  );
  raise exception 'purchase observation_only without source_change_id unexpectedly accepted';
exception
  when check_violation then null;
end;
$purchase_observation_without_change$;

do $source_change_with_source_time$
begin
  perform public.customer_commercial_events_upsert_v1_m2m(
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'event_type', 'purchase',
        'event_time_authority', 'source_event_at',
        'source_event_at', '2026-09-24 14:00:00',
        'source_timezone', 'America/Santiago',
        'timestamp_parser_version', 'mcp_eap_buchungszeit_santiago_v1',
        'source', 'MCP_EAP',
        'source_entity', 'mcp_Buchungen',
        'source_record_key', 'source-change-with-source-time',
        'source_change_id', '44444444-4444-4444-8444-444444444444',
        'amount', 1000,
        'amount_kind', 'paid_amount',
        'currency', 'CLP',
        'source_status', 1,
        'source_row_hash', repeat('8', 64),
        'materialization_version', 'customer_commercial_events_mcp_eap_v1',
        'observed_at', '2026-09-24T18:00:00Z'
      )
    )
  );
  raise exception 'source_change_id with source_event_at unexpectedly accepted';
exception
  when check_violation then null;
end;
$source_change_with_source_time$;

do $negative_amount$
begin
  perform public.customer_commercial_events_upsert_v1_m2m(
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'event_type', 'payment_review',
        'event_time_authority', 'observation_only',
        'source', 'MCP_EAP',
        'source_entity', 'mcp_Buchungen',
        'source_record_key', 'negative',
        'amount', -1,
        'amount_kind', 'observed_booking_amount',
        'currency', 'CLP',
        'source_status', 9,
        'source_paying_status', '1',
        'materialization_version', 'customer_commercial_events_mcp_eap_v1',
        'observed_at', '2026-09-24T18:00:00Z'
      )
    )
  );
  raise exception 'negative amount unexpectedly accepted';
exception
  when check_violation then null;
end;
$negative_amount$;

do $null_amount_contract$
begin
  perform public.customer_commercial_events_upsert_v1_m2m(
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'event_type', 'booking_cancelled',
        'event_time_authority', 'observation_only',
        'source', 'MCP_EAP',
        'source_entity', 'mcp_Buchungen',
        'source_record_key', 'null-mismatch',
        'amount_kind', 'observed_booking_amount',
        'currency', 'CLP',
        'source_status', 2,
        'materialization_version', 'customer_commercial_events_mcp_eap_v1',
        'observed_at', '2026-09-24T18:00:00Z'
      )
    )
  );
  raise exception 'null amount mismatch unexpectedly accepted';
exception
  when check_violation then null;
end;
$null_amount_contract$;

rollback;

do $post_rollback$
begin
  if pg_catalog.to_regclass('public.customer_commercial_events') is not null
    or pg_catalog.to_regprocedure('public.customer_commercial_events_upsert_v1_m2m(jsonb)') is not null then
    raise exception 'reversible cleanup failed';
  end if;
end;
$post_rollback$;

select
  pg_catalog.to_regclass('public.customer_commercial_events') is null as table_absent,
  pg_catalog.to_regprocedure('public.customer_commercial_events_upsert_v1_m2m(jsonb)') is null as rpc_absent,
  true as reversible_cleanup_ok;
