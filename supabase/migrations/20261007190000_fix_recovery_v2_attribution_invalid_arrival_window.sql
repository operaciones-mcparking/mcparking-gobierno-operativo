-- Keep Recovery V2 attribution compatible with the legacy /recuperacion
-- contract when source intended_arrival_at is earlier than the cart event.

begin;

create or replace view public.v_recovery_attribution_cases_v2_compat as
with candidate_matches as (
  select
    cart.id as cart_id,
    cart.source_id as cart_source_id,
    cart.type as cart_type,
    cart.source_type as cart_source_type,
    cart.form_datetime as cart_form_datetime,
    cart.intended_arrival_at as cart_intended_arrival_at,
    cart.email_normalized as cart_email_normalized,
    cart.phone_normalized as cart_phone_normalized,
    booking.id as purchase_id,
    booking.batch_id as purchase_batch_id,
    booking.booking_created_at as purchase_created_at,
    coalesce(booking.price, 0) as purchase_amount,
    round((extract(epoch from (booking.booking_created_at - cart.form_datetime)) / 3600.0)::numeric, 2) as hours_to_purchase,
    booking.email_normalized as booking_email_normalized,
    booking.phone_normalized as booking_phone_normalized,
    case
      when cart.email_normalized is not null
        and cart.phone_normalized is not null
        and booking.email_normalized = cart.email_normalized
        and booking.phone_normalized = cart.phone_normalized
      then 'email_phone'
      when cart.email_normalized is not null
        and booking.email_normalized = cart.email_normalized
      then 'email'
      when cart.phone_normalized is not null
        and booking.phone_normalized = cart.phone_normalized
      then 'phone'
    end as match_basis
  from public.v_recovery_incomplete_bookings_current_compat as cart
  join public.recovery_bookings_import as booking
    on booking.is_valid_purchase = true
    and booking.booking_created_at is not null
    and cart.form_datetime is not null
    and booking.booking_created_at >= cart.form_datetime
    and booking.booking_created_at <= case
      when cart.intended_arrival_at is not null
        and cart.intended_arrival_at >= cart.form_datetime
      then cart.intended_arrival_at
      else cart.form_datetime + interval '7 days'
    end
    and (
      (cart.email_normalized is not null and booking.email_normalized = cart.email_normalized)
      or (cart.phone_normalized is not null and booking.phone_normalized = cart.phone_normalized)
    )
),
ranked as (
  select
    *,
    row_number() over (
      partition by purchase_id
      order by
        case match_basis when 'email_phone' then 1 when 'email' then 2 when 'phone' then 3 else 4 end,
        case cart_type when 'canceled' then 1 when 'abandoned' then 2 else 3 end,
        cart_form_datetime desc,
        cart_id
    ) as booking_rank,
    row_number() over (
      partition by cart_id
      order by
        purchase_created_at asc,
        case match_basis when 'email_phone' then 1 when 'email' then 2 when 'phone' then 3 else 4 end,
        purchase_id
    ) as cart_rank
  from candidate_matches
  where match_basis is not null
)
select
  cart_id,
  cart_source_id,
  cart_type,
  cart_source_type,
  cart_form_datetime,
  cart_intended_arrival_at,
  purchase_id,
  purchase_batch_id,
  purchase_created_at,
  purchase_amount,
  hours_to_purchase,
  match_basis,
  case match_basis
    when 'email_phone' then 'high'
    when 'email' then 'medium'
    when 'phone' then 'medium'
    else 'low'
  end as confidence,
  match_basis as match_type,
  hours_to_purchase <= 24 as recovered_24h,
  hours_to_purchase <= 48 as recovered_48h,
  true as recovered_7d,
  case match_basis
    when 'email_phone' then 'email_and_phone_match'
    when 'email' then 'email_match'
    when 'phone' then 'phone_match'
  end as attribution_reason,
  purchase_created_at as created_at
from ranked
where booking_rank = 1
  and cart_rank = 1;

comment on view public.v_recovery_attribution_cases_v2_compat is
  'Read-only Recovery V2 attribution compatibility view using V2 cart compat rows and legacy purchase rows. Invalid intended_arrival_at values before form_datetime fall back to the 7-day cart window.';

commit;
