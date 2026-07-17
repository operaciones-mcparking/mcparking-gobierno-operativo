-- Read-only recovery attribution cases.
-- This view attributes each valid purchase to at most one prior cart within 7 days,
-- and each cart to its first attributed valid purchase. It does not expose PII.

create or replace view public.v_recovery_attribution_cases
with (security_invoker = true)
as
with carts as (
  select
    id as cart_id,
    batch_id as cart_batch_id,
    type as cart_type,
    parking_code,
    form_datetime as cart_form_datetime,
    message_sent,
    email_normalized,
    phone_normalized
  from public.recovery_incomplete_bookings_import
),
purchases as (
  select
    id as purchase_id,
    batch_id as purchase_batch_id,
    booking_created_at as purchase_created_at,
    price as purchase_amount,
    email_normalized,
    phone_normalized
  from public.recovery_bookings_import
  where is_valid_purchase = true
    and booking_created_at is not null
),
candidate_matches as (
  select
    carts.cart_id,
    carts.cart_batch_id,
    carts.cart_type,
    carts.parking_code,
    carts.cart_form_datetime,
    carts.message_sent,
    purchases.purchase_id,
    purchases.purchase_batch_id,
    purchases.purchase_created_at,
    coalesce(purchases.purchase_amount, 0) as purchase_amount,
    round((extract(epoch from (purchases.purchase_created_at - carts.cart_form_datetime)) / 3600.0)::numeric, 2) as hours_to_purchase,
    case
      when carts.email_normalized is not null
        and purchases.email_normalized = carts.email_normalized
        and carts.phone_normalized is not null
        and purchases.phone_normalized = carts.phone_normalized
        then 'high'
      when carts.phone_normalized is not null
        and purchases.phone_normalized = carts.phone_normalized
        then 'medium'
      when carts.email_normalized is not null
        and purchases.email_normalized = carts.email_normalized
        then 'low'
    end as confidence,
    case
      when carts.email_normalized is not null
        and purchases.email_normalized = carts.email_normalized
        and carts.phone_normalized is not null
        and purchases.phone_normalized = carts.phone_normalized
        then 'email_phone'
      when carts.phone_normalized is not null
        and purchases.phone_normalized = carts.phone_normalized
        then 'phone'
      when carts.email_normalized is not null
        and purchases.email_normalized = carts.email_normalized
        then 'email'
    end as match_type,
    case
      when carts.email_normalized is not null
        and purchases.email_normalized = carts.email_normalized
        and carts.phone_normalized is not null
        and purchases.phone_normalized = carts.phone_normalized
        then 'email_and_phone_match'
      when carts.phone_normalized is not null
        and purchases.phone_normalized = carts.phone_normalized
        then 'phone_match'
      when carts.email_normalized is not null
        and purchases.email_normalized = carts.email_normalized
        then 'email_match'
    end as attribution_reason,
    case
      when carts.email_normalized is not null
        and purchases.email_normalized = carts.email_normalized
        and carts.phone_normalized is not null
        and purchases.phone_normalized = carts.phone_normalized
        then 1
      when carts.phone_normalized is not null
        and purchases.phone_normalized = carts.phone_normalized
        then 2
      when carts.email_normalized is not null
        and purchases.email_normalized = carts.email_normalized
        then 3
      else 9
    end as confidence_rank
  from carts
  join purchases
    on purchases.purchase_created_at >= carts.cart_form_datetime
   and purchases.purchase_created_at < carts.cart_form_datetime + interval '7 days'
   and (
      (carts.email_normalized is not null and purchases.email_normalized = carts.email_normalized)
      or
      (carts.phone_normalized is not null and purchases.phone_normalized = carts.phone_normalized)
   )
  where carts.cart_form_datetime is not null
    and (carts.email_normalized is not null or carts.phone_normalized is not null)
),
purchase_ranked as (
  select
    candidate_matches.*,
    row_number() over (
      partition by purchase_id
      order by cart_form_datetime desc, confidence_rank asc, cart_id
    ) as purchase_match_rank
  from candidate_matches
),
purchase_attributed as (
  select *
  from purchase_ranked
  where purchase_match_rank = 1
),
cart_ranked as (
  select
    purchase_attributed.*,
    row_number() over (
      partition by cart_id
      order by purchase_created_at asc, confidence_rank asc, purchase_id
    ) as cart_purchase_rank
  from purchase_attributed
),
attributed as (
  select *
  from cart_ranked
  where cart_purchase_rank = 1
)
select
  cart_id,
  cart_batch_id,
  cart_type,
  parking_code,
  cart_form_datetime,
  message_sent,
  purchase_id,
  purchase_batch_id,
  purchase_created_at,
  purchase_amount,
  hours_to_purchase,
  confidence,
  match_type,
  hours_to_purchase <= 24 as recovered_24h,
  hours_to_purchase <= 48 as recovered_48h,
  true as recovered_7d,
  attribution_reason,
  purchase_created_at as created_at
from attributed;

comment on view public.v_recovery_attribution_cases is
  'Read-only recovery attribution view. Attributes the first valid purchase within 7 days to the most recent prior cart, exposes only non-PII operational fields, and omits email, phone, source ids, booking ids, message ids and file hashes.';

revoke all on public.v_recovery_attribution_cases from anon;
grant select on public.v_recovery_attribution_cases to authenticated;
