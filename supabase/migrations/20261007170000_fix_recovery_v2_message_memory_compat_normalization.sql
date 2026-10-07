-- Normalize Recovery V2 Message Memory compat views to match the legacy
-- /recuperacion read contract. Raw V2 data remains untouched.

begin;

create or replace view public.v_recovery_whatsapp_message_memory_current_compat as
select
  id,
  null::uuid as batch_id,
  conversation_id,
  public.recovery_v2_compat_normalize_phone(api_phone) as api_phone_normalized,
  public.recovery_v2_compat_normalize_phone(wa_id) as wa_id_normalized,
  message_at at time zone 'America/Santiago' as message_at,
  nullif(lower(btrim(message_bound_type)), '') as message_bound_type,
  processing_time as processing_time_seconds,
  nullif(lower(btrim(message_type)), '') as message_type,
  regexp_replace(
    nullif(lower(btrim(time_of_day)), ''),
    '^0([0-9]:[0-9]{2})$',
    '\1'
  ) as time_of_day,
  nullif(lower(btrim(day_of_week)), '') as day_of_week,
  nullif(lower(btrim(message_sentiment)), '') as message_sentiment,
  nullif(lower(btrim(chat_state)), '') as chat_state,
  nullif(lower(btrim(intent_category)), '') as intent_category,
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
  nullif(lower(btrim(message_bound_type)), '') as message_bound_type,
  nullif(lower(btrim(message_type)), '') as message_type,
  nullif(lower(btrim(intent_category)), '') as intent_category,
  nullif(lower(btrim(message_sentiment)), '') as message_sentiment,
  nullif(lower(btrim(chat_state)), '') as chat_state,
  btrim(message_text) as message_text,
  text_summary,
  source_row_hash as row_hash,
  inserted_at as created_at,
  source_id as source_id_raw
from public.recovery_whatsapp_messages_v2;

commit;
