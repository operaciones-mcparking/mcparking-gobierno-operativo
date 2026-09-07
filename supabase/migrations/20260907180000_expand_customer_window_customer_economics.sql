begin;

create or replace function public.customer_window_get_customer_economics(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with customer_exists as (
  select 1
  from public.customer_profiles profile
  where profile.id = p_customer_id
    and profile.status = 'active'
),
bookings as materialized (
  select
    booking.*,
    case
      when booking.source = 'MCP_EAP' and booking.brand = 'MCP' then 'MCP'
      when booking.source = 'MCP_EAP' and booking.brand = 'EAP' then 'EAP'
      when booking.source = 'OKP'
       and booking.parking in ('OKP_RC', 'OKP_EXP', 'OKP_PREMIUM', 'OKP_FIDAE')
        then booking.parking
      else null
    end as parking_key
  from public.customer_window_bookings_v booking
  where booking.customer_id = p_customer_id
),
eligible_boletas as materialized (
  select *
  from bookings booking
  where booking.is_pack is false
    and booking.economic_eligible is true
    and booking.economics_available is true
),
total_economics as (
  select
    count(*)::bigint as boleta_count,
    count(*) filter (where booking.discount_amount > 0)::bigint as discounted_boleta_count,
    sum(booking.paid_amount)::numeric(18,2) as paid_amount,
    sum(booking.list_amount)::numeric(18,2) as list_amount,
    sum(booking.discount_amount)::numeric(18,2) as discount_amount,
    sum(booking.economic_days)::bigint as economic_days
  from eligible_boletas booking
),
parking_economics as (
  select
    booking.parking_key,
    count(*)::bigint as booking_count,
    count(*) filter (where booking.discount_amount > 0)::bigint as discounted_booking_count,
    sum(booking.paid_amount)::numeric(18,2) as paid_amount,
    sum(booking.list_amount)::numeric(18,2) as list_amount,
    sum(booking.discount_amount)::numeric(18,2) as discount_amount,
    sum(booking.economic_days)::bigint as economic_days
  from eligible_boletas booking
  where booking.parking_key is not null
  group by booking.parking_key
),
parking_payload as (
  select coalesce(
    jsonb_object_agg(
      economics.parking_key,
      jsonb_build_object(
        'bookingCount', economics.booking_count,
        'paidAmount', economics.paid_amount,
        'listAmount', economics.list_amount,
        'discountAmount', economics.discount_amount,
        'economicDays', economics.economic_days,
        'averageBoletaTicket', economics.paid_amount / nullif(economics.booking_count, 0),
        'paidAdr', economics.paid_amount / nullif(economics.economic_days, 0),
        'listAdr', economics.list_amount / nullif(economics.economic_days, 0),
        'weightedDiscountPct', economics.discount_amount / nullif(economics.list_amount, 0),
        'discountedBookingCount', economics.discounted_booking_count,
        'discountUsagePct', economics.discounted_booking_count::numeric / nullif(economics.booking_count, 0)
      ) order by economics.parking_key
    ),
    '{}'::jsonb
  ) as value
  from parking_economics economics
),
discount_code_counts as (
  select
    booking.source,
    case
      when booking.source = 'OKP' then booking.coupon_code
      else booking.promotion_code
    end as code,
    count(*)::bigint as uses,
    max(booking.purchase_created_at) as last_used_at
  from eligible_boletas booking
  where case
    when booking.source = 'OKP' then booking.coupon_code
    else booking.promotion_code
  end is not null
  group by
    booking.source,
    case
      when booking.source = 'OKP' then booking.coupon_code
      else booking.promotion_code
    end
),
discount_codes as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source', code.source,
        'code', code.code,
        'uses', code.uses,
        'lastUsedAt', code.last_used_at
      ) order by code.uses desc, code.last_used_at desc, code.source, code.code
    ),
    '[]'::jsonb
  ) as value
  from discount_code_counts code
)
select case
  when not exists (select 1 from customer_exists) then
    jsonb_build_object('ok', false, 'code', 'customer_not_found')
  else
    jsonb_build_object(
      'ok', true,
      'code', 'customer_economics_found',
      'customerId', p_customer_id,
      'total', jsonb_build_object(
        'paidAmount', total.paid_amount,
        'listAmount', total.list_amount,
        'discountAmount', total.discount_amount,
        'economicDays', total.economic_days,
        'averageBoletaTicket', total.paid_amount / nullif(total.boleta_count, 0),
        'paidAdr', total.paid_amount / nullif(total.economic_days, 0),
        'listAdr', total.list_amount / nullif(total.economic_days, 0),
        'weightedDiscountPct', total.discount_amount / nullif(total.list_amount, 0),
        'boletaCount', total.boleta_count,
        'discountedBoletaCount', total.discounted_boleta_count,
        'discountUsagePct', total.discounted_boleta_count::numeric / nullif(total.boleta_count, 0),
        'packCount', (select count(*)::bigint from bookings booking where booking.is_pack is true),
        'totalReservations', (select count(*)::bigint from bookings)
      ),
      'byParking', parking.value,
      'discountCodes', codes.value
    )
end
from total_economics total
cross join parking_payload parking
cross join discount_codes codes;
$function$;

revoke all on function public.customer_window_get_customer_economics(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_window_get_customer_economics(uuid)
  to service_role;

comment on function public.customer_window_get_customer_economics(uuid) is
  'Returns historical booking economics, including average eligible boleta ticket, for one active Customer Window profile.';

commit;
