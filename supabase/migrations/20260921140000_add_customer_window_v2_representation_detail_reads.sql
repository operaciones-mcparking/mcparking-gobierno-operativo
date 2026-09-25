begin;

create or replace function public.customer_window_v2_get_representation_summary(
  p_representation_type text,
  p_representation_id text
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
  v_representation_count bigint;
  v_customer_id uuid;
  v_related_group_id text;
  v_result jsonb;
begin
  if p_representation_type is null
    or p_representation_type not in ('confirmed_customer', 'related_review') then
    raise exception 'Invalid representation type' using errcode = '22023';
  end if;
  if p_representation_id is null or pg_catalog.btrim(p_representation_id) = '' then
    raise exception 'Invalid representation ID' using errcode = '22023';
  end if;

  select authority.active_snapshot_count, authority.snapshot_id
  into v_active_snapshot_count, v_snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority;

  if v_active_snapshot_count <> 1 or v_snapshot_id is null then
    raise exception 'Customer Window v2 requires exactly one active snapshot'
      using errcode = 'P0001';
  end if;

  select
    count(*)::bigint,
    (pg_catalog.array_agg(distinct representation.customer_id)
      filter (where representation.customer_id is not null))[1],
    (pg_catalog.array_agg(distinct representation.related_group_id)
      filter (where representation.related_group_id is not null))[1]
  into v_representation_count, v_customer_id, v_related_group_id
  from public.customer_window_mcp_eap_representations_v2 representation
  where representation.snapshot_id = v_snapshot_id
    and representation.representation_type = p_representation_type
    and representation.representation_id = p_representation_id;

  if v_representation_count = 0 then
    raise exception 'Representation is not part of the active snapshot'
      using errcode = 'P0001';
  end if;

  if p_representation_type = 'confirmed_customer' then
    if v_customer_id is null or v_related_group_id is not null
      or v_customer_id::text <> p_representation_id then
      raise exception 'Confirmed representation contract is invalid'
        using errcode = 'P0001';
    end if;

    select pg_catalog.jsonb_build_object(
      'representationType', 'confirmed_customer',
      'representationId', p_representation_id,
      'representationKey', 'confirmed_customer:' || p_representation_id,
      'identityStatus', 'confirmed',
      'customerId', v_customer_id,
      'relatedGroupId', null,
      'totalReservations', metrics.total_reservations,
      'firstPurchaseAt', metrics.first_purchase_at,
      'lastPurchaseAt', metrics.last_purchase_at,
      'metricScope', 'all_confirmed_sources',
      'contactability', 'direct',
      'group', null
    )
    into v_result
    from public.customer_profile_metrics metrics
    where metrics.customer_id = v_customer_id;
  else
    if v_customer_id is not null or v_related_group_id is null
      or v_related_group_id <> p_representation_id then
      raise exception 'Related-review representation contract is invalid'
        using errcode = 'P0001';
    end if;

    select pg_catalog.jsonb_build_object(
      'representationType', 'related_review',
      'representationId', p_representation_id,
      'representationKey', 'related_review:' || p_representation_id,
      'identityStatus', 'related_review',
      'customerId', null,
      'relatedGroupId', related_group.group_id,
      'totalReservations', metrics.total_reservations,
      'firstPurchaseAt', metrics.first_purchase_at,
      'lastPurchaseAt', metrics.last_purchase_at,
      'metricScope', 'mcp_eap_active_snapshot',
      'contactability', 'review_required',
      'group', pg_catalog.jsonb_build_object(
        'bookingCount', related_group.booking_count,
        'profileCount', related_group.profile_count,
        'emailCount', related_group.email_count,
        'phoneCount', related_group.phone_count,
        'sourceCustomerCount', related_group.source_customer_count,
        'conflictCount', related_group.conflict_count,
        'candidateCount', related_group.candidate_count,
        'v1BookingCount', related_group.v1_booking_count,
        'v2BookingCount', related_group.v2_booking_count,
        'hasExactEmailPhoneCorroboration', related_group.has_exact_email_phone_corroboration,
        'hasSourceCustomerEmailCorroboration', related_group.has_source_customer_email_corroboration
      )
    )
    into v_result
    from public.customer_related_review_groups related_group
    join public.customer_related_review_metrics metrics
      on metrics.snapshot_id = related_group.snapshot_id
     and metrics.group_id = related_group.group_id
     and metrics.total_reservations = related_group.booking_count
    where related_group.snapshot_id = v_snapshot_id
      and related_group.group_id = v_related_group_id
      and related_group.v1_booking_count + related_group.v2_booking_count
        = related_group.booking_count;
  end if;

  if v_result is null then
    raise exception 'Representation summary metrics are incomplete'
      using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

create or replace function public.customer_window_v2_list_representation_bookings(
  p_representation_type text,
  p_representation_id text,
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
  v_representation_count bigint;
  v_expected_related_total bigint;
  v_total bigint;
  v_result jsonb;
begin
  if p_representation_type is null
    or p_representation_type not in ('confirmed_customer', 'related_review') then
    raise exception 'Invalid representation type' using errcode = '22023';
  end if;
  if p_representation_id is null or pg_catalog.btrim(p_representation_id) = '' then
    raise exception 'Invalid representation ID' using errcode = '22023';
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

  select count(*)::bigint
  into v_representation_count
  from public.customer_window_mcp_eap_representations_v2 representation
  where representation.snapshot_id = v_snapshot_id
    and representation.representation_type = p_representation_type
    and representation.representation_id = p_representation_id
    and (
      (p_representation_type = 'confirmed_customer'
        and representation.customer_id::text = p_representation_id
        and representation.related_group_id is null)
      or (p_representation_type = 'related_review'
        and representation.customer_id is null
        and representation.related_group_id = p_representation_id)
    );

  if v_representation_count = 0 then
    raise exception 'Representation is not part of the active snapshot'
      using errcode = 'P0001';
  end if;

  if p_representation_type = 'related_review' then
    select metrics.total_reservations
    into v_expected_related_total
    from public.customer_related_review_groups related_group
    join public.customer_related_review_metrics metrics
      on metrics.snapshot_id = related_group.snapshot_id
     and metrics.group_id = related_group.group_id
     and metrics.total_reservations = related_group.booking_count
    where related_group.snapshot_id = v_snapshot_id
      and related_group.group_id = p_representation_id
      and related_group.v1_booking_count + related_group.v2_booking_count
        = related_group.booking_count;

    if v_expected_related_total is null then
      raise exception 'Related-review booking metrics are incomplete'
        using errcode = 'P0001';
    end if;
  end if;

  with scoped as materialized (
    select
      representation.source,
      representation.source_row_id,
      representation.booking_link_id,
      booking.source_created_at,
      booking.planned_arrival_at,
      booking.planned_departure_at,
      booking.booking_status,
      booking.website_source,
      booking.brand_normalized,
      booking.parking_normalized,
      booking.booking_paid,
      booking.duration_days,
      booking.is_pack,
      booking.promotion_code
    from public.customer_window_mcp_eap_representations_v2 representation
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = representation.source
     and booking.source_row_id = representation.source_row_id
    where representation.snapshot_id = v_snapshot_id
      and representation.representation_type = p_representation_type
      and representation.representation_id = p_representation_id
      and booking.source = 'MCP_EAP'
      and booking.booking_status in (1, 8)
  ),
  paged as (
    select scoped.*
    from scoped
    order by scoped.source_created_at desc, scoped.source_row_id desc
    limit p_page_size
    offset (p_page::bigint - 1) * p_page_size
  )
  select
    pg_catalog.jsonb_build_object(
      'items', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'source', paged.source,
            'sourceRowId', paged.source_row_id,
            'bookingLinkId', paged.booking_link_id,
            'sourceCreatedAt', paged.source_created_at,
            'plannedArrivalAt', paged.planned_arrival_at,
            'plannedDepartureAt', paged.planned_departure_at,
            'bookingStatus', paged.booking_status,
            'websiteSource', paged.website_source,
            'brand', paged.brand_normalized,
            'parking', paged.parking_normalized,
            'paidAmount', paged.booking_paid,
            'durationDays', paged.duration_days,
            'isPack', paged.is_pack,
            'promotionCode', paged.promotion_code
          ) order by paged.source_created_at desc, paged.source_row_id desc
        )
        from paged
      ), '[]'::jsonb),
      'total', (select count(*)::bigint from scoped),
      'page', p_page,
      'pageSize', p_page_size
    ),
    (select count(*)::bigint from scoped)
  into v_result, v_total;

  if v_total = 0 then
    raise exception 'Representation has no valid active-snapshot bookings'
      using errcode = 'P0001';
  end if;
  if v_total <> v_representation_count then
    raise exception 'Representation booking assignments are incomplete'
      using errcode = 'P0001';
  end if;
  if p_representation_type = 'related_review'
    and v_total <> v_expected_related_total then
    raise exception 'Related-review booking total does not match active-snapshot metrics'
      using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

revoke all on function public.customer_window_v2_get_representation_summary(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_v2_list_representation_bookings(
  text, text, integer, integer
) from public, anon, authenticated, service_role;

grant execute on function public.customer_window_v2_get_representation_summary(text, text)
  to service_role;
grant execute on function public.customer_window_v2_list_representation_bookings(
  text, text, integer, integer
) to service_role;

comment on function public.customer_window_v2_get_representation_summary(text, text) is
  'Returns a fail-closed, non-PII summary for one confirmed-customer or related-review representation in the single active MCP/EAP snapshot.';
comment on function public.customer_window_v2_list_representation_bookings(
  text, text, integer, integer
) is 'Lists non-PII MCP/EAP booking facts for one active-snapshot analytical representation without promoting related-review groups to customers.';

commit;
