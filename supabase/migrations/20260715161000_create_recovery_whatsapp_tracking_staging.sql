-- Staging for n8n Seguimiento WhatsApp imports.
-- Stores normalized operational tracking fields only. Raw phones, Json_Encuesta,
-- raw payloads, messages and full CSV files are intentionally not stored.

alter table public.recovery_import_batches
  drop constraint if exists recovery_import_batches_import_type_check;

alter table public.recovery_import_batches
  add constraint recovery_import_batches_import_type_check
  check (import_type in ('purchases_csv', 'incomplete_bookings_csv', 'whatsapp_tracking_csv'));

create table if not exists public.recovery_whatsapp_tracking_import (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.recovery_import_batches(id) on delete cascade,
  source_id text not null,
  message_id text not null,
  business_phone_normalized text,
  client_phone_normalized text,
  message_category text,
  charge_type text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  tracking_status text not null,
  created_at_source timestamptz,
  updated_at_source timestamptz,
  row_hash text,
  created_at timestamptz not null default now(),
  constraint recovery_whatsapp_tracking_import_status_check
    check (tracking_status in ('read', 'delivered', 'sent', 'failed', 'unknown')),
  constraint recovery_whatsapp_tracking_import_source_id_check
    check (length(trim(source_id)) > 0),
  constraint recovery_whatsapp_tracking_import_message_id_check
    check (length(trim(message_id)) > 0),
  constraint recovery_whatsapp_tracking_import_batch_source_unique
    unique (batch_id, source_id),
  constraint recovery_whatsapp_tracking_import_batch_message_unique
    unique (batch_id, message_id)
);

create index if not exists recovery_whatsapp_tracking_import_batch_id_idx
  on public.recovery_whatsapp_tracking_import(batch_id);

create index if not exists recovery_whatsapp_tracking_import_source_id_idx
  on public.recovery_whatsapp_tracking_import(source_id);

create index if not exists recovery_whatsapp_tracking_import_message_id_idx
  on public.recovery_whatsapp_tracking_import(message_id);

create index if not exists recovery_whatsapp_tracking_import_client_phone_idx
  on public.recovery_whatsapp_tracking_import(client_phone_normalized);

create index if not exists recovery_whatsapp_tracking_import_tracking_status_idx
  on public.recovery_whatsapp_tracking_import(tracking_status);

create index if not exists recovery_whatsapp_tracking_import_sent_at_idx
  on public.recovery_whatsapp_tracking_import(sent_at);

create index if not exists recovery_whatsapp_tracking_import_read_at_idx
  on public.recovery_whatsapp_tracking_import(read_at);

create index if not exists recovery_whatsapp_tracking_import_row_hash_idx
  on public.recovery_whatsapp_tracking_import(row_hash);

create unique index if not exists recovery_whatsapp_tracking_import_batch_row_hash_unique_idx
  on public.recovery_whatsapp_tracking_import(batch_id, row_hash)
  where row_hash is not null;

alter table public.recovery_whatsapp_tracking_import enable row level security;

drop policy if exists recovery_whatsapp_tracking_import_admin_all
  on public.recovery_whatsapp_tracking_import;

create policy recovery_whatsapp_tracking_import_admin_all
  on public.recovery_whatsapp_tracking_import
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

comment on table public.recovery_whatsapp_tracking_import is
  'Normalized staging rows for n8n Seguimiento WhatsApp imports. Json_Encuesta raw, raw phones, payloads, messages and full CSV files are intentionally not stored.';

comment on column public.recovery_whatsapp_tracking_import.message_id is
  'Normalized Id_Mensaje used to join with recovery_incomplete_bookings_import.message_id.';

comment on column public.recovery_whatsapp_tracking_import.business_phone_normalized is
  'Normalized business phone. Raw phone values are intentionally not stored.';

comment on column public.recovery_whatsapp_tracking_import.client_phone_normalized is
  'Normalized client phone used as a fallback match key. Raw phone values are intentionally not stored.';

comment on column public.recovery_whatsapp_tracking_import.tracking_status is
  'Derived WhatsApp tracking status using priority read, delivered, sent, failed, unknown.';

comment on column public.recovery_whatsapp_tracking_import.row_hash is
  'SHA-256 hash of the normalized staging row for duplicate detection.';
