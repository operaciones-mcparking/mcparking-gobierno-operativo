begin;

do $$
begin
  if to_regclass('public.recovery_whatsapp_message_memory_import') is null then
    raise exception 'Missing table public.recovery_whatsapp_message_memory_import';
  end if;
  if to_regclass('public.recovery_incomplete_bookings_import') is null then
    raise exception 'Missing table public.recovery_incomplete_bookings_import';
  end if;
  if to_regclass('public.recovery_bookings_import') is null then
    raise exception 'Missing table public.recovery_bookings_import';
  end if;
end;
$$;

create or replace function public.recovery_list_conversation_sessions(
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
    from public.recovery_whatsapp_message_memory_import as m
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
        from public.recovery_incomplete_bookings_import as cart
        where cart.phone_normalized = sessions.wa_id_normalized
          and cart.form_datetime <= sessions.last_message_at
          and cart.form_datetime + interval '7 days' > sessions.first_message_at
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

revoke all on function public.recovery_list_conversation_sessions(integer, integer, text, text) from public;
revoke execute on function public.recovery_list_conversation_sessions(integer, integer, text, text) from anon;
grant execute on function public.recovery_list_conversation_sessions(integer, integer, text, text) to authenticated;
grant execute on function public.recovery_list_conversation_sessions(integer, integer, text, text) to service_role;

comment on function public.recovery_list_conversation_sessions(integer, integer, text, text) is
  'Admin-only paginated read contract for derived 15-minute WhatsApp interaction sessions. Returns metadata only and never reads raw message text.';

commit;
