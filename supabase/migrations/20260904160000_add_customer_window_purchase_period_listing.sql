begin;

create or replace function public.customer_window_list_customers_by_purchase_period(
  p_from date,
  p_to date,
  p_family text,
  p_page integer default 1,
  p_page_size integer default 25,
  p_lifecycle_status text default null,
  p_tier text default null,
  p_pack_status text default null,
  p_brand_behavior text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid purchase period' using errcode = '22023';
  end if;
  if p_family not in ('MCP_EAP', 'OKP') then
    raise exception 'Invalid purchase family' using errcode = '22023';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'Invalid pagination' using errcode = '22023';
  end if;
  if p_lifecycle_status is not null and p_lifecycle_status not in ('NEW', 'FREQUENT') then
    raise exception 'Invalid lifecycle status' using errcode = '22023';
  end if;
  if p_tier is not null and p_tier not in ('IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND') then
    raise exception 'Invalid tier' using errcode = '22023';
  end if;
  if p_pack_status is not null and p_pack_status not in ('PACK', 'NO_PACK') then
    raise exception 'Invalid pack status' using errcode = '22023';
  end if;
  if p_brand_behavior is not null and p_brand_behavior not in ('ONLY_MCP_EAP', 'ONLY_OKP', 'MIGRATED_TO_MCP_EAP', 'MIGRATED_TO_OKP', 'ALTERNATING') then
    raise exception 'Invalid brand behavior' using errcode = '22023';
  end if;

  with period_bookings as materialized (
    select link.profile_id as customer_id, booking.source_created_at as purchase_created_at
    from public.customer_source_bookings_okp booking
    join public.customer_booking_profile_links link
      on link.source = 'OKP'
     and link.source_row_id = booking.source_row_id
     and link.status = 'active'
    where p_family = 'OKP'
      and booking.source_created_at >= p_from::timestamp without time zone
      and booking.source_created_at < (p_to + 1)::timestamp without time zone
      and (
        (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
        or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
      )
    union all
    select link.profile_id, booking.source_created_at
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_booking_profile_links link
      on link.source = 'MCP_EAP'
     and link.source_row_id = booking.source_row_id
     and link.status = 'active'
    where p_family = 'MCP_EAP'
      and booking.source_created_at >= p_from::timestamp without time zone
      and booking.source_created_at < (p_to + 1)::timestamp without time zone
      and booking.booking_status in (1, 8)
  ),
  period_customers as (
    select
      customer_id,
      count(*)::bigint as purchases_in_period,
      min(purchase_created_at) as first_purchase_in_period,
      max(purchase_created_at) as last_purchase_in_period
    from period_bookings
    group by customer_id
  ),
  filtered as materialized (
    select
      period.customer_id,
      period.purchases_in_period,
      period.first_purchase_in_period,
      period.last_purchase_in_period,
      metrics.lifecycle_status,
      metrics.tier,
      metrics.total_reservations,
      metrics.reservations_12m,
      metrics.reservations_24m,
      metrics.mcp_count,
      metrics.eap_count,
      metrics.okp_count,
      metrics.okp_express_count,
      metrics.okp_rio_clarillo_count,
      metrics.okp_otros_count,
      metrics.pack_status,
      metrics.brand_behavior,
      metrics.first_purchase_at,
      metrics.last_purchase_at,
      metrics.last_brand,
      metrics.last_parking,
      metrics.future_booking_count,
      profile.needs_review
    from period_customers period
    join public.customer_profile_metrics metrics on metrics.customer_id = period.customer_id
    join public.customer_profiles profile on profile.id = period.customer_id and profile.status = 'active'
    where (p_lifecycle_status is null or metrics.lifecycle_status = p_lifecycle_status)
      and (p_tier is null or metrics.tier = p_tier)
      and (p_pack_status is null or metrics.pack_status = p_pack_status)
      and (p_brand_behavior is null or metrics.brand_behavior = p_brand_behavior)
  ),
  paged as (
    select *
    from filtered
    order by last_purchase_in_period desc, customer_id
    limit p_page_size offset (p_page - 1) * p_page_size
  )
  select pg_catalog.jsonb_build_object(
    'items', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'customerId', paged.customer_id,
          'purchasesInPeriod', paged.purchases_in_period,
          'firstPurchaseInPeriod', paged.first_purchase_in_period,
          'lastPurchaseInPeriod', paged.last_purchase_in_period,
          'lifecycleStatus', paged.lifecycle_status,
          'tier', paged.tier,
          'totalReservations', paged.total_reservations,
          'reservations12m', paged.reservations_12m,
          'reservations24m', paged.reservations_24m,
          'mcpCount', paged.mcp_count,
          'eapCount', paged.eap_count,
          'okpCount', paged.okp_count,
          'okpExpressCount', paged.okp_express_count,
          'okpRioClarilloCount', paged.okp_rio_clarillo_count,
          'okpOtrosCount', paged.okp_otros_count,
          'packStatus', paged.pack_status,
          'brandBehavior', paged.brand_behavior,
          'firstPurchaseAt', paged.first_purchase_at,
          'lastPurchaseAt', paged.last_purchase_at,
          'lastBrand', paged.last_brand,
          'lastParking', paged.last_parking,
          'futureBookingCount', paged.future_booking_count,
          'needsReview', paged.needs_review
        ) order by paged.last_purchase_in_period desc, paged.customer_id
      ) from paged
    ), '[]'::jsonb),
    'total', (select count(*)::bigint from filtered),
    'page', p_page,
    'pageSize', p_page_size
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.customer_window_list_customers_by_purchase_period(
  date, date, text, integer, integer, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.customer_window_list_customers_by_purchase_period(
  date, date, text, integer, integer, text, text, text, text
) to service_role;

comment on function public.customer_window_list_customers_by_purchase_period(
  date, date, text, integer, integer, text, text, text, text
) is 'Lists customers with confirmed purchases in an inclusive Santiago calendar-date period and one requested commercial family.';

commit;
