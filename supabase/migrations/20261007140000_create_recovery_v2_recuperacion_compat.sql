-- Recovery V2 compatibility layer for /recuperacion.
-- Creates read-only views/RPCs that mirror legacy read contracts without switching
-- any productive endpoint, frontend component, import workflow, or raw V2 table.

begin;

do $$
begin
  if to_regclass('public.recovery_incomplete_bookings_v2') is null then
    raise exception 'Missing table public.recovery_incomplete_bookings_v2';
  end if;
  if to_regclass('public.recovery_whatsapp_messages_v2') is null then
    raise exception 'Missing table public.recovery_whatsapp_messages_v2';
  end if;
  if to_regclass('public.recovery_whatsapp_tracking_v2') is null then
    raise exception 'Missing table public.recovery_whatsapp_tracking_v2';
  end if;
  if to_regclass('public.recovery_incomplete_bookings_import') is null then
    raise exception 'Missing legacy table public.recovery_incomplete_bookings_import';
  end if;
  if to_regclass('public.recovery_whatsapp_message_memory_import') is null then
    raise exception 'Missing legacy table public.recovery_whatsapp_message_memory_import';
  end if;
  if to_regclass('public.recovery_whatsapp_message_memory_raw_import') is null then
    raise exception 'Missing legacy table public.recovery_whatsapp_message_memory_raw_import';
  end if;
  if to_regclass('public.recovery_whatsapp_tracking_import') is null then
    raise exception 'Missing legacy table public.recovery_whatsapp_tracking_import';
  end if;
  if to_regclass('public.recovery_bookings_import') is null then
    raise exception 'Missing legacy table public.recovery_bookings_import';
  end if;
end;
$$;

