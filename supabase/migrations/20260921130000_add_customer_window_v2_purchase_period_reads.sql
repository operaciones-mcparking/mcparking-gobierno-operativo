begin;

create or replace function public.customer_window_v2_list_representations_by_purchase_period(
  p_from date,
  p_to date,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active_snapshot_count integer;
  v_snapshot_id uuid;
  v_missing_metrics bigint;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid purchase period' using errcode = '22023';
  end if;
  if p_page is null or p_page < 1
    or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'Invalid pagination' using errcode = '22023';
  end if;

  select authority.active_snapshot_count, authority.snapshot_id
  into v_active_snapshot_count, v_snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority;

  if v_active_snapshot_count <> 1 or v_snapshot_id is null then
    raise exception 'Customer Window v2 requires exactly one active snapshot'
      using errcode = 'P0001';
  end if;

  with period_representations as materialized (
    select
      representation.snapshot_id,
      representation.representation_type,
      representation.representation_id,
      representation.representation_key,
      representation.customer_id,
      representation.related_group_id,
      count(*)::bigint as reservations_in_period,
      max(booking.source_created_at) as last_booking_at_in_period
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = booking.source
     and representation.source_row_id = booking.source_row_id
    where booking.source = 'MCP_EAP'
      and booking.booking_status in (1, 8)
      and booking.source_created_at >= p_from::timestamp without time zone
      and booking.source_created_at < (p_to + 1)::timestamp without time zone
    group by
      representation.snapshot_id,
      representation.representation_type,
      representation.representation_id,
      representation.representation_key,
      representation.customer_id,
      representation.related_group_id
  ),
  enriched as materialized (
    select
      period.representation_type,
      period.representation_id,
      period.representation_key,
      period.customer_id,
      period.related_group_id,
      case period.representation_type
        when 'confirmed_customer' then profile_metrics.total_reservations
        when 'related_review' then related_metrics.total_reservations
      end as total_reservations,
      case period.representation_type
        when 'confirmed_customer' then profile_metrics.first_purchase_at
        when 'related_review' then related_metrics.first_purchase_at
      end as first_purchase_at,
      case period.representation_type
        when 'confirmed_customer' then profile_metrics.last_purchase_at
        when 'related_review' then related_metrics.last_purchase_at
      end as last_purchase_at,
      case period.representation_type
        when 'confirmed_customer' then 'all_confirmed_sources'::text
        when 'related_review' then 'mcp_eap_active_snapshot'::text
      end as metric_scope,
      period.reservations_in_period,
      period.last_booking_at_in_period
    from period_representations period
    left join public.customer_profile_metrics profile_metrics
      on period.representation_type = 'confirmed_customer'
     and profile_metrics.customer_id = period.customer_id
    left join public.customer_related_review_metrics related_metrics
      on period.representation_type = 'related_review'
     and related_metrics.snapshot_id = period.snapshot_id
     and related_metrics.group_id = period.related_group_id
  ),
  paged as (
    select *
    from enriched
    order by last_booking_at_in_period desc, representation_key asc
    limit p_page_size offset (p_page - 1) * p_page_size
  )
  select
    pg_catalog.jsonb_build_object(
      'items', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'representationType', paged.representation_type,
            'representationId', paged.representation_id,
            'representationKey', paged.representation_key,
            'customerId', paged.customer_id,
            'relatedGroupId', paged.related_group_id,
            'totalReservations', paged.total_reservations,
            'firstPurchaseAt', paged.first_purchase_at,
            'lastPurchaseAt', paged.last_purchase_at,
            'metricScope', paged.metric_scope,
            'reservationsInPeriod', paged.reservations_in_period,
            'lastBookingAtInPeriod', paged.last_booking_at_in_period
          ) order by paged.last_booking_at_in_period desc, paged.representation_key asc
        )
        from paged
      ), '[]'::jsonb),
      'total', (select count(*)::bigint from enriched),
      'page', p_page,
      'pageSize', p_page_size
    ),
    count(*) filter (
      where enriched.total_reservations is null
        or enriched.first_purchase_at is null
        or enriched.last_purchase_at is null
        or enriched.metric_scope is null
    )::bigint
  into v_result, v_missing_metrics
  from enriched;

  if v_missing_metrics <> 0 then
    raise exception 'Customer Window v2 representation metrics are incomplete'
      using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

create or replace function public.customer_window_v2_get_purchase_period_facets(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active_snapshot_count integer;
  v_snapshot_id uuid;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid purchase period' using errcode = '22023';
  end if;

  select authority.active_snapshot_count, authority.snapshot_id
  into v_active_snapshot_count, v_snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority;

  if v_active_snapshot_count <> 1 or v_snapshot_id is null then
    raise exception 'Customer Window v2 requires exactly one active snapshot'
      using errcode = 'P0001';
  end if;

  with period_representations as materialized (
    select
      representation.representation_key,
      representation.representation_type,
      count(*)::bigint as bookings_in_period
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = booking.source
     and representation.source_row_id = booking.source_row_id
    where booking.source = 'MCP_EAP'
      and booking.booking_status in (1, 8)
      and booking.source_created_at >= p_from::timestamp without time zone
      and booking.source_created_at < (p_to + 1)::timestamp without time zone
    group by representation.representation_key, representation.representation_type
  )
  select pg_catalog.jsonb_build_object(
    'totalRepresentations', count(*)::bigint,
    'confirmedRepresentations', count(*) filter (
      where representation_type = 'confirmed_customer'
    )::bigint,
    'relatedReviewRepresentations', count(*) filter (
      where representation_type = 'related_review'
    )::bigint,
    'totalBookingsInPeriod', coalesce(sum(bookings_in_period), 0)::bigint,
    'confirmedBookingsInPeriod', coalesce(sum(bookings_in_period) filter (
      where representation_type = 'confirmed_customer'
    ), 0)::bigint,
    'relatedReviewBookingsInPeriod', coalesce(sum(bookings_in_period) filter (
      where representation_type = 'related_review'
    ), 0)::bigint
  )
  into v_result
  from period_representations;

  return v_result;
end;
$$;

revoke all on function public.customer_window_v2_list_representations_by_purchase_period(
  date, date, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_v2_get_purchase_period_facets(date, date)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_window_v2_list_representations_by_purchase_period(
  date, date, integer, integer
) to service_role;
grant execute on function public.customer_window_v2_get_purchase_period_facets(date, date)
  to service_role;

comment on function public.customer_window_v2_list_representations_by_purchase_period(
  date, date, integer, integer
) is 'Lists active-snapshot MCP/EAP analytical representations by inclusive purchase date without treating related-review groups as confirmed customers.';
comment on function public.customer_window_v2_get_purchase_period_facets(date, date) is
  'Returns minimal active-snapshot MCP/EAP representation and booking counts for an inclusive purchase date period.';

commit;
