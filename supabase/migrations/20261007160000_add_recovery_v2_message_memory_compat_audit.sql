-- Read-only audit RPC for Recovery V2 message memory compatibility.
-- Compares legacy message memory contracts against V2 compat views server-side.
-- Does not expose message text, PII values, or mutate data.

begin;

create or replace function public.recovery_v2_compat_message_memory_audit(
  p_limit integer default null
)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with params as (
    select case
      when p_limit is null then null
      else greatest(1, least(p_limit, 1000000))
    end as row_limit
  ),
  metadata_legacy as (
    select
      legacy.*,
      row_number() over (
        order by legacy.message_at desc, legacy.id desc
      ) as audit_row_number
    from public.recovery_whatsapp_message_memory_import as legacy
  ),
  metadata_legacy_limited as (
    select metadata_legacy.*
    from metadata_legacy, params
    where params.row_limit is null
      or metadata_legacy.audit_row_number <= params.row_limit
  ),
  metadata_matches as (
    select
      legacy.id as legacy_id,
      compat.source_id_raw as v2_source_id,
      legacy.message_at as legacy_message_at,
      compat.message_at as v2_message_at,
      legacy.message_bound_type as legacy_message_bound_type,
      compat.message_bound_type as v2_message_bound_type,
      legacy.processing_time_seconds as legacy_processing_time_seconds,
      compat.processing_time_seconds as v2_processing_time_seconds,
      legacy.message_type as legacy_message_type,
      compat.message_type as v2_message_type,
      legacy.time_of_day as legacy_time_of_day,
      compat.time_of_day as v2_time_of_day,
      legacy.day_of_week as legacy_day_of_week,
      compat.day_of_week as v2_day_of_week,
      legacy.message_sentiment as legacy_message_sentiment,
      compat.message_sentiment as v2_message_sentiment,
      legacy.chat_state as legacy_chat_state,
      compat.chat_state as v2_chat_state,
      legacy.intent_category as legacy_intent_category,
      compat.intent_category as v2_intent_category,
      legacy.row_hash as legacy_row_hash,
      compat.row_hash as v2_row_hash
    from metadata_legacy_limited as legacy
    join public.v_recovery_whatsapp_message_memory_current_compat as compat
      on compat.conversation_id = legacy.conversation_id
      and compat.wa_id_normalized = legacy.wa_id_normalized
      and compat.message_at = legacy.message_at
      and compat.message_bound_type is not distinct from legacy.message_bound_type
      and compat.message_type is not distinct from legacy.message_type
      and compat.api_phone_normalized is not distinct from legacy.api_phone_normalized
  ),
  metadata_field_rows as (
    select *
    from metadata_matches
    cross join lateral (
      values
        (
          'message_at',
          legacy_message_at::text,
          v2_message_at::text,
          legacy_message_at is not distinct from v2_message_at,
          legacy_message_at is not distinct from v2_message_at,
          false,
          'MATCH'
        ),
        (
          'message_bound_type',
          legacy_message_bound_type,
          v2_message_bound_type,
          legacy_message_bound_type is not distinct from v2_message_bound_type,
          lower(nullif(btrim(legacy_message_bound_type), '')) is not distinct from lower(nullif(btrim(v2_message_bound_type), '')),
          false,
          case
            when legacy_message_bound_type is not distinct from v2_message_bound_type then 'MATCH'
            when lower(nullif(btrim(legacy_message_bound_type), '')) is not distinct from lower(nullif(btrim(v2_message_bound_type), '')) then 'ALIAS / NORMALIZACIÓN'
            else 'SEMÁNTICA DIFERENTE'
          end
        ),
        (
          'message_type',
          legacy_message_type,
          v2_message_type,
          legacy_message_type is not distinct from v2_message_type,
          lower(nullif(btrim(legacy_message_type), '')) is not distinct from lower(nullif(btrim(v2_message_type), '')),
          false,
          case
            when legacy_message_type is not distinct from v2_message_type then 'MATCH'
            when lower(nullif(btrim(legacy_message_type), '')) is not distinct from lower(nullif(btrim(v2_message_type), '')) then 'ALIAS / NORMALIZACIÓN'
            else 'SEMÁNTICA DIFERENTE'
          end
        ),
        (
          'time_of_day',
          legacy_time_of_day,
          v2_time_of_day,
          legacy_time_of_day is not distinct from v2_time_of_day,
          lower(nullif(btrim(legacy_time_of_day), '')) is not distinct from lower(nullif(btrim(v2_time_of_day), '')),
          false,
          case
            when legacy_time_of_day is not distinct from v2_time_of_day then 'MATCH'
            when lower(nullif(btrim(legacy_time_of_day), '')) is not distinct from lower(nullif(btrim(v2_time_of_day), '')) then 'ALIAS / NORMALIZACIÓN'
            else 'SEMÁNTICA DIFERENTE'
          end
        ),
        (
          'day_of_week',
          legacy_day_of_week,
          v2_day_of_week,
          legacy_day_of_week is not distinct from v2_day_of_week,
          lower(nullif(btrim(legacy_day_of_week), '')) is not distinct from lower(nullif(btrim(v2_day_of_week), '')),
          false,
          case
            when legacy_day_of_week is not distinct from v2_day_of_week then 'MATCH'
            when lower(nullif(btrim(legacy_day_of_week), '')) is not distinct from lower(nullif(btrim(v2_day_of_week), '')) then 'ALIAS / NORMALIZACIÓN'
            else 'SEMÁNTICA DIFERENTE'
          end
        ),
        (
          'processing_time_seconds',
          legacy_processing_time_seconds::text,
          v2_processing_time_seconds::text,
          legacy_processing_time_seconds is not distinct from v2_processing_time_seconds,
          legacy_processing_time_seconds is not distinct from v2_processing_time_seconds,
          false,
          case
            when legacy_processing_time_seconds is not distinct from v2_processing_time_seconds then 'MATCH'
            else 'SEMÁNTICA DIFERENTE'
          end
        ),
        (
          'message_sentiment',
          legacy_message_sentiment,
          v2_message_sentiment,
          legacy_message_sentiment is not distinct from v2_message_sentiment,
          lower(nullif(btrim(legacy_message_sentiment), '')) is not distinct from lower(nullif(btrim(v2_message_sentiment), '')),
          false,
          case
            when legacy_message_sentiment is not distinct from v2_message_sentiment then 'MATCH'
            when lower(nullif(btrim(legacy_message_sentiment), '')) is not distinct from lower(nullif(btrim(v2_message_sentiment), '')) then 'ALIAS / NORMALIZACIÓN'
            else 'SEMÁNTICA DIFERENTE'
          end
        ),
        (
          'chat_state',
          legacy_chat_state,
          v2_chat_state,
          legacy_chat_state is not distinct from v2_chat_state,
          lower(nullif(btrim(legacy_chat_state), '')) is not distinct from lower(nullif(btrim(v2_chat_state), '')),
          false,
          case
            when legacy_chat_state is not distinct from v2_chat_state then 'MATCH'
            when lower(nullif(btrim(legacy_chat_state), '')) is not distinct from lower(nullif(btrim(v2_chat_state), '')) then 'ALIAS / NORMALIZACIÓN'
            else 'SEMÁNTICA DIFERENTE'
          end
        ),
        (
          'intent_category',
          legacy_intent_category,
          v2_intent_category,
          legacy_intent_category is not distinct from v2_intent_category,
          lower(nullif(btrim(legacy_intent_category), '')) is not distinct from lower(nullif(btrim(v2_intent_category), '')),
          false,
          case
            when legacy_intent_category is not distinct from v2_intent_category then 'MATCH'
            when lower(nullif(btrim(legacy_intent_category), '')) is not distinct from lower(nullif(btrim(v2_intent_category), '')) then 'ALIAS / NORMALIZACIÓN'
            else 'SEMÁNTICA DIFERENTE'
          end
        ),
        (
          'row_hash',
          left(legacy_row_hash, 12),
          left(v2_row_hash, 12),
          false,
          false,
          true,
          'NO COMPARABLE'
        )
    ) as field_compare(field_name, legacy_value, v2_value, exact_equal, normalized_equal, no_comparable, classification)
  ),
  metadata_field_summary as (
    select
      field_name,
      count(*)::bigint as matched,
      count(*) filter (where exact_equal)::bigint as equal,
      count(*) filter (where not exact_equal)::bigint as different,
      count(*) filter (where legacy_value is null)::bigint as null_legacy,
      count(*) filter (where v2_value is null)::bigint as null_v2,
      count(*) filter (where not exact_equal and normalized_equal)::bigint as normalized_only_equal,
      count(*) filter (where no_comparable)::bigint as no_comparable,
      round((count(*) filter (where exact_equal)::numeric / nullif(count(*), 0)) * 100, 2) as match_rate,
      coalesce(jsonb_object_agg(classification, classification_count), '{}'::jsonb) as classifications
    from (
      select
        metadata_field_rows.*,
        count(*) over (partition by field_name, classification) as classification_count
      from metadata_field_rows
    ) as rows
    group by field_name
  ),
  raw_matches as (
    select
      legacy.id as legacy_id,
      compat.source_id_raw as v2_source_id,
      legacy.message_text is not null as legacy_text_present,
      compat.message_text is not null as v2_text_present,
      case
        when legacy.message_text is null then null
        else encode(extensions.digest(convert_to(legacy.message_text, 'UTF8'), 'sha256'), 'hex')
      end as legacy_message_text_hash,
      case
        when compat.message_text is null then null
        else encode(extensions.digest(convert_to(compat.message_text, 'UTF8'), 'sha256'), 'hex')
      end as v2_message_text_hash,
      legacy.message_sentiment as legacy_message_sentiment,
      compat.message_sentiment as v2_message_sentiment,
      legacy.chat_state as legacy_chat_state,
      compat.chat_state as v2_chat_state,
      legacy.intent_category as legacy_intent_category,
      compat.intent_category as v2_intent_category,
      legacy.row_hash as legacy_row_hash,
      compat.row_hash as v2_row_hash
    from public.recovery_whatsapp_message_memory_raw_import as legacy
    join public.v_recovery_whatsapp_message_memory_raw_current_compat as compat
      on compat.conversation_id = legacy.conversation_id
      and compat.wa_id_normalized = legacy.wa_id_normalized
      and compat.message_at = legacy.message_at
      and compat.message_bound_type is not distinct from legacy.message_bound_type
      and compat.message_type is not distinct from legacy.message_type
      and compat.api_phone_normalized is not distinct from legacy.api_phone_normalized
  ),
  raw_field_rows as (
    select *
    from raw_matches
    cross join lateral (
      values
        (
          'message_text_hash',
          left(legacy_message_text_hash, 12),
          left(v2_message_text_hash, 12),
          legacy_message_text_hash is not distinct from v2_message_text_hash,
          legacy_message_text_hash is not distinct from v2_message_text_hash,
          false,
          case when legacy_message_text_hash is not distinct from v2_message_text_hash then 'MATCH' else 'SEMÁNTICA DIFERENTE' end
        ),
        (
          'message_text_presence',
          legacy_text_present::text,
          v2_text_present::text,
          legacy_text_present is not distinct from v2_text_present,
          legacy_text_present is not distinct from v2_text_present,
          false,
          case when legacy_text_present is not distinct from v2_text_present then 'MATCH' else 'CAMPO NO DISPONIBLE EN V2' end
        ),
        (
          'message_sentiment',
          legacy_message_sentiment,
          v2_message_sentiment,
          legacy_message_sentiment is not distinct from v2_message_sentiment,
          lower(nullif(btrim(legacy_message_sentiment), '')) is not distinct from lower(nullif(btrim(v2_message_sentiment), '')),
          false,
          case
            when legacy_message_sentiment is not distinct from v2_message_sentiment then 'MATCH'
            when lower(nullif(btrim(legacy_message_sentiment), '')) is not distinct from lower(nullif(btrim(v2_message_sentiment), '')) then 'ALIAS / NORMALIZACIÓN'
            else 'SEMÁNTICA DIFERENTE'
          end
        ),
        (
          'chat_state',
          legacy_chat_state,
          v2_chat_state,
          legacy_chat_state is not distinct from v2_chat_state,
          lower(nullif(btrim(legacy_chat_state), '')) is not distinct from lower(nullif(btrim(v2_chat_state), '')),
          false,
          case
            when legacy_chat_state is not distinct from v2_chat_state then 'MATCH'
            when lower(nullif(btrim(legacy_chat_state), '')) is not distinct from lower(nullif(btrim(v2_chat_state), '')) then 'ALIAS / NORMALIZACIÓN'
            else 'SEMÁNTICA DIFERENTE'
          end
        ),
        (
          'intent_category',
          legacy_intent_category,
          v2_intent_category,
          legacy_intent_category is not distinct from v2_intent_category,
          lower(nullif(btrim(legacy_intent_category), '')) is not distinct from lower(nullif(btrim(v2_intent_category), '')),
          false,
          case
            when legacy_intent_category is not distinct from v2_intent_category then 'MATCH'
            when lower(nullif(btrim(legacy_intent_category), '')) is not distinct from lower(nullif(btrim(v2_intent_category), '')) then 'ALIAS / NORMALIZACIÓN'
            else 'SEMÁNTICA DIFERENTE'
          end
        ),
        (
          'row_hash',
          left(legacy_row_hash, 12),
          left(v2_row_hash, 12),
          false,
          false,
          true,
          'NO COMPARABLE'
        )
    ) as field_compare(field_name, legacy_value, v2_value, exact_equal, normalized_equal, no_comparable, classification)
  ),
  raw_field_summary as (
    select
      field_name,
      count(*)::bigint as matched,
      count(*) filter (where exact_equal)::bigint as equal,
      count(*) filter (where not exact_equal)::bigint as different,
      count(*) filter (where legacy_value is null)::bigint as null_legacy,
      count(*) filter (where v2_value is null)::bigint as null_v2,
      count(*) filter (where not exact_equal and normalized_equal)::bigint as normalized_only_equal,
      count(*) filter (where no_comparable)::bigint as no_comparable,
      round((count(*) filter (where exact_equal)::numeric / nullif(count(*), 0)) * 100, 2) as match_rate,
      coalesce(jsonb_object_agg(classification, classification_count), '{}'::jsonb) as classifications
    from (
      select
        raw_field_rows.*,
        count(*) over (partition by field_name, classification) as classification_count
      from raw_field_rows
    ) as rows
    group by field_name
  )
  select jsonb_build_object(
    'matchingStrategy',
    jsonb_build_object(
      'metadata', 'conversation_id + api_phone_normalized + wa_id_normalized + message_at + message_bound_type + message_type',
      'raw', 'conversation_id + api_phone_normalized + wa_id_normalized + message_at + message_bound_type + message_type',
      'fuzzyMatching', false
    ),
    'semanticAudit',
    jsonb_build_object(
      'legacyMetadata', 'CSV validator lower(trim()) normalizes message_bound_type, message_type, time_of_day, day_of_week, message_sentiment, chat_state and intent_category; processing_time is parsed to numeric seconds.',
      'legacyRaw', 'Raw import lower(trim()) normalizes message_bound_type, message_type, message_sentiment, chat_state and intent_category and stores message_text.',
      'v2Raw', 'WHATSAPP_BBDD V2 stores source values as received: time_of_day, day_of_week, message_sentiment, chat_state, intent_category, message_text and text_summary.',
      'currentCompat', 'Current compat views alias V2 columns directly, except processing_time as processing_time_seconds; they do not lower/trim category fields.',
      'rowHash', 'NO COMPARABLE: legacy hashes normalized read contracts; V2 source_row_hash includes source_id, source_created_at, api_phone, message_text and text_summary.'
    ),
    'metadata',
    jsonb_build_object(
      'legacyTotal', (select count(*) from public.recovery_whatsapp_message_memory_import),
      'v2CompatTotal', (select count(*) from public.v_recovery_whatsapp_message_memory_current_compat),
      'matchedTotal', (select count(*) from metadata_matches),
      'fields', coalesce((select jsonb_object_agg(field_name, to_jsonb(metadata_field_summary) - 'field_name') from metadata_field_summary), '{}'::jsonb)
    ),
    'raw',
    jsonb_build_object(
      'legacyTotal', (select count(*) from public.recovery_whatsapp_message_memory_raw_import),
      'v2CompatTotal', (select count(*) from public.v_recovery_whatsapp_message_memory_raw_current_compat),
      'matchedTotal', (select count(*) from raw_matches),
      'fields', coalesce((select jsonb_object_agg(field_name, to_jsonb(raw_field_summary) - 'field_name') from raw_field_summary), '{}'::jsonb)
    )
  );
$$;

revoke execute on function public.recovery_v2_compat_message_memory_audit(integer)
  from public, anon;
grant execute on function public.recovery_v2_compat_message_memory_audit(integer)
  to authenticated, service_role;

comment on function public.recovery_v2_compat_message_memory_audit(integer) is
  'Read-only, no-PII audit of legacy WhatsApp message memory contracts versus Recovery V2 compat views. Returns aggregate field equality and semantic classification only.';

commit;
