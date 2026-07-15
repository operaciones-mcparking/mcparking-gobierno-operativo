-- Base staging tables for the future /recuperacion purchases CSV import flow.
-- These tables store only normalized fields needed for attribution; raw CSV rows
-- and raw PII such as plates, full names, addresses, notes, raw emails or raw phones
-- are intentionally not stored in this first stage.

create table if not exists public.recovery_import_batches (
  id uuid primary key default gen_random_uuid(),
  import_type text not null default 'purchases_csv',
  file_name text not null,
  file_size bigint not null,
  file_hash text,
  status text not null default 'validated',
  rows_total integer not null default 0,
  columns_total integer not null default 0,
  valid_purchase_rows integer not null default 0,
  valid_purchase_amount numeric(12,2) not null default 0,
  missing_mandatory_columns jsonb not null default '[]'::jsonb,
  booking_status_counts jsonb not null default '{}'::jsonb,
  duplicate_id_groups integer not null default 0,
  duplicate_booking_number_groups integer not null default 0,
  created_by uuid references public.user_profiles(user_id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  discarded_at timestamptz,
  error_message text,
  constraint recovery_import_batches_import_type_check
    check (import_type in ('purchases_csv')),
  constraint recovery_import_batches_status_check
    check (status in ('validated', 'importing', 'imported', 'failed', 'discarded')),
  constraint recovery_import_batches_numbers_check
    check (
      file_size >= 0
      and rows_total >= 0
      and columns_total >= 0
      and valid_purchase_rows >= 0
      and valid_purchase_amount >= 0
      and duplicate_id_groups >= 0
      and duplicate_booking_number_groups >= 0
    )
);

create table if not exists public.recovery_bookings_import (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.recovery_import_batches(id) on delete cascade,
  source_booking_id text not null,
  customer_id text,
  email_normalized text,
  phone_normalized text,
  booking_created_at timestamptz,
  booking_status integer not null,
  paying_status text,
  price numeric(12,2),
  is_valid_purchase boolean not null default false,
  booking_number text,
  parking_code text,
  location_code text,
  arrival_date date,
  departure_date date,
  duration_days integer,
  row_hash text,
  created_at timestamptz not null default now(),
  constraint recovery_bookings_import_batch_source_booking_unique
    unique (batch_id, source_booking_id),
  constraint recovery_bookings_import_price_check
    check (price is null or price >= 0),
  constraint recovery_bookings_import_duration_days_check
    check (duration_days is null or duration_days >= 0)
);

create index if not exists recovery_import_batches_file_hash_idx
  on public.recovery_import_batches(file_hash);

create index if not exists recovery_import_batches_created_at_idx
  on public.recovery_import_batches(created_at);

create index if not exists recovery_import_batches_status_idx
  on public.recovery_import_batches(status);

create index if not exists recovery_bookings_import_batch_id_idx
  on public.recovery_bookings_import(batch_id);

create index if not exists recovery_bookings_import_booking_created_at_idx
  on public.recovery_bookings_import(booking_created_at);

create index if not exists recovery_bookings_import_phone_normalized_idx
  on public.recovery_bookings_import(phone_normalized);

create index if not exists recovery_bookings_import_email_normalized_idx
  on public.recovery_bookings_import(email_normalized);

create index if not exists recovery_bookings_import_source_booking_id_idx
  on public.recovery_bookings_import(source_booking_id);

create index if not exists recovery_bookings_import_booking_number_idx
  on public.recovery_bookings_import(booking_number);

create index if not exists recovery_bookings_import_row_hash_idx
  on public.recovery_bookings_import(row_hash);

create unique index if not exists recovery_bookings_import_batch_row_hash_unique_idx
  on public.recovery_bookings_import(batch_id, row_hash)
  where row_hash is not null;

alter table public.recovery_import_batches enable row level security;
alter table public.recovery_bookings_import enable row level security;

drop policy if exists recovery_import_batches_admin_all on public.recovery_import_batches;
create policy recovery_import_batches_admin_all
  on public.recovery_import_batches
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists recovery_bookings_import_admin_all on public.recovery_bookings_import;
create policy recovery_bookings_import_admin_all
  on public.recovery_bookings_import
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

comment on table public.recovery_import_batches is
  'Staging batches for validated or imported recovery purchase CSV files. No raw CSV content is stored.';

comment on table public.recovery_bookings_import is
  'Normalized purchase rows imported from recovery CSV files. Raw PII fields are intentionally excluded.';

comment on column public.recovery_import_batches.file_hash is
  'Server-side file hash used to detect repeated CSV uploads.';

comment on column public.recovery_bookings_import.row_hash is
  'Server-side normalized row hash used to detect repeated rows within a batch.';

comment on column public.recovery_bookings_import.email_normalized is
  'Normalized email used for matching; raw email is not stored in this staging table.';

comment on column public.recovery_bookings_import.phone_normalized is
  'Normalized phone used for matching; raw phone is not stored in this staging table.';
