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
