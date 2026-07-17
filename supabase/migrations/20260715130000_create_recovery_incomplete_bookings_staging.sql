-- Staging for BackendIncompleteBookings2 imports.
-- Stores normalized incomplete/canceled bookings without raw PII payloads.

alter table public.recovery_import_batches
  drop constraint if exists recovery_import_batches_import_type_check;

alter table public.recovery_import_batches
  add constraint recovery_import_batches_import_type_check
  check (import_type in ('purchases_csv', 'incomplete_bookings_csv'));

create table if not exists public.recovery_incomplete_bookings_import (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.recovery_import_batches(id) on delete cascade,
  source_id text not null,
  booking_id text not null,
  email_normalized text,
  phone_normalized text,
  type text not null,
  parking_code text,
  form_datetime timestamptz,
  message_sent boolean,
  message_id text,
  created_at_source timestamptz,
  updated_at_source timestamptz,
  row_hash text,
  created_at timestamptz not null default now(),
  constraint recovery_incomplete_bookings_import_type_check
    check (type in ('abandoned', 'canceled')),
  constraint recovery_incomplete_bookings_import_source_id_check
    check (length(trim(source_id)) > 0),
  constraint recovery_incomplete_bookings_import_booking_id_check
    check (length(trim(booking_id)) > 0),
  constraint recovery_incomplete_bookings_import_batch_source_unique
    unique (batch_id, source_id)
);

create index if not exists recovery_incomplete_bookings_import_batch_id_idx
  on public.recovery_incomplete_bookings_import(batch_id);

create index if not exists recovery_incomplete_bookings_import_source_id_idx
  on public.recovery_incomplete_bookings_import(source_id);

create index if not exists recovery_incomplete_bookings_import_booking_id_idx
  on public.recovery_incomplete_bookings_import(booking_id);

create index if not exists recovery_incomplete_bookings_import_message_id_idx
  on public.recovery_incomplete_bookings_import(message_id);

create index if not exists recovery_incomplete_bookings_import_email_normalized_idx
  on public.recovery_incomplete_bookings_import(email_normalized);

create index if not exists recovery_incomplete_bookings_import_phone_normalized_idx
  on public.recovery_incomplete_bookings_import(phone_normalized);

create index if not exists recovery_incomplete_bookings_import_form_datetime_idx
  on public.recovery_incomplete_bookings_import(form_datetime);

create index if not exists recovery_incomplete_bookings_import_type_idx
  on public.recovery_incomplete_bookings_import(type);

create index if not exists recovery_incomplete_bookings_import_row_hash_idx
  on public.recovery_incomplete_bookings_import(row_hash);

create unique index if not exists recovery_incomplete_bookings_import_batch_row_hash_unique_idx
  on public.recovery_incomplete_bookings_import(batch_id, row_hash)
  where row_hash is not null;

alter table public.recovery_incomplete_bookings_import enable row level security;

drop policy if exists recovery_incomplete_bookings_import_admin_all
  on public.recovery_incomplete_bookings_import;

create policy recovery_incomplete_bookings_import_admin_all
  on public.recovery_incomplete_bookings_import
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

comment on table public.recovery_incomplete_bookings_import is
  'Normalized staging rows for BackendIncompleteBookings2 imports. Raw email, phone, cms_url, bform, raw payloads and full CSV files are intentionally not stored.';

comment on column public.recovery_incomplete_bookings_import.source_id is
  'Source id from BackendIncompleteBookings2.id.';

comment on column public.recovery_incomplete_bookings_import.email_normalized is
  'Normalized email used for matching. Still operational PII; access must remain restricted.';

comment on column public.recovery_incomplete_bookings_import.phone_normalized is
  'Normalized phone used for matching. Still operational PII; access must remain restricted.';

comment on column public.recovery_incomplete_bookings_import.row_hash is
  'SHA-256 hash of the normalized staging row for duplicate detection.';
