begin;

create or replace function public.customer_window_360_v1_resolve_locator(
  p_locator jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_representation_key text;
  v_representation_type text;
  v_representation_id text;
  v_customer_universe text;
  v_authority_snapshot_text text;
  v_authority_snapshot_id uuid;
  v_customer_id uuid;
  v_profile_status text;
  v_merged_into_profile_id uuid;
  v_snapshot_status text;
  v_active_snapshot_count integer;
  v_active_snapshot_id uuid;
  v_group_exists boolean;
begin
  if p_locator is null
    or pg_catalog.jsonb_typeof(p_locator) <> 'object'
    or not (p_locator ?& array[
      'representationKey', 'representationType', 'representationId',
      'customerUniverse', 'authoritySnapshotId'
    ]) then
    raise exception 'invalid_locator_contract' using errcode = '22023';
  end if;

  v_representation_key := p_locator ->> 'representationKey';
  v_representation_type := p_locator ->> 'representationType';
  v_representation_id := p_locator ->> 'representationId';
  v_customer_universe := p_locator ->> 'customerUniverse';
  v_authority_snapshot_text := p_locator ->> 'authoritySnapshotId';

  if v_representation_key is null
    or v_representation_type is null
    or v_representation_id is null
    or v_customer_universe is null
    or v_representation_type not in ('confirmed_customer', 'related_review')
    or nullif(pg_catalog.btrim(v_representation_id), '') is null
    or v_representation_key <> v_representation_type || ':' || v_representation_id then
    raise exception 'invalid_locator_contract' using errcode = '22023';
  end if;

  if v_representation_type = 'confirmed_customer' then
    if v_customer_universe <> 'GLOBAL'
      or p_locator -> 'authoritySnapshotId' <> 'null'::jsonb
      or v_representation_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'invalid_locator_contract' using errcode = '22023';
    end if;

    v_customer_id := v_representation_id::uuid;
    select profile.status, profile.merged_into_profile_id
    into v_profile_status, v_merged_into_profile_id
    from public.customer_profiles profile
    where profile.id = v_customer_id;

    if not found then
      raise exception 'representation_not_found' using errcode = 'P0002';
    end if;
    if v_profile_status <> 'active' or v_merged_into_profile_id is not null then
      raise exception 'stale_representation' using errcode = '40001';
    end if;

    return pg_catalog.jsonb_build_object(
      'locator', pg_catalog.jsonb_build_object(
        'representationKey', v_representation_key,
        'representationType', v_representation_type,
        'representationId', v_representation_id,
        'customerUniverse', v_customer_universe,
        'authoritySnapshotId', null
      ),
      'customerId', v_customer_id,
      'relatedGroupId', null,
      'snapshotId', null
    );
  end if;

  if v_customer_universe <> 'MCP_EAP'
    or v_representation_id !~ '^[0-9a-f]{64}$'
    or v_authority_snapshot_text is null
    or v_authority_snapshot_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid_locator_contract' using errcode = '22023';
  end if;

  v_authority_snapshot_id := v_authority_snapshot_text::uuid;
  select snapshot.status
  into v_snapshot_status
  from public.customer_related_review_snapshots snapshot
  where snapshot.snapshot_id = v_authority_snapshot_id
    and snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1';

  if not found then
    raise exception 'authority_not_found' using errcode = 'P0002';
  end if;

  select authority.active_snapshot_count, authority.snapshot_id
  into v_active_snapshot_count, v_active_snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority;

  if v_active_snapshot_count <> 1 or v_active_snapshot_id is null then
    raise exception 'representation_authority_unavailable' using errcode = '55000';
  end if;
  if v_snapshot_status <> 'active' or v_active_snapshot_id <> v_authority_snapshot_id then
    raise exception 'stale_representation' using errcode = '40001';
  end if;

  select exists (
    select 1
    from public.customer_related_review_groups related_group
    where related_group.snapshot_id = v_authority_snapshot_id
      and related_group.group_id = v_representation_id
  ) into v_group_exists;

  if not v_group_exists then
    if exists (
      select 1
      from public.customer_related_review_groups related_group
      where related_group.group_id = v_representation_id
    ) then
      raise exception 'stale_representation' using errcode = '40001';
    end if;
    raise exception 'representation_not_found' using errcode = 'P0002';
  end if;

  return pg_catalog.jsonb_build_object(
    'locator', pg_catalog.jsonb_build_object(
      'representationKey', v_representation_key,
      'representationType', v_representation_type,
      'representationId', v_representation_id,
      'customerUniverse', v_customer_universe,
      'authoritySnapshotId', v_authority_snapshot_id
    ),
    'customerId', null,
    'relatedGroupId', v_representation_id,
    'snapshotId', v_authority_snapshot_id
  );
end;
$$;

create or replace function public.customer_window_360_v1_get_overview(
  p_locator jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resolved jsonb;
  v_locator jsonb;
  v_representation_type text;
  v_customer_id uuid;
  v_group_id text;
  v_snapshot_id uuid;
  v_result jsonb;
begin
  v_resolved := public.customer_window_360_v1_resolve_locator(p_locator);
  v_locator := v_resolved -> 'locator';
  v_representation_type := v_locator ->> 'representationType';

  if v_representation_type = 'confirmed_customer' then
    v_customer_id := (v_resolved ->> 'customerId')::uuid;

    with contact_values as materialized (
      select distinct identity.identity_type, identity.identity_value_normalized as display_value
      from public.customer_identity_links identity
      where identity.profile_id = v_customer_id
        and identity.status = 'active'
        and identity.identity_type in ('email', 'phone')
    ),
    contacts as (
      select
        count(*) filter (where identity_type = 'email')::bigint as email_count,
        count(*) filter (where identity_type = 'phone')::bigint as phone_count,
        case when count(*) filter (where identity_type = 'email') = 1
          then max(display_value) filter (where identity_type = 'email') end as single_email,
        case when count(*) filter (where identity_type = 'phone') = 1
          then max(display_value) filter (where identity_type = 'phone') end as single_phone
      from contact_values
    ),
    coverage as (
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('source', source, 'bookingCount', booking_count)
        order by source
      ), '[]'::jsonb) as value
      from (
        select 'MCP_EAP'::text as source, (metrics.mcp_count + metrics.eap_count)::bigint as booking_count
        from public.customer_profile_metrics metrics
        where metrics.customer_id = v_customer_id
          and metrics.mcp_count + metrics.eap_count > 0
        union all
        select 'OKP'::text, metrics.okp_count::bigint
        from public.customer_profile_metrics metrics
        where metrics.customer_id = v_customer_id
          and metrics.okp_count > 0
      ) source_counts
    )
    select pg_catalog.jsonb_build_object(
      'ok', true,
      'contractVersion', 'CUSTOMER_360_V1',
      'locator', v_locator,
      'representation', pg_catalog.jsonb_build_object(
        'readOnly', false,
        'authorityStatus', 'global'
      ),
      'identity', pg_catalog.jsonb_build_object(
        'status', 'confirmed',
        'customerId', v_customer_id,
        'relatedGroupId', null,
        'contactability', 'direct',
        'contacts', pg_catalog.jsonb_build_object(
          'semantics', 'direct',
          'emailCount', contacts.email_count,
          'phoneCount', contacts.phone_count,
          'singleEmail', contacts.single_email,
          'singlePhone', contacts.single_phone
        ),
        'relatedReviewSummary', null
      ),
      'summary', pg_catalog.jsonb_build_object(
        'totalBookings', metrics.total_reservations,
        'firstBookingAt', metrics.first_purchase_at,
        'lastBookingAt', metrics.last_purchase_at
      ),
      'sourceCoverage', coverage.value,
      'moduleAvailability', pg_catalog.jsonb_build_object(
        'bookings', pg_catalog.jsonb_build_object('status', 'available'),
        'commercialEvents', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_linked_v1'),
        'communications', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'read_contract_pending'),
        'advancedMetrics', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_in_v1'),
        'attribution', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_in_v1')
      )
    ) into v_result
    from public.customer_profile_metrics metrics
    cross join contacts
    cross join coverage
    where metrics.customer_id = v_customer_id
      and metrics.total_reservations = metrics.mcp_count + metrics.eap_count + metrics.okp_count;
  else
    v_group_id := v_resolved ->> 'relatedGroupId';
    v_snapshot_id := (v_resolved ->> 'snapshotId')::uuid;

    with observations as materialized (
      select
        observed.identity_type,
        observed.normalized_value,
        observed.display_value,
        observed.source_created_at,
        observed.source_row_id
      from public.customer_analytical_booking_assignments assignment
      cross join lateral (
        select source_booking.*
        from public.customer_source_bookings_mcp_eap source_booking
        where source_booking.source = assignment.source
          and source_booking.source_row_id = assignment.source_row_id
        limit 1
      ) booking
      cross join lateral (
        values
          ('email'::text, nullif(booking.email_normalized, ''),
            coalesce(nullif(pg_catalog.btrim(booking.email_raw), ''), nullif(booking.email_normalized, '')),
            booking.source_created_at, booking.source_row_id),
          ('phone'::text, nullif(booking.phone_normalized, ''),
            coalesce(nullif(pg_catalog.btrim(booking.phone_raw), ''), nullif(booking.phone_normalized, '')),
            booking.source_created_at, booking.source_row_id)
      ) observed(identity_type, normalized_value, display_value, source_created_at, source_row_id)
      where assignment.snapshot_id = v_snapshot_id
        and assignment.representation_type = 'related_review'
        and assignment.related_group_id = v_group_id
        and observed.normalized_value is not null
    ),
    contact_values as materialized (
      select distinct on (identity_type, normalized_value)
        identity_type, normalized_value, display_value
      from observations
      order by identity_type, normalized_value, source_created_at desc, source_row_id desc
    ),
    contacts as (
      select
        count(*) filter (where identity_type = 'email')::bigint as email_count,
        count(*) filter (where identity_type = 'phone')::bigint as phone_count,
        case when count(*) filter (where identity_type = 'email') = 1
          then max(display_value) filter (where identity_type = 'email') end as single_email,
        case when count(*) filter (where identity_type = 'phone') = 1
          then max(display_value) filter (where identity_type = 'phone') end as single_phone
      from contact_values
    )
    select pg_catalog.jsonb_build_object(
      'ok', true,
      'contractVersion', 'CUSTOMER_360_V1',
      'locator', v_locator,
      'representation', pg_catalog.jsonb_build_object(
        'readOnly', true,
        'authorityStatus', 'active_snapshot'
      ),
      'identity', pg_catalog.jsonb_build_object(
        'status', 'related_review',
        'customerId', null,
        'relatedGroupId', related_group.group_id,
        'contactability', 'observed_only',
        'contacts', pg_catalog.jsonb_build_object(
          'semantics', 'observed',
          'emailCount', contacts.email_count,
          'phoneCount', contacts.phone_count,
          'singleEmail', contacts.single_email,
          'singlePhone', contacts.single_phone
        ),
        'relatedReviewSummary', pg_catalog.jsonb_build_object(
          'profileCount', related_group.profile_count,
          'conflictCount', related_group.conflict_count,
          'candidateCount', related_group.candidate_count,
          'v1BookingCount', related_group.v1_booking_count,
          'v2BookingCount', related_group.v2_booking_count
        )
      ),
      'summary', pg_catalog.jsonb_build_object(
        'totalBookings', metrics.total_reservations,
        'firstBookingAt', metrics.first_purchase_at,
        'lastBookingAt', metrics.last_purchase_at
      ),
      'sourceCoverage', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('source', 'MCP_EAP', 'bookingCount', metrics.total_reservations)
      ),
      'moduleAvailability', pg_catalog.jsonb_build_object(
        'bookings', pg_catalog.jsonb_build_object('status', 'available'),
        'commercialEvents', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_linked_v1'),
        'communications', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'read_contract_pending'),
        'advancedMetrics', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_in_v1'),
        'attribution', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_in_v1')
      )
    ) into v_result
    from public.customer_related_review_groups related_group
    join public.customer_related_review_metrics metrics
      on metrics.snapshot_id = related_group.snapshot_id
     and metrics.group_id = related_group.group_id
    cross join contacts
    where related_group.snapshot_id = v_snapshot_id
      and related_group.group_id = v_group_id
      and metrics.total_reservations = related_group.booking_count
      and related_group.v1_booking_count + related_group.v2_booking_count = related_group.booking_count;
  end if;

  if v_result is null then
    raise exception 'representation_contract_unavailable' using errcode = '55000';
  end if;
  return v_result;
