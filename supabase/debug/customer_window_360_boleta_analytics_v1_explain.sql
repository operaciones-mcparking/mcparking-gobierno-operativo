begin transaction read only;

explain (verbose, costs, settings)
with requested_profiles as materialized (
  select profile.id as customer_id
  from public.customer_profiles profile
  where profile.id = any(array['7ddecd4b-6e5d-459d-a968-1c030141209a'::uuid])
    and profile.status = 'active'
    and profile.merged_into_profile_id is null
),
selected_links as materialized (
  select link.profile_id, link.source, link.source_row_id
  from public.customer_booking_profile_links link
  join requested_profiles profile on profile.customer_id = link.profile_id
  where link.status = 'active'
),
valid_bookings as materialized (
  select
    link.profile_id as customer_id,
    'MCP_EAP'::text as source,
    booking.source_row_id,
    booking.source_created_at as purchase_created_at,
    booking.planned_arrival_at,
    booking.is_pack,
    booking.brand_normalized as brand,
    booking.parking_normalized as parking,
    parking_rule.parking_family,
    booking.booking_paid as paid_amount,
    case when booking.booking_paid is null or booking.promotion_discount_amount is null then null
      else (booking.booking_paid + booking.promotion_discount_amount)::numeric(14,2) end as list_amount,
    booking.promotion_discount_amount as discount_amount,
    booking.duration_days as economic_days,
    (
      booking.booking_paid is not null
      and booking.promotion_discount_amount is not null
      and booking.promotion_discount_amount >= 0
      and booking.duration_days is not null
      and booking.duration_days > 0
      and booking.paying_status = 1
      and booking.is_pack is false
    ) as economic_eligible,
    case when booking.source_created_at is null or booking.planned_arrival_at is null then null
      else booking.planned_arrival_at::date - booking.source_created_at::date end as booking_lead_days,
    booking.promotion_code,
    null::text as coupon_code
  from selected_links link
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = link.source
   and booking.source_row_id = link.source_row_id
   and link.source = 'MCP_EAP'
  left join public.customer_window_parking_family_rules parking_rule
    on parking_rule.source = 'MCP_EAP' and parking_rule.parking = booking.parking_normalized
  where booking.booking_status in (1, 8)

  union all

  select
    link.profile_id,
    'OKP'::text,
    booking.source_row_id,
    booking.source_created_at,
    booking.planned_arrival_at,
    booking.is_pack,
    'OKP'::text,
    booking.parking_normalized,
    coalesce(parking_rule.parking_family, 'OKP_OTROS'),
    booking.source_total_amount,
    case when booking.source_total_amount is null then null
      else (booking.source_total_amount + coalesce(booking.discount_amount, 0) + coalesce(booking.coupon_amount, 0))::numeric(14,2) end,
    (coalesce(booking.discount_amount, 0) + coalesce(booking.coupon_amount, 0))::numeric(14,2),
    case when booking.planned_arrival_at is null or booking.planned_departure_at is null then null
      else (booking.planned_departure_at::date - booking.planned_arrival_at::date + 1)::integer end,
    (
      booking.source_total_amount is not null
      and booking.planned_arrival_at is not null
      and booking.planned_departure_at is not null
      and booking.planned_departure_at::date - booking.planned_arrival_at::date + 1 > 0
      and (booking.discount_amount is null or booking.discount_amount >= 0)
      and (booking.coupon_amount is null or booking.coupon_amount >= 0)
      and booking.is_paid is true
      and booking.is_pack is false
    ),
    case when booking.source_created_at is null or booking.planned_arrival_at is null then null
      else booking.planned_arrival_at::date - booking.source_created_at::date end,
    null::text,
    booking.coupon_code
  from selected_links link
  join public.customer_source_bookings_okp booking
    on booking.source = link.source
   and booking.source_row_id = link.source_row_id
   and link.source = 'OKP'
  left join public.customer_window_parking_family_rules parking_rule
    on parking_rule.source = 'OKP' and parking_rule.parking = booking.parking_normalized
  where (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
     or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
)
select *
from valid_bookings;

rollback;
