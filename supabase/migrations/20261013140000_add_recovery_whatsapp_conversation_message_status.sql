-- Expose canonical WhatsApp delivery/read status in the fast conversation reader.
-- The UI only displays this status for outbound messages and does not infer
-- delivery from chat_state or message_type.

begin;

drop function if exists public.recovery_whatsapp_conversation_messages_v2(
  text,
  text,
  timestamp with time zone,
  bigint,
  integer
);

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
  source_id_raw bigint,
  whatsapp_status text
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
    msg.source_id as source_id_raw,
    case
      when nullif(lower(btrim(msg.message_bound_type)), '') <> 'outbound' then null::text
      when tracking.read_at is not null then 'read'
      when tracking.delivered_at is not null then 'delivered'
      when tracking.sent_at is not null then 'sent'
      when tracking.failed_at is not null then 'failed'
      else null::text
    end as whatsapp_status
  from public.recovery_whatsapp_messages_v2 as msg
  cross join authorized
  cross join normalized_input as input
  left join public.recovery_whatsapp_tracking_v2 as tracking
    on tracking.message_id = msg.conversation_id
    and public.recovery_v2_compat_normalize_phone(tracking.business_phone) = public.recovery_v2_compat_normalize_phone(msg.api_phone)
    and public.recovery_v2_compat_normalize_phone(tracking.customer_phone) = public.recovery_v2_compat_normalize_phone(msg.wa_id)
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

comment on function public.recovery_whatsapp_conversation_messages_v2(text, text, timestamp with time zone, bigint, integer) is
  'Fast scoped reader for /recuperacion chat history. Reads one wa_id/api_phone conversation from Recovery V2 and exposes outbound delivery/read status from tracking when available.';

commit;
