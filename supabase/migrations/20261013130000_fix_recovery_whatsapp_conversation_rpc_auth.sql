-- Fix service-role authorization for the scoped /recuperacion WhatsApp readers.
-- PostgREST does not always expose request.jwt.claim.role as a standalone GUC;
-- the role is reliably available in request.jwt.claims.role.

begin;

create or replace function public.recovery_whatsapp_conversation_messages_v2(
  p_wa_id_normalized text,
  p_api_phone_normalized text,
  p_before timestamp with time zone default null,
  p_before_source_id bigint default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  conversation_id text,
  api_phone_normalized text,
  wa_id_normalized text,
  message_at timestamp with time zone,
  message_bound_type text,
  message_type text,
  intent_category text,
  message_sentiment text,
  chat_state text,
  message_text text,
  source_id_raw bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized as (
    select
      coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
        auth.role()::text,
        current_user
      ) = 'service_role'
      or exists (
        select 1
        from public.user_profiles as profile
        where profile.user_id = auth.uid()
          and profile.app_role = 'admin'::public.app_role
          and profile.status = 'active'
      ) as ok
  ),
  normalized_input as (
    select
      public.recovery_v2_compat_normalize_phone(p_wa_id_normalized) as wa_id_normalized,
      public.recovery_v2_compat_normalize_phone(p_api_phone_normalized) as api_phone_normalized,
      least(greatest(coalesce(p_limit, 100), 1), 101) as safe_limit
  )
  select
    msg.id,
    msg.conversation_id,
    public.recovery_v2_compat_normalize_phone(msg.api_phone) as api_phone_normalized,
    public.recovery_v2_compat_normalize_phone(msg.wa_id) as wa_id_normalized,
    msg.message_at at time zone 'America/Santiago' as message_at,
    nullif(lower(btrim(msg.message_bound_type)), '') as message_bound_type,
    nullif(lower(btrim(msg.message_type)), '') as message_type,
    nullif(lower(btrim(msg.intent_category)), '') as intent_category,
    nullif(lower(btrim(msg.message_sentiment)), '') as message_sentiment,
    nullif(lower(btrim(msg.chat_state)), '') as chat_state,
    btrim(msg.message_text) as message_text,
    msg.source_id as source_id_raw
  from public.recovery_whatsapp_messages_v2 as msg
  cross join authorized
  cross join normalized_input as input
  where authorized.ok
    and input.wa_id_normalized is not null
    and input.api_phone_normalized is not null
    and public.recovery_v2_compat_normalize_phone(msg.wa_id) = input.wa_id_normalized
    and public.recovery_v2_compat_normalize_phone(msg.api_phone) = input.api_phone_normalized
    and msg.message_at is not null
    and (
      p_before is null
      or msg.message_at at time zone 'America/Santiago' < p_before
      or (
        p_before_source_id is not null
        and msg.message_at at time zone 'America/Santiago' = p_before
        and msg.source_id < p_before_source_id
      )
    )
  order by
    msg.message_at at time zone 'America/Santiago' desc,
    msg.source_id desc
  limit (select safe_limit from normalized_input);
$$;

revoke all on function public.recovery_whatsapp_conversation_messages_v2(text, text, timestamp with time zone, bigint, integer)
from public, anon;
grant execute on function public.recovery_whatsapp_conversation_messages_v2(text, text, timestamp with time zone, bigint, integer)
to authenticated, service_role;

create or replace function public.recovery_whatsapp_conversation_window_v2(
  p_wa_id_normalized text,
  p_api_phone_normalized text,
  p_cart_id uuid default null,
  p_legacy_cart_id uuid default null
)
returns table (
  last_inbound_at timestamp with time zone,
  source text,
  error_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized as (
    select
      coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
        auth.role()::text,
        current_user
      ) = 'service_role'
      or exists (
        select 1
        from public.user_profiles as profile
        where profile.user_id = auth.uid()
          and profile.app_role = 'admin'::public.app_role
          and profile.status = 'active'
      ) as ok
  ),
  normalized_input as (
    select
      public.recovery_v2_compat_normalize_phone(p_wa_id_normalized) as wa_id_normalized,
      public.recovery_v2_compat_normalize_phone(p_api_phone_normalized) as api_phone_normalized
  ),
  candidates as (
    select
      msg.message_at at time zone 'America/Santiago' as candidate_at,
      'message_memory'::text as candidate_source
    from public.recovery_whatsapp_messages_v2 as msg
    cross join authorized
    cross join normalized_input as input
    where authorized.ok
      and input.wa_id_normalized is not null
      and input.api_phone_normalized is not null
      and public.recovery_v2_compat_normalize_phone(msg.wa_id) = input.wa_id_normalized
      and public.recovery_v2_compat_normalize_phone(msg.api_phone) = input.api_phone_normalized
      and nullif(lower(btrim(msg.message_bound_type)), '') = 'inbound'
      and msg.message_at is not null

    union all

    select
      live.message_at as candidate_at,
      'live'::text as candidate_source
    from public.recovery_whatsapp_live_messages as live
    cross join authorized
    where live.direction = 'inbound'
      and authorized.ok
      and live.message_at is not null
      and (
        (p_cart_id is not null and live.cart_v2_id = p_cart_id)
        or (p_legacy_cart_id is not null and live.cart_id = p_legacy_cart_id)
      )
  ),
  latest as (
    select candidates.candidate_at, candidates.candidate_source
    from candidates
    order by candidates.candidate_at desc
    limit 1
  )
  select
    latest.candidate_at,
    latest.candidate_source,
    null::text
  from latest

  union all

  select
    null::timestamp with time zone,
    null::text,
    case
      when input.wa_id_normalized is null or input.api_phone_normalized is null then 'invalid_conversation'
      when authorized.ok is not true then 'unauthorized'
      else null
    end
  from normalized_input as input
  cross join authorized
  where not exists (select 1 from latest)
  limit 1;
