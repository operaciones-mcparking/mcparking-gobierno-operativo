-- Staging for n8n WhatsApp Message Memory imports.
-- Stores normalized conversation metadata only. Raw Message, text_summary,
-- raw phones, payloads and full CSV files are intentionally not stored.

alter table public.recovery_import_batches
  drop constraint if exists recovery_import_batches_import_type_check;

alter table public.recovery_import_batches
  add constraint recovery_import_batches_import_type_check
  check (
    import_type in (
      'purchases_csv',
      'incomplete_bookings_csv',
      'whatsapp_tracking_csv',
      'whatsapp_message_memory_csv'
    )
  );

create table if not exists public.recovery_whatsapp_message_memory_import (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.recovery_import_batches(id) on delete cascade,
  conversation_id text not null,
  api_phone_normalized text,
  wa_id_normalized text not null,
  message_at timestamptz not null,
  message_bound_type text,
  processing_time_seconds numeric,
  message_type text,
  time_of_day text,
  day_of_week text,
  message_sentiment text,
  chat_state text,
  intent_category text,
  row_hash text not null,
  created_at timestamptz not null default now(),
  constraint recovery_whatsapp_message_memory_conversation_id_check
    check (length(trim(conversation_id)) > 0),
  constraint recovery_whatsapp_message_memory_wa_id_check
    check (length(trim(wa_id_normalized)) > 0),
  constraint recovery_whatsapp_message_memory_row_hash_check
    check (length(trim(row_hash)) > 0),
  constraint recovery_whatsapp_message_memory_processing_time_check
    check (processing_time_seconds is null or processing_time_seconds >= 0)
);

create index if not exists recovery_whatsapp_message_memory_batch_id_idx
  on public.recovery_whatsapp_message_memory_import(batch_id);

create index if not exists recovery_whatsapp_message_memory_conversation_id_idx
  on public.recovery_whatsapp_message_memory_import(conversation_id);

create index if not exists recovery_whatsapp_message_memory_api_phone_idx
  on public.recovery_whatsapp_message_memory_import(api_phone_normalized);

create index if not exists recovery_whatsapp_message_memory_wa_id_idx
  on public.recovery_whatsapp_message_memory_import(wa_id_normalized);

create index if not exists recovery_whatsapp_message_memory_message_at_idx
  on public.recovery_whatsapp_message_memory_import(message_at);

create index if not exists recovery_whatsapp_message_memory_bound_type_idx
  on public.recovery_whatsapp_message_memory_import(message_bound_type);

create index if not exists recovery_whatsapp_message_memory_message_type_idx
  on public.recovery_whatsapp_message_memory_import(message_type);

create index if not exists recovery_whatsapp_message_memory_sentiment_idx
  on public.recovery_whatsapp_message_memory_import(message_sentiment);

create index if not exists recovery_whatsapp_message_memory_chat_state_idx
  on public.recovery_whatsapp_message_memory_import(chat_state);

create index if not exists recovery_whatsapp_message_memory_intent_category_idx
  on public.recovery_whatsapp_message_memory_import(intent_category);

create index if not exists recovery_whatsapp_message_memory_row_hash_idx
  on public.recovery_whatsapp_message_memory_import(row_hash);

create unique index if not exists recovery_whatsapp_message_memory_batch_row_hash_unique_idx
  on public.recovery_whatsapp_message_memory_import(batch_id, row_hash);

create unique index if not exists recovery_whatsapp_message_memory_row_hash_unique_idx
  on public.recovery_whatsapp_message_memory_import(row_hash);

alter table public.recovery_whatsapp_message_memory_import enable row level security;

drop policy if exists recovery_whatsapp_message_memory_import_admin_all
  on public.recovery_whatsapp_message_memory_import;

create policy recovery_whatsapp_message_memory_import_admin_all
  on public.recovery_whatsapp_message_memory_import
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

comment on table public.recovery_whatsapp_message_memory_import is
  'Normalized staging rows for n8n WhatsApp Message Memory imports. Raw Message, text_summary, raw phones, payloads and full CSV files are intentionally not stored.';

comment on column public.recovery_whatsapp_message_memory_import.conversation_id is
  'Source conversation identifier from WhatsApp Message Memory, used to group messages within a conversation.';

comment on column public.recovery_whatsapp_message_memory_import.api_phone_normalized is
  'Normalized API/business phone. Raw phone values are intentionally not stored.';

comment on column public.recovery_whatsapp_message_memory_import.wa_id_normalized is
  'Normalized WhatsApp client identifier used for matching with recovery cart phones. Raw values are intentionally not stored.';

comment on column public.recovery_whatsapp_message_memory_import.message_at is
  'Message timestamp parsed from the source timestamp column.';

comment on column public.recovery_whatsapp_message_memory_import.intent_category is
  'Source intent category used for aggregate operational analysis.';

comment on column public.recovery_whatsapp_message_memory_import.row_hash is
  'SHA-256 hash of the normalized staging row for duplicate detection across overlapping CSV imports.';
