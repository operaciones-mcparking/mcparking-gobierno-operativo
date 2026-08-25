-- Private source table for OKParking bookings used by the future Customer Window.
-- Source timestamps remain timezone-free until the timezone for each site is confirmed.

begin;

create table public.customer_source_bookings_okp (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'OKP',
  source_row_id bigint not null,
  source_booking_code text,
  phone_raw text,
  email_raw text,
  plate_raw text,
  phone_normalized text,
  email_normalized text,
  plate_normalized text,
  source_created_at timestamp without time zone,
  source_updated_at timestamp without time zone,
  planned_arrival_at timestamp without time zone,
  planned_departure_at timestamp without time zone,
  actual_checkin_at timestamp without time zone,
  actual_checkout_at timestamp without time zone,
  status_raw text,
  is_confirmed boolean,
  is_paid boolean,
  is_inactive boolean,
  source_site_id text,
  parking_normalized text,
  valor_reserva_raw text,
  valor_reserva_amount numeric(14,2),
  source_total_amount numeric(14,2),
  coupon_code text,
  coupon_amount numeric(14,2),
  discount_amount numeric(14,2),
  j2_paquetes_raw text,
  pack_payload jsonb,
  is_pack boolean not null default false,
  pack_paid_days integer,
  pack_reference text,
  pack_code text,
  passenger_count integer,
  row_hash text not null,
  source_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_source_bookings_okp_source_check
    check (source = 'OKP'),
  constraint customer_source_bookings_okp_source_row_unique
    unique (source, source_row_id),
  constraint customer_source_bookings_okp_pack_paid_days_check
    check (pack_paid_days is null or pack_paid_days >= 0),
  constraint customer_source_bookings_okp_passenger_count_check
    check (passenger_count is null or passenger_count >= 0)
);

create index customer_source_bookings_okp_updated_cursor_idx
  on public.customer_source_bookings_okp(source_updated_at desc, source_row_id);

create index customer_source_bookings_okp_booking_code_idx
  on public.customer_source_bookings_okp(source_booking_code)
  where source_booking_code is not null;

create index customer_source_bookings_okp_phone_idx
  on public.customer_source_bookings_okp(phone_normalized)
  where phone_normalized is not null;

create index customer_source_bookings_okp_email_idx
  on public.customer_source_bookings_okp(email_normalized)
  where email_normalized is not null;

create index customer_source_bookings_okp_plate_idx
  on public.customer_source_bookings_okp(plate_normalized)
  where plate_normalized is not null;

create index customer_source_bookings_okp_planned_arrival_idx
  on public.customer_source_bookings_okp(planned_arrival_at);

create index customer_source_bookings_okp_parking_arrival_idx
  on public.customer_source_bookings_okp(parking_normalized, planned_arrival_at);

alter table public.customer_source_bookings_okp enable row level security;

revoke all on table public.customer_source_bookings_okp from public, anon, authenticated, service_role;
grant select, insert, update on table public.customer_source_bookings_okp to service_role;

comment on table public.customer_source_bookings_okp is
  'Private normalized source rows from scraping_data.BOOKINGS_LOGS_OKP. No direct frontend access.';
comment on column public.customer_source_bookings_okp.source_row_id is
  'Stable OKParking ID_BL identifier and incremental ingestion cursor.';
comment on column public.customer_source_bookings_okp.source_updated_at is
  'Timezone-free OKParking updatedAt value used for operational reconciliation.';
comment on column public.customer_source_bookings_okp.row_hash is
  'SHA-256 of the mutable OKParking v1 contract, excluding local synchronization metadata.';

commit;
