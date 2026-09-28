-- LOCAL TEST ONLY. Minimal pre-160000 schema required by the reversible harness.
-- Never run this file against Supabase or any shared database.
\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create table public.customer_profiles (
  id uuid primary key,
  status text not null,
  resolver_version text,
  needs_review boolean not null default false,
  merged_into_profile_id uuid references public.customer_profiles(id),
  updated_at timestamptz not null default pg_catalog.statement_timestamp()
);

create table public.customer_booking_profile_links (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  profile_id uuid not null references public.customer_profiles(id),
  source text not null,
  source_row_id bigint not null,
  confidence text,
  status text not null,
  resolver_version text,
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  unique (source, source_row_id)
);

create table public.customer_source_bookings_mcp_eap (
  source text not null default 'MCP_EAP',
  source_row_id bigint not null,
  source_booking_code text,
  source_customer_id bigint,
  source_created_at timestamp without time zone,
  planned_arrival_at timestamp without time zone,
  planned_departure_at timestamp without time zone,
  booking_status integer,
  paying_status integer,
  website_source integer,
  brand_normalized text,
  parking_normalized text,
  source_total_amount numeric(14,2),
  booking_paid numeric(14,2),
  promotion_code text,
  promotion_discount_amount numeric(14,2),
  duration_days integer,
  sub_days_used integer,
  is_pack boolean not null default false,
  row_hash text,
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (source, source_row_id)
);

create table public.customer_source_bookings_okp (
  source text not null default 'OKP',
  source_row_id bigint not null,
  source_booking_code text,
  source_created_at timestamp without time zone,
  planned_arrival_at timestamp without time zone,
  planned_departure_at timestamp without time zone,
  status_raw text,
  is_confirmed boolean,
  is_paid boolean,
  is_inactive boolean,
  parking_normalized text,
  source_total_amount numeric(14,2),
  discount_amount numeric(14,2),
  coupon_amount numeric(14,2),
  coupon_code text,
  is_pack boolean not null default false,
  row_hash text,
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  primary key (source, source_row_id)
);

create table public.customer_window_parking_family_rules (
  source text not null,
  parking text not null,
  parking_family text not null,
  primary key (source, parking)
);

create or replace function public.customer_window_360_v1_resolve_locator(p_locator jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'locator', p_locator,
    'customerId', p_locator ->> 'representationId'
  );
$function$;