end;
$$;

create or replace function public.customer_window_360_v1_list_bookings(
  p_locator jsonb,
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
  v_resolved jsonb;
  v_locator jsonb;
  v_representation_type text;
  v_customer_id uuid;
  v_group_id text;
  v_snapshot_id uuid;
  v_total bigint;
  v_expected_total bigint;
  v_items jsonb;
begin
  if p_page is null or p_page < 1
    or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid_locator_contract' using errcode = '22023';
  end if;

  v_resolved := public.customer_window_360_v1_resolve_locator(p_locator);
  v_locator := v_resolved -> 'locator';
  v_representation_type := v_locator ->> 'representationType';

  if v_representation_type = 'confirmed_customer' then
    v_customer_id := (v_resolved ->> 'customerId')::uuid;

    with mcp_eap_links as materialized (
      select link.source_row_id
      from public.customer_booking_profile_links link
      where link.profile_id = v_customer_id
        and link.source = 'MCP_EAP'
        and link.status = 'active'
    ),
    okp_links as materialized (
      select link.source_row_id
      from public.customer_booking_profile_links link
      where link.profile_id = v_customer_id
        and link.source = 'OKP'
        and link.status = 'active'
    ),
    mcp_eap_scoped as (
      select
        'MCP_EAP'::text as source,
        booking.source_row_id,
        booking.source_booking_code,
        booking.source_created_at as purchase_created_at,
        booking.planned_arrival_at,
        booking.planned_departure_at,
        null::timestamp without time zone as actual_checkin_at,
        null::timestamp without time zone as actual_checkout_at,
        booking.brand_normalized as brand,
        booking.parking_normalized as parking,
        booking.booking_paid as paid_amount,
        booking.booking_status::text as status,
        booking.duration_days,
        booking.is_pack,
        booking.promotion_code as promo_code
      from mcp_eap_links link
      cross join lateral (
        select source_booking.*
        from public.customer_source_bookings_mcp_eap source_booking
        where source_booking.source = 'MCP_EAP'
          and source_booking.source_row_id = link.source_row_id
          and source_booking.booking_status in (1, 8)
        limit 1
      ) booking
    ),
    okp_scoped as (
      select
        'OKP'::text as source,
        booking.source_row_id,
        booking.source_booking_code,
        booking.source_created_at as purchase_created_at,
        booking.planned_arrival_at,
        booking.planned_departure_at,
        booking.actual_checkin_at,
        booking.actual_checkout_at,
        'OKP'::text as brand,
        booking.parking_normalized as parking,
        booking.source_total_amount as paid_amount,
        booking.status_raw as status,
        case
          when booking.planned_arrival_at is null or booking.planned_departure_at is null then null
          else greatest(
            0,
            booking.planned_departure_at::date - booking.planned_arrival_at::date
          )
        end as duration_days,
        booking.is_pack,
        booking.coupon_code as promo_code
      from okp_links link
      cross join lateral (
        select source_booking.*
        from public.customer_source_bookings_okp source_booking
        where source_booking.source = 'OKP'
          and source_booking.source_row_id = link.source_row_id
          and (
            (source_booking.status_raw = 'PAGADA'
              and source_booking.is_confirmed is true
              and source_booking.is_paid is true)
            or (source_booking.status_raw = 'REEMPLAZADA'
              and source_booking.is_confirmed is true)
          )
        limit 1
      ) booking
    ),
    scoped as materialized (
      select * from mcp_eap_scoped
      union all
      select * from okp_scoped
    ),
    paged as (
      select scoped.*
      from scoped
      order by scoped.purchase_created_at desc nulls last, scoped.source desc, scoped.source_row_id desc
      limit p_page_size
      offset (p_page::bigint - 1) * p_page_size
    )
    select
      coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'source', paged.source,
          'sourceRowId', paged.source_row_id::text,
          'bookingId', paged.source_booking_code,
          'createdAt', paged.purchase_created_at,
          'plannedCheckInAt', paged.planned_arrival_at,
          'plannedCheckOutAt', paged.planned_departure_at,
          'actualCheckInAt', paged.actual_checkin_at,
          'actualCheckOutAt', paged.actual_checkout_at,
          'brand', paged.brand,
          'parking', paged.parking,
          'amount', case when paged.paid_amount is null then null else paged.paid_amount::text end,
          'amountKind', case when paged.paid_amount is null then null else 'paid_amount' end,
          'status', paged.status,
          'durationDays', paged.duration_days,
          'isPack', paged.is_pack,
          'promoCode', paged.promo_code,
          'observedEmail', null,
          'observedPhone', null
        ) order by paged.purchase_created_at desc nulls last, paged.source desc, paged.source_row_id desc
      ), '[]'::jsonb),
      (select count(*)::bigint from scoped)
    into v_items, v_total
    from paged;
  else
    v_group_id := v_resolved ->> 'relatedGroupId';
    v_snapshot_id := (v_resolved ->> 'snapshotId')::uuid;

    select metrics.total_reservations
    into v_expected_total
    from public.customer_related_review_metrics metrics
    where metrics.snapshot_id = v_snapshot_id
      and metrics.group_id = v_group_id;

    with scoped as materialized (
      select
        booking.source,
        booking.source_row_id,
        booking.source_booking_code,
        booking.source_created_at,
        booking.planned_arrival_at,
        booking.planned_departure_at,
        booking.brand_normalized,
        booking.parking_normalized,
        booking.booking_paid,
        booking.booking_status,
        booking.duration_days,
        booking.is_pack,
        booking.promotion_code,
        coalesce(nullif(pg_catalog.btrim(booking.email_raw), ''), nullif(booking.email_normalized, '')) as observed_email,
        coalesce(nullif(pg_catalog.btrim(booking.phone_raw), ''), nullif(booking.phone_normalized, '')) as observed_phone
      from public.customer_analytical_booking_assignments assignment
      join public.customer_source_bookings_mcp_eap booking
        on booking.source = assignment.source
       and booking.source_row_id = assignment.source_row_id
      where assignment.snapshot_id = v_snapshot_id
        and assignment.representation_type = 'related_review'
        and assignment.related_group_id = v_group_id
        and booking.source = 'MCP_EAP'
        and booking.booking_status in (1, 8)
    ),
    paged as (
      select scoped.*
      from scoped
      order by scoped.source_created_at desc nulls last, scoped.source desc, scoped.source_row_id desc
      limit p_page_size
      offset (p_page::bigint - 1) * p_page_size
    )
    select
      coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'source', paged.source,
          'sourceRowId', paged.source_row_id::text,
          'bookingId', paged.source_booking_code,
          'createdAt', paged.source_created_at,
          'plannedCheckInAt', paged.planned_arrival_at,
          'plannedCheckOutAt', paged.planned_departure_at,
          'actualCheckInAt', null,
          'actualCheckOutAt', null,
          'brand', paged.brand_normalized,
          'parking', paged.parking_normalized,
          'amount', case when paged.booking_paid is null then null else paged.booking_paid::text end,
          'amountKind', case when paged.booking_paid is null then null else 'paid_amount' end,
          'status', paged.booking_status::text,
          'durationDays', paged.duration_days,
          'isPack', paged.is_pack,
          'promoCode', paged.promotion_code,
          'observedEmail', paged.observed_email,
          'observedPhone', paged.observed_phone
        ) order by paged.source_created_at desc nulls last, paged.source desc, paged.source_row_id desc
      ), '[]'::jsonb),
      (select count(*)::bigint from scoped)
    into v_items, v_total
    from paged;

    if v_expected_total is null or v_total <> v_expected_total then
      raise exception 'representation_contract_unavailable' using errcode = '55000';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 'CUSTOMER_360_V1',
    'locator', v_locator,
    'items', v_items,
    'pagination', pg_catalog.jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'total', v_total,
      'hasNextPage', p_page::bigint * p_page_size < v_total
    )
  );
end;
$$;

revoke all on function public.customer_window_360_v1_resolve_locator(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_360_v1_get_overview(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_360_v1_list_bookings(jsonb, integer, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_window_360_v1_get_overview(jsonb)
  to service_role;
grant execute on function public.customer_window_360_v1_list_bookings(jsonb, integer, integer)
  to service_role;

comment on function public.customer_window_360_v1_resolve_locator(jsonb) is
  'Private fail-closed Customer 360 V1 locator resolver shared by public read RPCs.';
comment on function public.customer_window_360_v1_get_overview(jsonb) is
  'Returns the Customer 360 V1 overview for a global confirmed customer or active-snapshot MCP/EAP related-review representation.';
comment on function public.customer_window_360_v1_list_bookings(jsonb, integer, integer) is
  'Returns offset-paginated Customer 360 V1 bookings with global multi-source scope for confirmed customers and snapshot-scoped MCP/EAP scope for related review.';

commit;
