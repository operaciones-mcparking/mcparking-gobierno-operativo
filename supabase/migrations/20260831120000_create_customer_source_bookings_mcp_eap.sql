begin;

create table public.customer_source_bookings_mcp_eap (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'MCP_EAP',
  source_row_id bigint not null,
  source_booking_code text not null,
  source_customer_id bigint not null,
  phone_raw text,
  phone_normalized text,
  email_raw text,
  email_normalized text,
  plate_raw text,
  plate_normalized text,
  source_created_at timestamp without time zone not null,
  planned_arrival_at timestamp without time zone,
  planned_departure_at timestamp without time zone,
  booking_status integer not null,
  paying_status integer,
  website_source integer not null,
  parking_code_raw text,
  brand_normalized text not null,
  parking_normalized text not null,
  source_total_amount numeric(14,2),
  booking_paid numeric(14,2),
  promotion_code text,
  promotion_discount_amount numeric(14,2),
  duration_days integer,
  passenger_count integer,
  sub_days_used integer,
  is_pack boolean not null default false,
  row_hash text not null,
  source_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_source_bookings_mcp_eap_source_check
    check (source = 'MCP_EAP'),
  constraint customer_source_bookings_mcp_eap_source_row_unique
    unique (source, source_row_id),
  constraint customer_source_bookings_mcp_eap_source_row_id_check
    check (source_row_id > 0),
  constraint customer_source_bookings_mcp_eap_source_customer_id_check
    check (source_customer_id > 0),
  constraint customer_source_bookings_mcp_eap_booking_status_check
    check (booking_status in (1, 8)),
  constraint customer_source_bookings_mcp_eap_website_source_check
    check (website_source in (1, 2, 4)),
  constraint customer_source_bookings_mcp_eap_brand_check
    check (brand_normalized in ('MCP', 'EAP')),
  constraint customer_source_bookings_mcp_eap_parking_check
    check (parking_normalized in ('MCPARKING', 'MCPARKING VESPUCIO', 'ESTACIONAMIENTO AEROPUERTO')),
  constraint customer_source_bookings_mcp_eap_non_negative_counts_check
    check (
      (duration_days is null or duration_days >= 0)
      and (passenger_count is null or passenger_count >= 0)
      and (sub_days_used is null or sub_days_used >= 0)
    ),
  constraint customer_source_bookings_mcp_eap_row_hash_check
    check (row_hash ~ '^[0-9a-f]{64}$')
);

create index customer_source_bookings_mcp_eap_booking_code_idx
  on public.customer_source_bookings_mcp_eap(source_booking_code);

create index customer_source_bookings_mcp_eap_phone_idx
  on public.customer_source_bookings_mcp_eap(phone_normalized)
  where phone_normalized is not null;

create index customer_source_bookings_mcp_eap_email_idx
  on public.customer_source_bookings_mcp_eap(email_normalized)
  where email_normalized is not null;

create index customer_source_bookings_mcp_eap_plate_idx
  on public.customer_source_bookings_mcp_eap(plate_normalized)
  where plate_normalized is not null;

create index customer_source_bookings_mcp_eap_source_created_idx
  on public.customer_source_bookings_mcp_eap(source_created_at);

create index customer_source_bookings_mcp_eap_planned_arrival_idx
  on public.customer_source_bookings_mcp_eap(planned_arrival_at);

create index customer_source_bookings_mcp_eap_brand_parking_idx
  on public.customer_source_bookings_mcp_eap(brand_normalized, parking_normalized);

alter table public.customer_source_bookings_mcp_eap enable row level security;

revoke all on table public.customer_source_bookings_mcp_eap
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.customer_source_bookings_mcp_eap
  to service_role;

comment on table public.customer_source_bookings_mcp_eap is
  'Private normalized MCP/EAP source bookings from mcadmin_db.mcp_Buchungen. No direct frontend access.';
comment on column public.customer_source_bookings_mcp_eap.source_row_id is
  'Stable mcp_Buchungen.Id identifier and historical ingestion cursor.';
comment on column public.customer_source_bookings_mcp_eap.source_created_at is
  'Timezone-free mcp_Buchungen.Buchungszeit value. No timezone conversion is applied.';
comment on column public.customer_source_bookings_mcp_eap.row_hash is
  'SHA-256 of the mutable MCP/EAP Customer Window contract, excluding local synchronization metadata.';

commit;