create or replace function public.recovery_v2_compat_normalize_phone(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  with digits as (
    select regexp_replace(coalesce(p_raw, ''), '\D', '', 'g') as value
  ),
  unprefixed as (
    select case
      when value like '00%' then substr(value, 3)
      else value
    end as value
    from digits
  ),
  normalized_prefix as (
    select case
      when value like '056%' then substr(value, 2)
      else value
    end as value
    from unprefixed
  )
  select case
    when value = '' then null
    when length(value) = 8 then '569' || value
    when length(value) = 9 and value like '9%' then '56' || value
    when length(value) = 10 and value like '09%' then '56' || substr(value, 2)
    when length(value) = 11 and value like '56%' then value
    else null
  end
  from normalized_prefix;
$$;

create or replace function public.recovery_v2_compat_normalize_email(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(lower(btrim(coalesce(p_raw, ''))), '') is null then null
    when lower(btrim(p_raw)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(btrim(p_raw))
    else null
  end;
$$;

create or replace function public.recovery_v2_compat_safe_jsonb(p_raw text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if nullif(btrim(p_raw), '') is null then
    return null;
  end if;

  return p_raw::jsonb;
exception
  when others then
    return null;
end;
$$;

create or replace function public.recovery_v2_compat_parse_date(p_raw text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := btrim(coalesce(p_raw, ''));
  v_year integer;
  v_month integer;
  v_day integer;
  v_date date;
begin
  if v_value = '' then
    return null;
  end if;

  if v_value ~ '^\d{4}-\d{1,2}-\d{1,2}$' then
    v_year := split_part(v_value, '-', 1)::integer;
    v_month := split_part(v_value, '-', 2)::integer;
    v_day := split_part(v_value, '-', 3)::integer;
  elsif v_value ~ '^\d{1,2}[./-]\d{1,2}[./-]\d{4}$' then
    v_day := split_part(regexp_replace(v_value, '[./]', '-', 'g'), '-', 1)::integer;
    v_month := split_part(regexp_replace(v_value, '[./]', '-', 'g'), '-', 2)::integer;
    v_year := split_part(regexp_replace(v_value, '[./]', '-', 'g'), '-', 3)::integer;
  else
    return null;
  end if;

  if v_month < 1 or v_month > 12 or v_day < 1 or v_day > 31 then
    return null;
  end if;

  v_date := make_date(v_year, v_month, v_day);
  if extract(year from v_date)::integer = v_year
    and extract(month from v_date)::integer = v_month
    and extract(day from v_date)::integer = v_day then
    return v_date;
  end if;

  return null;
exception
  when others then
    return null;
end;
$$;

create or replace function public.recovery_v2_compat_parse_hour(p_raw text)
returns time without time zone
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := btrim(coalesce(p_raw, ''));
  v_hour integer;
  v_minute integer := 0;
  v_second integer := 0;
begin
  if v_value = '' or v_value !~ '^\d{1,2}(:\d{1,2}){0,2}$' then
    return null;
  end if;

  v_hour := split_part(v_value, ':', 1)::integer;
  if split_part(v_value, ':', 2) <> '' then
    v_minute := split_part(v_value, ':', 2)::integer;
  end if;
  if split_part(v_value, ':', 3) <> '' then
    v_second := split_part(v_value, ':', 3)::integer;
  end if;

  if v_hour < 0 or v_hour > 23 or v_minute < 0 or v_minute > 59 or v_second < 0 or v_second > 59 then
    return null;
  end if;

  return make_time(v_hour, v_minute, v_second);
exception
  when others then
    return null;
end;
$$;

create or replace function public.recovery_v2_compat_santiago_wall_time(
  p_date date,
  p_hour text
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case
    when p_date is null or public.recovery_v2_compat_parse_hour(p_hour) is null then null
    else (p_date + public.recovery_v2_compat_parse_hour(p_hour)) at time zone 'America/Santiago'
  end;
$$;

create or replace function public.recovery_v2_compat_quoted_amount(p_bform jsonb)
returns numeric(12,2)
language sql
immutable
set search_path = ''
as $$
  with raw_price as (
    select nullif(btrim(p_bform->>'price'), '') as value
  )
  select case
    when value is null then null
    when value ~ '^\d+(\.\d{1,2})?$'
      and value::numeric >= 0
      and value::numeric <= 9999999999.99
    then value::numeric(12,2)
    else null
  end
  from raw_price;
$$;

create or replace view public.v_recovery_incomplete_bookings_current_compat as
with prepared as (
  select
    cart.*,
    public.recovery_v2_compat_safe_jsonb(cart.bform) as bform_json
  from public.recovery_incomplete_bookings_v2 as cart
),
derived as (
  select
    prepared.*,
    public.recovery_v2_compat_parse_date(bform_json->>'arrival_date') as parsed_arrival_date,
    public.recovery_v2_compat_parse_date(bform_json->>'departure_date') as parsed_departure_date
  from prepared
)
select
  id,
  null::uuid as batch_id,
  source_row_id::text as source_id,
  booking_id,
  public.recovery_v2_compat_normalize_email(email) as email_normalized,
  public.recovery_v2_compat_normalize_phone(phone) as phone_normalized,
  case
    when lower(btrim(type)) = 'payment_not_completed' then 'canceled'
    else lower(btrim(type))
  end as type,
  lower(btrim(type)) as source_type,
  nullif(upper(btrim(parking_code)), '') as parking_code,
  form_datetime at time zone 'America/Santiago' as form_datetime,
  parsed_arrival_date as intended_arrival_date,
  case
    when nullif(btrim(bform_json->>'days'), '') ~ '^-?\d+$' then (bform_json->>'days')::integer
    else null
  end as intended_days,
  public.recovery_v2_compat_santiago_wall_time(parsed_departure_date, bform_json->>'departure_hour') as intended_departure_at,
  parsed_departure_date as intended_departure_date,
  public.recovery_v2_compat_santiago_wall_time(parsed_arrival_date, bform_json->>'arrival_hour') as intended_arrival_at,
  message_sent,
  nullif(btrim(message_id), '') as message_id,
  source_created_at at time zone 'America/Santiago' as created_at_source,
  source_updated_at at time zone 'America/Santiago' as updated_at_source,
  source_row_hash as row_hash,
  nullif(btrim(cms_url), '') as cms_url,
  public.recovery_v2_compat_quoted_amount(bform_json) as quoted_amount,
  inserted_at as created_at,
  source_row_id,
  source_updated_at,
  source_table as source_table_raw,
  source_id as source_id_raw
from derived;

create or replace view public.v_recovery_whatsapp_message_memory_current_compat as
select
  id,
  null::uuid as batch_id,
  conversation_id,
  public.recovery_v2_compat_normalize_phone(api_phone) as api_phone_normalized,
  public.recovery_v2_compat_normalize_phone(wa_id) as wa_id_normalized,
  message_at at time zone 'America/Santiago' as message_at,
  message_bound_type,
  processing_time as processing_time_seconds,
  message_type,
  time_of_day,
  day_of_week,
  message_sentiment,
  chat_state,
  intent_category,
  source_row_hash as row_hash,
  inserted_at as created_at,
  source_id as source_id_raw
from public.recovery_whatsapp_messages_v2;

create or replace view public.v_recovery_whatsapp_message_memory_raw_current_compat as
select
  id,
  null::uuid as batch_id,
  conversation_id,
  public.recovery_v2_compat_normalize_phone(api_phone) as api_phone_normalized,
  public.recovery_v2_compat_normalize_phone(wa_id) as wa_id_normalized,
  message_at at time zone 'America/Santiago' as message_at,
  message_bound_type,
  message_type,
  intent_category,
  message_sentiment,
  chat_state,
  message_text,
  text_summary,
  source_row_hash as row_hash,
  inserted_at as created_at,
  source_id as source_id_raw
from public.recovery_whatsapp_messages_v2;

create or replace view public.v_recovery_whatsapp_tracking_current_compat as
select
  id,
  null::uuid as batch_id,
  source_id::text as source_id,
  message_id,
  public.recovery_v2_compat_normalize_phone(business_phone) as business_phone_normalized,
  public.recovery_v2_compat_normalize_phone(customer_phone) as client_phone_normalized,
  conversation_id,
  conversation_type,
  message_category,
  coalesce(billing_type, pricing_model) as charge_type,
  billing_type,
  pricing_model,
  billable,
  sent_at at time zone 'America/Santiago' as sent_at,
  delivered_at at time zone 'America/Santiago' as delivered_at,
  read_at at time zone 'America/Santiago' as read_at,
  failed_at at time zone 'America/Santiago' as failed_at,
  case
    when read_at is not null then 'read'
    when delivered_at is not null then 'delivered'
    when sent_at is not null then 'sent'
    when failed_at is not null then 'failed'
    else 'unknown'
  end as tracking_status,
  source_row_hash as row_hash,
  inserted_at as created_at,
  source_created_at at time zone 'America/Santiago' as created_at_source,
  source_updated_at at time zone 'America/Santiago' as updated_at_source,
  source_id as source_id_raw
from public.recovery_whatsapp_tracking_v2;

create or replace view public.v_recovery_attribution_cases_v2_compat as
with candidate_matches as (
  select
    cart.id as cart_id,
    cart.source_id as cart_source_id,
    cart.type as cart_type,
    cart.source_type as cart_source_type,
    cart.form_datetime as cart_form_datetime,
    cart.intended_arrival_at as cart_intended_arrival_at,
    cart.email_normalized as cart_email_normalized,
    cart.phone_normalized as cart_phone_normalized,
    booking.id as purchase_id,
    booking.batch_id as purchase_batch_id,
    booking.booking_created_at as purchase_created_at,
    coalesce(booking.price, 0) as purchase_amount,
    round((extract(epoch from (booking.booking_created_at - cart.form_datetime)) / 3600.0)::numeric, 2) as hours_to_purchase,
    booking.email_normalized as booking_email_normalized,
    booking.phone_normalized as booking_phone_normalized,
    case
      when cart.email_normalized is not null
        and cart.phone_normalized is not null
        and booking.email_normalized = cart.email_normalized
        and booking.phone_normalized = cart.phone_normalized
      then 'email_phone'
      when cart.email_normalized is not null
        and booking.email_normalized = cart.email_normalized
      then 'email'
      when cart.phone_normalized is not null
        and booking.phone_normalized = cart.phone_normalized
      then 'phone'
    end as match_basis
  from public.v_recovery_incomplete_bookings_current_compat as cart
  join public.recovery_bookings_import as booking
    on booking.is_valid_purchase = true
    and booking.booking_created_at is not null
    and cart.form_datetime is not null
    and booking.booking_created_at >= cart.form_datetime
    and booking.booking_created_at <= coalesce(cart.intended_arrival_at, cart.form_datetime + interval '7 days')
    and (
      (cart.email_normalized is not null and booking.email_normalized = cart.email_normalized)
      or (cart.phone_normalized is not null and booking.phone_normalized = cart.phone_normalized)
    )
),
ranked as (
  select
    *,
    row_number() over (
      partition by purchase_id
      order by
        case match_basis when 'email_phone' then 1 when 'email' then 2 when 'phone' then 3 else 4 end,
        case cart_type when 'canceled' then 1 when 'abandoned' then 2 else 3 end,
        cart_form_datetime desc,
        cart_id
    ) as booking_rank,
    row_number() over (
      partition by cart_id
      order by
        purchase_created_at asc,
        case match_basis when 'email_phone' then 1 when 'email' then 2 when 'phone' then 3 else 4 end,
        purchase_id
    ) as cart_rank
  from candidate_matches
  where match_basis is not null
)
select
  cart_id,
  cart_source_id,
  cart_type,
  cart_source_type,
  cart_form_datetime,
  cart_intended_arrival_at,
  purchase_id,
  purchase_batch_id,
  purchase_created_at,
  purchase_amount,
  hours_to_purchase,
  match_basis,
  case match_basis
    when 'email_phone' then 'high'
    when 'email' then 'medium'
    when 'phone' then 'medium'
    else 'low'
  end as confidence,
  match_basis as match_type,
  hours_to_purchase <= 24 as recovered_24h,
  hours_to_purchase <= 48 as recovered_48h,
  true as recovered_7d,
  case match_basis
    when 'email_phone' then 'email_and_phone_match'
    when 'email' then 'email_match'
    when 'phone' then 'phone_match'
  end as attribution_reason,
  purchase_created_at as created_at
from ranked
where booking_rank = 1
  and cart_rank = 1;

create or replace function public.recovery_list_conversation_sessions_v2_compat(
  p_page integer default 1,
  p_page_size integer default 50,
  p_mcp_api_phone text default null,
  p_eap_api_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_app_admin(), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if nullif(trim(p_mcp_api_phone), '') is null
    or nullif(trim(p_eap_api_phone), '') is null
    or trim(p_mcp_api_phone) = trim(p_eap_api_phone) then
    raise exception 'Invalid WhatsApp business phone mapping' using errcode = '22023';
  end if;

  return (
  with normalized as (
    select
      m.id,
      m.conversation_id,
      m.wa_id_normalized,
      m.api_phone_normalized,
      m.message_at,
      m.intent_category,
      m.chat_state,
      case
        when m.api_phone_normalized = trim(p_mcp_api_phone) then 'MCP'
        when m.api_phone_normalized = trim(p_eap_api_phone) then 'EAP'
      end as resolved_brand,
      timezone('America/Santiago', m.message_at)::date as santiago_day
    from public.v_recovery_whatsapp_message_memory_current_compat as m
    where m.wa_id_normalized is not null
      and m.api_phone_normalized in (trim(p_mcp_api_phone), trim(p_eap_api_phone))
  ),
  with_previous as (
    select
      n.*,
      lag(n.message_at) over message_order as previous_message_at,
      lag(n.santiago_day) over message_order as previous_santiago_day
    from normalized as n
    window message_order as (
      partition by n.wa_id_normalized, n.resolved_brand
      order by n.message_at, n.id
    )
  ),
  with_boundaries as (
    select
      p.*,
      case
        when p.previous_message_at is null
          or p.message_at - p.previous_message_at > interval '15 minutes'
          or p.santiago_day is distinct from p.previous_santiago_day
        then 1 else 0
      end as starts_session
    from with_previous as p
  ),
  sessionized as (
    select
      b.*,
      sum(b.starts_session) over (
        partition by b.wa_id_normalized, b.resolved_brand
        order by b.message_at, b.id
        rows between unbounded preceding and current row
      ) as session_number
    from with_boundaries as b
  ),
  sessions as (
    select
      s.wa_id_normalized,
      min(s.api_phone_normalized) as api_phone_normalized,
      s.resolved_brand as brand,
      s.session_number,
      min(s.message_at) as first_message_at,
      max(s.message_at) as last_message_at,
      extract(epoch from (max(s.message_at) - min(s.message_at)))::bigint as duration_seconds,
      count(*)::bigint as message_count,
      count(distinct s.conversation_id)::bigint as technical_conversation_count,
      coalesce(
        array_agg(distinct s.intent_category order by s.intent_category)
          filter (where s.intent_category is not null),
        array[]::text[]
      ) as intent_categories,
      (array_agg(s.chat_state order by s.message_at desc, s.id desc)
        filter (where s.chat_state is not null))[1] as chat_state
    from sessionized as s
    group by s.wa_id_normalized, s.resolved_brand, s.session_number
  ),
  intent_counts as (
    select
      s.wa_id_normalized,
      s.resolved_brand as brand,
      s.session_number,
      s.intent_category,
      count(*) as intent_count,
      row_number() over (
        partition by s.wa_id_normalized, s.resolved_brand, s.session_number
        order by
          case when s.intent_category = 'api_ia' then 1 else 0 end,
          count(*) desc,
          s.intent_category
      ) as intent_rank
    from sessionized as s
    where s.intent_category is not null
    group by s.wa_id_normalized, s.resolved_brand, s.session_number, s.intent_category
  ),
  enriched as (
    select
      'recovery_session_' || pg_catalog.md5(
        sessions.wa_id_normalized || '|' || sessions.brand || '|' ||
        to_char(timezone('UTC', sessions.first_message_at), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      ) as session_id,
      sessions.*,
      primary_intent.intent_category as primary_intent,
      exists (
        select 1
        from public.v_recovery_incomplete_bookings_current_compat as cart
        where cart.phone_normalized = sessions.wa_id_normalized
          and cart.form_datetime <= sessions.last_message_at
          and coalesce(cart.intended_arrival_at, cart.form_datetime + interval '7 days') > sessions.first_message_at
      ) as potential_cart_relation,
      coalesce(purchases.has_before, false) as has_valid_purchase_before,
      purchases.nearest_after_at is not null as has_valid_purchase_after,
      purchases.nearest_after_at as nearest_purchase_after_at,
      case
        when purchases.nearest_after_at is null then null
        else round(
          (extract(epoch from (purchases.nearest_after_at - sessions.first_message_at)) / 60.0)::numeric,
          2
        )
      end as nearest_purchase_after_minutes
    from sessions
    left join intent_counts as primary_intent
      on primary_intent.wa_id_normalized = sessions.wa_id_normalized
      and primary_intent.brand = sessions.brand
      and primary_intent.session_number = sessions.session_number
      and primary_intent.intent_rank = 1
    left join lateral (
      select
        bool_or(booking.booking_created_at < sessions.first_message_at) as has_before,
        min(booking.booking_created_at)
          filter (where booking.booking_created_at > sessions.first_message_at) as nearest_after_at
      from public.recovery_bookings_import as booking
      where booking.phone_normalized = sessions.wa_id_normalized
        and booking.is_valid_purchase = true
        and booking.booking_created_at is not null
    ) as purchases on true
  ),
  paged as (
    select enriched.*
    from enriched
    order by enriched.first_message_at desc, enriched.session_id desc
    limit greatest(1, least(coalesce(p_page_size, 50), 100))
    offset (greatest(coalesce(p_page, 1), 1) - 1)
      * greatest(1, least(coalesce(p_page_size, 50), 100))
  )
  select pg_catalog.jsonb_build_object(
    'items',
    coalesce(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(paged) order by paged.first_message_at desc, paged.session_id desc),
      '[]'::jsonb
    ),
    'total',
    (select count(*)::bigint from enriched)
  )
  from paged
  );
end;
$$;

create or replace function public.recovery_v2_compat_shadow_summary(
  p_window_start timestamptz default null,
  p_window_end timestamptz default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with legacy_carts as (
    select *
    from public.recovery_incomplete_bookings_import
    where (p_window_start is null or form_datetime >= p_window_start)
      and (p_window_end is null or form_datetime < p_window_end)
  ),
  compat_carts as (
    select *
    from public.v_recovery_incomplete_bookings_current_compat
    where (p_window_start is null or form_datetime >= p_window_start)
      and (p_window_end is null or form_datetime < p_window_end)
  ),
  legacy_attr as (
    select *
    from public.v_recovery_attribution_cases
    where (p_window_start is null or cart_form_datetime >= p_window_start)
      and (p_window_end is null or cart_form_datetime < p_window_end)
  ),
  compat_attr as (
    select *
    from public.v_recovery_attribution_cases_v2_compat
    where (p_window_start is null or cart_form_datetime >= p_window_start)
      and (p_window_end is null or cart_form_datetime < p_window_end)
  ),
  legacy_summary as (
    select jsonb_build_object(
      'total', count(*),
      'abandoned', count(*) filter (where type = 'abandoned'),
      'visibleCanceled', count(*) filter (where type = 'canceled'),
      'messageSent', count(*) filter (where message_sent is true),
      'parking', coalesce(jsonb_object_agg(parking_code, parking_count) filter (where parking_code is not null), '{}'::jsonb),
      'quotedAmountCount', count(quoted_amount),
      'quotedAmountSum', coalesce(sum(quoted_amount), 0),
      'intendedArrivalAtCount', count(intended_arrival_at),
      'chatWindowCandidateRows', count(*) filter (where phone_normalized is not null and parking_code is not null)
    ) as value
    from (
      select legacy_carts.*, count(*) over (partition by parking_code) as parking_count
      from legacy_carts
    ) as legacy_carts
  ),
  compat_summary as (
    select jsonb_build_object(
      'total', count(*),
      'abandoned', count(*) filter (where type = 'abandoned'),
      'visibleCanceled', count(*) filter (where type = 'canceled'),
      'paymentNotCompletedAsSourceType', count(*) filter (where source_type = 'payment_not_completed'),
      'messageSent', count(*) filter (where message_sent is true),
      'parking', coalesce(jsonb_object_agg(parking_code, parking_count) filter (where parking_code is not null), '{}'::jsonb),
      'quotedAmountCount', count(quoted_amount),
      'quotedAmountSum', coalesce(sum(quoted_amount), 0),
      'intendedArrivalAtCount', count(intended_arrival_at),
      'chatWindowCandidateRows', count(*) filter (where phone_normalized is not null and parking_code is not null)
    ) as value
    from (
      select compat_carts.*, count(*) over (partition by parking_code) as parking_count
      from compat_carts
    ) as compat_carts
  ),
  legacy_tracking as (
    select jsonb_build_object(
      'delivered', count(*) filter (where tracking_status = 'delivered'),
      'read', count(*) filter (where tracking_status = 'read'),
      'sent', count(*) filter (where tracking_status = 'sent'),
      'failed', count(*) filter (where tracking_status = 'failed'),
      'unknown', count(*) filter (where tracking_status = 'unknown')
    ) as value
    from public.recovery_whatsapp_tracking_import
  ),
  compat_tracking as (
    select jsonb_build_object(
      'delivered', count(*) filter (where tracking_status = 'delivered'),
      'read', count(*) filter (where tracking_status = 'read'),
      'sent', count(*) filter (where tracking_status = 'sent'),
      'failed', count(*) filter (where tracking_status = 'failed'),
      'unknown', count(*) filter (where tracking_status = 'unknown')
    ) as value
    from public.v_recovery_whatsapp_tracking_current_compat
  ),
  attribution_summary as (
    select jsonb_build_object(
      'legacyRecovered', (select count(*) from legacy_attr),
      'legacyRecoveredAmount', (select coalesce(sum(purchase_amount), 0) from legacy_attr),
      'compatRecovered', (select count(*) from compat_attr),
      'compatRecoveredAmount', (select coalesce(sum(purchase_amount), 0) from compat_attr)
    ) as value
  )
  select jsonb_build_object(
    'windowStart', p_window_start,
    'windowEnd', p_window_end,
    'legacy', (select value from legacy_summary),
    'v2Compat', (select value from compat_summary),
    'legacyWhatsappStatus', (select value from legacy_tracking),
    'v2CompatWhatsappStatus', (select value from compat_tracking),
    'attribution', (select value from attribution_summary),
    'conversationSessionsRpc', 'recovery_list_conversation_sessions_v2_compat',
    'classification', 'shadow_read_only'
  );
$$;

revoke all on function public.recovery_v2_compat_normalize_phone(text) from public;
revoke all on function public.recovery_v2_compat_normalize_email(text) from public;
revoke all on function public.recovery_v2_compat_safe_jsonb(text) from public;
revoke all on function public.recovery_v2_compat_parse_date(text) from public;
revoke all on function public.recovery_v2_compat_parse_hour(text) from public;
revoke all on function public.recovery_v2_compat_santiago_wall_time(date, text) from public;
revoke all on function public.recovery_v2_compat_quoted_amount(jsonb) from public;
revoke all on function public.recovery_list_conversation_sessions_v2_compat(integer, integer, text, text) from public;
revoke all on function public.recovery_v2_compat_shadow_summary(timestamptz, timestamptz) from public;

grant execute on function public.recovery_v2_compat_normalize_phone(text) to authenticated, service_role;
grant execute on function public.recovery_v2_compat_normalize_email(text) to authenticated, service_role;
grant execute on function public.recovery_v2_compat_safe_jsonb(text) to authenticated, service_role;
grant execute on function public.recovery_v2_compat_parse_date(text) to authenticated, service_role;
grant execute on function public.recovery_v2_compat_parse_hour(text) to authenticated, service_role;
grant execute on function public.recovery_v2_compat_santiago_wall_time(date, text) to authenticated, service_role;
grant execute on function public.recovery_v2_compat_quoted_amount(jsonb) to authenticated, service_role;

revoke all on public.v_recovery_incomplete_bookings_current_compat from public, anon;
revoke all on public.v_recovery_whatsapp_message_memory_current_compat from public, anon;
revoke all on public.v_recovery_whatsapp_message_memory_raw_current_compat from public, anon;
revoke all on public.v_recovery_whatsapp_tracking_current_compat from public, anon;
revoke all on public.v_recovery_attribution_cases_v2_compat from public, anon;

grant select on public.v_recovery_incomplete_bookings_current_compat to authenticated, service_role;
grant select on public.v_recovery_whatsapp_message_memory_current_compat to authenticated, service_role;
grant select on public.v_recovery_whatsapp_message_memory_raw_current_compat to authenticated, service_role;
grant select on public.v_recovery_whatsapp_tracking_current_compat to authenticated, service_role;
grant select on public.v_recovery_attribution_cases_v2_compat to authenticated, service_role;

grant execute on function public.recovery_list_conversation_sessions_v2_compat(integer, integer, text, text) to authenticated, service_role;
grant execute on function public.recovery_v2_compat_shadow_summary(timestamptz, timestamptz) to authenticated, service_role;

comment on view public.v_recovery_incomplete_bookings_current_compat is
  'Read-only Recovery V2 compatibility view for legacy recovery_incomplete_bookings_import consumers. Maps payment_not_completed to visible canceled while preserving source_type.';
comment on view public.v_recovery_whatsapp_message_memory_current_compat is
  'Read-only Recovery V2 compatibility view for legacy recovery_whatsapp_message_memory_import consumers.';
comment on view public.v_recovery_whatsapp_message_memory_raw_current_compat is
  'Read-only Recovery V2 compatibility view for legacy recovery_whatsapp_message_memory_raw_import consumers, including message text.';
comment on view public.v_recovery_whatsapp_tracking_current_compat is
  'Read-only Recovery V2 compatibility view for legacy recovery_whatsapp_tracking_import consumers.';
comment on view public.v_recovery_attribution_cases_v2_compat is
  'Read-only Recovery V2 attribution compatibility view using V2 cart compat rows and legacy purchase rows.';
comment on function public.recovery_v2_compat_shadow_summary(timestamptz, timestamptz) is
  'Read-only shadow comparator for legacy /recuperacion contracts versus Recovery V2 compatibility views.';

commit;
