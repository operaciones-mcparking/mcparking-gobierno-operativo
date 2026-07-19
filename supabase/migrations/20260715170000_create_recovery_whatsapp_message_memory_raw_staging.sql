-- Sensitive raw-message staging for n8n WhatsApp Message Memory imports.
-- This table stores customer/operator message text and must only be used for
-- punctual admin-only "Ver chat" views. Do not use it in general reports,
-- exports, or aggregate dashboards.

alter table public.recovery_import_batches
  drop constraint if exists recovery_import_batches_import_type_check;

alter table public.recovery_import_batches
  add constraint recovery_import_batches_import_type_check
  check (
    import_type in (
      'purchases_csv',
      'incomplete_bookings_csv',
      'whatsapp_tracking_csv',
      'whatsapp_message_memory_csv',
      'whatsapp_message_memory_raw_csv'
    )
  );

create table if not exists public.recovery_whatsapp_message_memory_raw_import (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.recovery_import_batches(id) on delete cascade,
  conversation_id text not null,
  api_phone_normalized text,
  wa_id_normalized text not null,
  message_at timestamptz not null,
  message_bound_type text,
  message_type text,
  intent_category text,
  message_sentiment text,
  chat_state text,
  message_text text not null,
  row_hash text not null,
  created_at timestamptz not null default now(),
  constraint recovery_whatsapp_message_memory_raw_conversation_id_check
    check (length(trim(conversation_id)) > 0),
  constraint recovery_whatsapp_message_memory_raw_wa_id_check
    check (length(trim(wa_id_normalized)) > 0),
  constraint recovery_whatsapp_message_memory_raw_message_text_check
    check (length(trim(message_text)) > 0),
  constraint recovery_whatsapp_message_memory_raw_row_hash_check
    check (length(trim(row_hash)) > 0)
);

create index if not exists recovery_whatsapp_message_memory_raw_batch_id_idx
  on public.recovery_whatsapp_message_memory_raw_import(batch_id);

create index if not exists recovery_whatsapp_message_memory_raw_conversation_id_idx
  on public.recovery_whatsapp_message_memory_raw_import(conversation_id);

create index if not exists recovery_whatsapp_message_memory_raw_wa_id_idx
  on public.recovery_whatsapp_message_memory_raw_import(wa_id_normalized);

create index if not exists recovery_whatsapp_message_memory_raw_message_at_idx
  on public.recovery_whatsapp_message_memory_raw_import(message_at);

create index if not exists recovery_whatsapp_message_memory_raw_bound_type_idx
  on public.recovery_whatsapp_message_memory_raw_import(message_bound_type);

create index if not exists recovery_whatsapp_message_memory_raw_intent_category_idx
  on public.recovery_whatsapp_message_memory_raw_import(intent_category);

create index if not exists recovery_whatsapp_message_memory_raw_sentiment_idx
  on public.recovery_whatsapp_message_memory_raw_import(message_sentiment);

create index if not exists recovery_whatsapp_message_memory_raw_chat_state_idx
  on public.recovery_whatsapp_message_memory_raw_import(chat_state);

create index if not exists recovery_whatsapp_message_memory_raw_row_hash_idx
  on public.recovery_whatsapp_message_memory_raw_import(row_hash);

create unique index if not exists recovery_whatsapp_message_memory_raw_batch_row_hash_unique_idx
  on public.recovery_whatsapp_message_memory_raw_import(batch_id, row_hash);

create unique index if not exists recovery_whatsapp_message_memory_raw_row_hash_unique_idx
  on public.recovery_whatsapp_message_memory_raw_import(row_hash);

alter table public.recovery_whatsapp_message_memory_raw_import enable row level security;

drop policy if exists recovery_whatsapp_message_memory_raw_import_admin_all
  on public.recovery_whatsapp_message_memory_raw_import;

create policy recovery_whatsapp_message_memory_raw_import_admin_all
  on public.recovery_whatsapp_message_memory_raw_import
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

comment on table public.recovery_whatsapp_message_memory_raw_import is
  'Sensitive raw-message staging for n8n WhatsApp Message Memory imports. Contains customer/operator message text and must only be used for punctual admin-only chat views, not general reports or exports.';

comment on column public.recovery_whatsapp_message_memory_raw_import.message_text is
  'Raw Message text from the source CSV. Sensitive and potentially PII-bearing. text_summary, raw phones, payloads and full CSV files are intentionally not stored.';

comment on column public.recovery_whatsapp_message_memory_raw_import.row_hash is
  'SHA-256 hash of the normalized raw-message staging row for incremental duplicate detection across overlapping CSV imports.';
