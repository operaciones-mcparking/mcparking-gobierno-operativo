-- Safe derived reservation fields from BackendIncompleteBookings2.bform.
-- This migration does not store raw bform, cms_url, links, names or payloads.

alter table public.recovery_incomplete_bookings_import
  add column if not exists intended_arrival_date date,
  add column if not exists intended_departure_date date,
  add column if not exists intended_days integer,
  add column if not exists intended_arrival_at timestamptz,
  add column if not exists intended_departure_at timestamptz;

alter table public.recovery_incomplete_bookings_import
  drop constraint if exists recovery_incomplete_bookings_import_intended_days_check;

alter table public.recovery_incomplete_bookings_import
  add constraint recovery_incomplete_bookings_import_intended_days_check
  check (intended_days is null or intended_days >= 0);

create index if not exists recovery_incomplete_bookings_import_intended_arrival_date_idx
  on public.recovery_incomplete_bookings_import(intended_arrival_date);

create index if not exists recovery_incomplete_bookings_import_intended_departure_date_idx
  on public.recovery_incomplete_bookings_import(intended_departure_date);

create index if not exists recovery_incomplete_bookings_import_intended_arrival_at_idx
  on public.recovery_incomplete_bookings_import(intended_arrival_at);

create index if not exists recovery_incomplete_bookings_import_intended_departure_at_idx
  on public.recovery_incomplete_bookings_import(intended_departure_at);

comment on column public.recovery_incomplete_bookings_import.intended_arrival_date is
  'Derived safe arrival date from BackendIncompleteBookings2.bform.arrival_date. Raw bform is intentionally not stored.';

comment on column public.recovery_incomplete_bookings_import.intended_departure_date is
  'Derived safe departure date from BackendIncompleteBookings2.bform.departure_date. Used to identify expired carts without storing raw bform.';

comment on column public.recovery_incomplete_bookings_import.intended_days is
  'Derived intended parking duration from BackendIncompleteBookings2.bform.days.';

comment on column public.recovery_incomplete_bookings_import.intended_arrival_at is
  'Optional derived arrival timestamp from bform arrival date/hour when parseable.';

comment on column public.recovery_incomplete_bookings_import.intended_departure_at is
  'Optional derived departure timestamp from bform departure date/hour when parseable.';
