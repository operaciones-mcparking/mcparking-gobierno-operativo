begin;

create view public.customer_window_bookings_v
with (security_invoker = true)
as
select
  link.profile_id as customer_id,
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
  booking.discount_amount,
  booking.is_pack,
  booking.passenger_count,
  case
    when booking.planned_arrival_at is null or booking.planned_departure_at is null then null
    else greatest(0, booking.planned_departure_at::date - booking.planned_arrival_at::date)
  end as duration_days
from public.customer_source_bookings_okp booking
join public.customer_booking_profile_links link
  on link.source = 'OKP'
 and link.source_row_id = booking.source_row_id
 and link.status in ('active', 'candidate', 'conflict')
where (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
   or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
union all
select
  link.profile_id,
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
  booking.duration_days
from public.customer_source_bookings_mcp_eap booking
join public.customer_booking_profile_links link
  on link.source = 'MCP_EAP'
 and link.source_row_id = booking.source_row_id
 and link.status in ('active', 'candidate', 'conflict')
where booking.booking_status in (1, 8);

revoke all on public.customer_window_bookings_v from public, anon, authenticated, service_role;
grant select on public.customer_window_bookings_v to service_role;

create or replace function public.customer_window_list_customer_bookings(
  p_customer_id uuid,
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with scoped as (
    select *
    from public.customer_window_bookings_v booking
    where booking.customer_id = p_customer_id
  ),
  paged as (
    select *
    from scoped
    order by purchase_created_at desc nulls last, source desc, source_row_id desc
    limit greatest(1, least(coalesce(p_page_size, 50), 100))
    offset (greatest(coalesce(p_page, 1), 1) - 1)
      * greatest(1, least(coalesce(p_page_size, 50), 100))
  )
  select pg_catalog.jsonb_build_object(
    'items', coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(paged)
      order by paged.purchase_created_at desc nulls last, paged.source desc, paged.source_row_id desc), '[]'::jsonb),
    'total', (select count(*)::bigint from scoped)
  )
  from paged;
$$;

create or replace function public.customer_window_get_customer_summary(
  p_customer_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with profile as (
    select * from public.customer_profiles where id = p_customer_id and status = 'active'
  ),
  bookings as (
    select * from public.customer_window_bookings_v where customer_id = p_customer_id
  ),
  latest as (
    select brand, parking
    from bookings
    order by purchase_created_at desc nulls last, source desc, source_row_id desc
    limit 1
  ),
  identity_counts as (
    select
      count(distinct identity_value_normalized) filter (where identity_type = 'phone')::integer as phones,
      count(distinct identity_value_normalized) filter (where identity_type = 'email')::integer as emails,
      count(distinct identity_value_normalized) filter (where identity_type = 'plate')::integer as plates
    from public.customer_identity_links
    where profile_id = p_customer_id and status in ('active', 'candidate', 'conflict')
  )
  select case when not exists (select 1 from profile) then
    pg_catalog.jsonb_build_object('ok', false, 'code', 'customer_not_found')
  else pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'customer_found',
    'customerId', p_customer_id,
    'firstPurchaseAt', (select min(purchase_created_at) from bookings),
    'lastPurchaseAt', (select max(purchase_created_at) from bookings),
    'purchaseCount', (select count(*)::bigint from bookings),
    'totalSpend', (select sum(amount) from bookings),
    'averageTicket', (select avg(amount) from bookings),
    'totalDurationDays', (select sum(duration_days) from bookings),
    'mcpCount', (select count(*)::bigint from bookings where brand = 'MCP'),
    'eapCount', (select count(*)::bigint from bookings where brand = 'EAP'),
    'okpCount', (select count(*)::bigint from bookings where brand = 'OKP'),
    'packCount', (select count(*)::bigint from bookings where is_pack is true),
    'nonPackCount', (select count(*)::bigint from bookings where is_pack is false),
    'futureBookingCount', (select count(*)::bigint from bookings
      where planned_arrival_at::date > pg_catalog.timezone('America/Santiago', pg_catalog.now())::date),
    'lastBrand', (select brand from latest),
    'lastParking', (select parking from latest),
    'knownPhonesCount', (select phones from identity_counts),
    'knownEmailsCount', (select emails from identity_counts),
    'knownPlatesCount', (select plates from identity_counts),
    'needsReview', (select needs_review from profile)
  ) end;
$$;

create or replace function public.customer_window_search_customers(
  p_identity_type text,
  p_identity_value text,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_identity_type not in ('phone', 'email', 'plate', 'booking_code', 'source_customer_id') then
    raise exception 'Unsupported search type' using errcode = '22023';
  end if;
  if nullif(trim(p_identity_value), '') is null or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid search parameters' using errcode = '22023';
  end if;

  with matches as (
    select distinct link.profile_id as customer_id, p_identity_type as matched_identity_type
    from public.customer_identity_links identity_link
    join public.customer_booking_profile_links link on link.profile_id = identity_link.profile_id
    where p_identity_type in ('phone', 'email', 'plate', 'source_customer_id')
      and identity_link.identity_type = p_identity_type
      and identity_link.identity_value_normalized = trim(p_identity_value)
      and identity_link.status in ('active', 'candidate', 'conflict')
    union
    select distinct booking.customer_id, 'booking_code'::text
    from public.customer_window_bookings_v booking
    where p_identity_type = 'booking_code'
      and booking.source_booking_code = trim(p_identity_value)
  ),
  limited as (
    select matches.customer_id, matches.matched_identity_type,
      profile.needs_review, profile.identity_confidence
    from matches
    join public.customer_profiles profile on profile.id = matches.customer_id
    where profile.status = 'active'
    order by profile.needs_review, matches.customer_id
    limit p_limit
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(limited)), '[]'::jsonb)
  into v_result
  from limited;

  return pg_catalog.jsonb_build_object('items', v_result);
end;
$$;

revoke all on function public.customer_window_list_customer_bookings(uuid, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_get_customer_summary(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_search_customers(text, text, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_window_list_customer_bookings(uuid, integer, integer) to service_role;
grant execute on function public.customer_window_get_customer_summary(uuid) to service_role;
grant execute on function public.customer_window_search_customers(text, text, integer) to service_role;

comment on view public.customer_window_bookings_v is
  'Private unified valid-purchase read model. It does not duplicate source bookings or expose identity values.';

commit;