$$;

revoke all on function public.recovery_whatsapp_conversation_window_v2(text, text, uuid, uuid)
from public, anon;
grant execute on function public.recovery_whatsapp_conversation_window_v2(text, text, uuid, uuid)
to authenticated, service_role;

create or replace function public.recovery_whatsapp_conversation_indicators_v2(p_pairs jsonb)
returns table (
  wa_id_normalized text,
  api_phone_normalized text,
  chat_message_count integer,
  latest_inbound_at timestamp with time zone,
  latest_inbound_chat_state text,
  latest_inbound_intent_category text,
  latest_inbound_sentiment text
)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized as (
    select
      coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
        auth.role()::text,
        current_user
      ) = 'service_role'
      or exists (
        select 1
        from public.user_profiles as profile
        where profile.user_id = auth.uid()
          and profile.app_role = 'admin'::public.app_role
          and profile.status = 'active'
      ) as ok
  ),
  input_pairs as (
    select distinct
      public.recovery_v2_compat_normalize_phone(pair.wa_id_normalized) as wa_id_normalized,
      public.recovery_v2_compat_normalize_phone(pair.api_phone_normalized) as api_phone_normalized
    from jsonb_to_recordset(coalesce(p_pairs, '[]'::jsonb)) as pair (
      wa_id_normalized text,
      api_phone_normalized text
    )
    limit 100
  ),
  valid_pairs as (
    select input_pairs.*
    from input_pairs
    cross join authorized
    where wa_id_normalized is not null
      and api_phone_normalized is not null
      and authorized.ok
  )
  select
    pair.wa_id_normalized,
    pair.api_phone_normalized,
    coalesce(counts.chat_message_count, 0)::integer as chat_message_count,
    latest.message_at as latest_inbound_at,
    latest.chat_state as latest_inbound_chat_state,
    latest.intent_category as latest_inbound_intent_category,
    latest.message_sentiment as latest_inbound_sentiment
  from valid_pairs as pair
  left join lateral (
    select count(*)::integer as chat_message_count
    from public.recovery_whatsapp_messages_v2 as msg
    where public.recovery_v2_compat_normalize_phone(msg.wa_id) = pair.wa_id_normalized
      and public.recovery_v2_compat_normalize_phone(msg.api_phone) = pair.api_phone_normalized
      and msg.message_at is not null
  ) as counts on true
  left join lateral (
    select
      msg.message_at at time zone 'America/Santiago' as message_at,
      nullif(lower(btrim(msg.chat_state)), '') as chat_state,
      nullif(lower(btrim(msg.intent_category)), '') as intent_category,
      nullif(lower(btrim(msg.message_sentiment)), '') as message_sentiment
    from public.recovery_whatsapp_messages_v2 as msg
    where public.recovery_v2_compat_normalize_phone(msg.wa_id) = pair.wa_id_normalized
      and public.recovery_v2_compat_normalize_phone(msg.api_phone) = pair.api_phone_normalized
      and nullif(lower(btrim(msg.message_bound_type)), '') = 'inbound'
      and msg.message_at is not null
    order by msg.message_at at time zone 'America/Santiago' desc, msg.source_id desc
    limit 1
  ) as latest on true;
$$;

revoke all on function public.recovery_whatsapp_conversation_indicators_v2(jsonb)
from public, anon;
grant execute on function public.recovery_whatsapp_conversation_indicators_v2(jsonb)
to authenticated, service_role;

commit;
