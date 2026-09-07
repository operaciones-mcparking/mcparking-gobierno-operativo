begin;

create or replace function public.customer_window_get_purchase_period_facets(
  p_from date,
  p_to date,
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
    select link.profile_id as customer_id, 'OKP'::text as family
    from public.customer_source_bookings_okp booking
    join public.customer_booking_profile_links link
      on link.source = 'OKP'
     and link.source_row_id = booking.source_row_id
     and link.status = 'active'
    where booking.source_created_at >= p_from::timestamp without time zone
      and booking.source_created_at < (p_to + 1)::timestamp without time zone
      and (
        (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
        or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
      )
    union all
    select link.profile_id, 'MCP_EAP'::text
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_booking_profile_links link
      on link.source = 'MCP_EAP'
     and link.source_row_id = booking.source_row_id
     and link.status = 'active'
    where booking.source_created_at >= p_from::timestamp without time zone
      and booking.source_created_at < (p_to + 1)::timestamp without time zone
      and booking.booking_status in (1, 8)
  ),
  period_customers as materialized (
    select
      customer_id,
      pg_catalog.bool_or(family = 'MCP_EAP') as has_mcp_eap,
      pg_catalog.bool_or(family = 'OKP') as has_okp
    from period_bookings
    group by customer_id
  ),
  filtered as materialized (
    select
      period.customer_id,
      period.has_mcp_eap,
      period.has_okp,
      metrics.lifecycle_status,
      metrics.pack_status,
      metrics.brand_behavior
    from period_customers period
    join public.customer_profile_metrics metrics on metrics.customer_id = period.customer_id
    join public.customer_profiles profile on profile.id = period.customer_id and profile.status = 'active'
    where (p_lifecycle_status is null or metrics.lifecycle_status = p_lifecycle_status)
      and (p_tier is null or metrics.tier = p_tier)
      and (p_pack_status is null or metrics.pack_status = p_pack_status)
      and (p_brand_behavior is null or metrics.brand_behavior = p_brand_behavior)
  )
  select pg_catalog.jsonb_build_object(
    'totalCustomers', count(*)::bigint,
    'newCustomers', count(*) filter (where lifecycle_status = 'NEW'),
    'newMcpEapOnlyCustomers', count(*) filter (where lifecycle_status = 'NEW' and has_mcp_eap and not has_okp),
    'newOkpOnlyCustomers', count(*) filter (where lifecycle_status = 'NEW' and has_okp and not has_mcp_eap),
    'newBothCustomers', count(*) filter (where lifecycle_status = 'NEW' and has_mcp_eap and has_okp),
    'frequentCustomers', count(*) filter (where lifecycle_status = 'FREQUENT'),
    'frequentMcpEapOnlyCustomers', count(*) filter (where lifecycle_status = 'FREQUENT' and has_mcp_eap and not has_okp),
    'frequentOkpOnlyCustomers', count(*) filter (where lifecycle_status = 'FREQUENT' and has_okp and not has_mcp_eap),
    'frequentBothCustomers', count(*) filter (where lifecycle_status = 'FREQUENT' and has_mcp_eap and has_okp),
    'packCustomers', count(*) filter (where pack_status = 'PACK'),
    'packMcpEapOnlyCustomers', count(*) filter (where pack_status = 'PACK' and has_mcp_eap and not has_okp),
    'packOkpOnlyCustomers', count(*) filter (where pack_status = 'PACK' and has_okp and not has_mcp_eap),
    'packBothCustomers', count(*) filter (where pack_status = 'PACK' and has_mcp_eap and has_okp),
    'nonPackCustomers', count(*) filter (where pack_status = 'NO_PACK'),
    'nonPackMcpEapOnlyCustomers', count(*) filter (where pack_status = 'NO_PACK' and has_mcp_eap and not has_okp),
    'nonPackOkpOnlyCustomers', count(*) filter (where pack_status = 'NO_PACK' and has_okp and not has_mcp_eap),
    'nonPackBothCustomers', count(*) filter (where pack_status = 'NO_PACK' and has_mcp_eap and has_okp),
    'onlyMcpEapCustomers', count(*) filter (where brand_behavior = 'ONLY_MCP_EAP'),
    'onlyOkpCustomers', count(*) filter (where brand_behavior = 'ONLY_OKP'),
    'migratedToMcpEapCustomers', count(*) filter (where brand_behavior = 'MIGRATED_TO_MCP_EAP'),
    'migratedToOkpCustomers', count(*) filter (where brand_behavior = 'MIGRATED_TO_OKP'),
    'alternatingCustomers', count(*) filter (where brand_behavior = 'ALTERNATING')
  ) into v_result
  from filtered;

  return v_result;
end;
$$;

revoke all on function public.customer_window_get_purchase_period_facets(
  date, date, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.customer_window_get_purchase_period_facets(
  date, date, text, text, text, text
) to service_role;

comment on function public.customer_window_get_purchase_period_facets(
  date, date, text, text, text, text
) is 'Returns non-PII Customer Window facets and exclusive period-family breakdowns for unique customers with confirmed purchases in an inclusive Santiago calendar-date period.';

commit;
