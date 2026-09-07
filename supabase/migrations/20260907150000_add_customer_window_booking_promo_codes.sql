begin;

create or replace view public.customer_window_bookings_v
with (security_invoker = true)
as
with okp_prepared as (
  select
    link.profile_id as customer_id,
    booking.*,
    (
      coalesce(booking.discount_amount, 0)
      + coalesce(booking.coupon_amount, 0)
    )::numeric(14,2) as canonical_discount_amount,
    case
      when booking.planned_arrival_at is null or booking.planned_departure_at is null then null
      else (
        booking.planned_departure_at::date
        - booking.planned_arrival_at::date
        + 1
      )::integer
    end as economic_days_value
  from public.customer_source_bookings_okp booking
  join public.customer_booking_profile_links link
    on link.source = 'OKP'
   and link.source_row_id = booking.source_row_id
   and link.status = 'active'
  where (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
     or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
),
okp_economics as (
  select
    prepared.*,
    case
      when prepared.source_total_amount is null then null
      else (prepared.source_total_amount + prepared.canonical_discount_amount)::numeric(14,2)
    end as list_amount_value,
    (
      prepared.source_total_amount is not null
      and prepared.economic_days_value is not null
      and prepared.economic_days_value > 0
      and (prepared.discount_amount is null or prepared.discount_amount >= 0)
      and (prepared.coupon_amount is null or prepared.coupon_amount >= 0)
    ) as economics_available_value
  from okp_prepared prepared
),
mcp_eap_prepared as (
  select
    link.profile_id as customer_id,
    booking.*,
    case
      when booking.booking_paid is null or booking.promotion_discount_amount is null then null
      else (booking.booking_paid + booking.promotion_discount_amount)::numeric(14,2)
    end as list_amount_value,
    (
      booking.booking_paid is not null
      and booking.promotion_discount_amount is not null
      and booking.promotion_discount_amount >= 0
      and booking.duration_days is not null
      and booking.duration_days > 0
    ) as economics_available_value
  from public.customer_source_bookings_mcp_eap booking
  join public.customer_booking_profile_links link
    on link.source = 'MCP_EAP'
   and link.source_row_id = booking.source_row_id
   and link.status = 'active'
  where booking.booking_status in (1, 8)
)
select
  booking.customer_id,
  'OKP'::text as source,
  booking.source_row_id,
  booking.source_booking_code,
  null::bigint as source_customer_id,
  'OKP'::text as brand,
  booking.parking_normalized as parking,
  booking.source_created_at as purchase_created_at,
  booking.planned_arrival_at,
  booking.planned_departure_at,
  booking.actual_checkin_at,
  booking.actual_checkout_at,
  booking.status_raw as status,
  booking.source_total_amount as amount,
  booking.canonical_discount_amount as discount_amount,
  booking.is_pack,
  booking.passenger_count,
  case
    when booking.planned_arrival_at is null or booking.planned_departure_at is null then null
    else greatest(0, booking.planned_departure_at::date - booking.planned_arrival_at::date)
  end as duration_days,
  booking.source_total_amount as paid_amount,
  booking.list_amount_value as list_amount,
  case
    when booking.economics_available_value and booking.list_amount_value > 0
      then booking.canonical_discount_amount / booking.list_amount_value
    else null
  end as discount_percentage,
  booking.economic_days_value as economic_days,
  case
    when booking.economics_available_value and booking.is_pack is false and booking.is_paid is true
      then booking.source_total_amount / booking.economic_days_value
    else null
  end as paid_adr,
  case
    when booking.economics_available_value and booking.is_pack is false and booking.is_paid is true
      then booking.list_amount_value / booking.economic_days_value
    else null
  end as list_adr,
  (
    booking.economics_available_value
    and booking.is_pack is false
    and booking.is_paid is true
  ) as economic_eligible,
  booking.economics_available_value as economics_available,
  null::text as promotion_code,
  booking.coupon_code
from okp_economics booking
union all
select
  booking.customer_id,
  'MCP_EAP'::text,
  booking.source_row_id,
  booking.source_booking_code,
  booking.source_customer_id,
  booking.brand_normalized,
  booking.parking_normalized,
  booking.source_created_at,
  booking.planned_arrival_at,
  booking.planned_departure_at,
  null::timestamp without time zone,
  null::timestamp without time zone,
  booking.booking_status::text,
  booking.source_total_amount,
  booking.promotion_discount_amount,
  booking.is_pack,
  booking.passenger_count,
  booking.duration_days,
  booking.booking_paid,
  booking.list_amount_value,
  case
    when booking.economics_available_value and booking.list_amount_value > 0
      then booking.promotion_discount_amount / booking.list_amount_value
    else null
  end,
  booking.duration_days,
  case
    when booking.economics_available_value and booking.is_pack is false and booking.paying_status = 1
      then booking.booking_paid / booking.duration_days
    else null
  end,
  case
    when booking.economics_available_value and booking.is_pack is false and booking.paying_status = 1
      then booking.list_amount_value / booking.duration_days
    else null
  end,
  (
    booking.economics_available_value
    and booking.is_pack is false
    and booking.paying_status = 1
  ),
  booking.economics_available_value,
  booking.promotion_code,
  null::text
from mcp_eap_prepared booking;

revoke all on public.customer_window_bookings_v
  from public, anon, authenticated, service_role;
grant select on public.customer_window_bookings_v to service_role;

comment on view public.customer_window_bookings_v is
  'Private unified valid-purchase read model with canonical per-booking economics and source-specific promotion codes. It does not expose identity values.';

commit;
