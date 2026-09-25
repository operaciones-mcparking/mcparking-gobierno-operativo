begin;

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
    ranked_contact_values as (
      select contact_values.*,
        row_number() over (partition by identity_type order by normalized_value) as contact_rank
      from contact_values
    ),
    contacts as (
      select
        count(*) filter (where identity_type = 'email')::bigint as email_count,
        count(*) filter (where identity_type = 'phone')::bigint as phone_count,
        case when count(*) filter (where identity_type = 'email') = 1
          then max(display_value) filter (where identity_type = 'email') end as single_email,
        case when count(*) filter (where identity_type = 'phone') = 1
          then max(display_value) filter (where identity_type = 'phone') end as single_phone,
        coalesce(pg_catalog.jsonb_agg(display_value order by normalized_value)
          filter (where identity_type = 'email' and contact_rank <= 5), '[]'::jsonb) as email_preview,
        coalesce(pg_catalog.jsonb_agg(display_value order by normalized_value)
          filter (where identity_type = 'phone' and contact_rank <= 5), '[]'::jsonb) as phone_preview
      from ranked_contact_values
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
          'singlePhone', contacts.single_phone,
          'emailPreview', contacts.email_preview,
          'phonePreview', contacts.phone_preview
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

create or replace function public.customer_window_360_v1_list_observed_contacts(
  p_locator jsonb,
  p_contact_type text,
  p_page integer default 1,
  p_page_size integer default 100
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
  v_group_id text;
  v_snapshot_id uuid;
  v_items jsonb;
  v_total bigint;
begin
  if p_contact_type is null or p_contact_type not in ('email', 'phone')
    or p_page is null or p_page < 1
    or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid_locator_contract' using errcode = '22023';
  end if;

  v_resolved := public.customer_window_360_v1_resolve_locator(p_locator);
  v_locator := v_resolved -> 'locator';
  if v_locator ->> 'representationType' <> 'related_review' then
    raise exception 'invalid_locator_contract' using errcode = '22023';
  end if;
  v_group_id := v_resolved ->> 'relatedGroupId';
  v_snapshot_id := (v_resolved ->> 'snapshotId')::uuid;

  with observations as materialized (
    select
      nullif(case when p_contact_type = 'email' then booking.email_normalized
        else booking.phone_normalized end, '') as normalized_value,
      case when p_contact_type = 'email'
        then coalesce(nullif(pg_catalog.btrim(booking.email_raw), ''), nullif(booking.email_normalized, ''))
        else coalesce(nullif(pg_catalog.btrim(booking.phone_raw), ''), nullif(booking.phone_normalized, ''))
      end as display_value,
      booking.source_created_at,
      booking.source_row_id
    from public.customer_analytical_booking_assignments assignment
    cross join lateral (
      select source_booking.*
      from public.customer_source_bookings_mcp_eap source_booking
      where source_booking.source = assignment.source
        and source_booking.source_row_id = assignment.source_row_id
      limit 1
    ) booking
    where assignment.snapshot_id = v_snapshot_id
      and assignment.representation_type = 'related_review'
      and assignment.related_group_id = v_group_id
  ),
  contact_values as materialized (
    select distinct on (normalized_value) normalized_value, display_value
    from observations
    where normalized_value is not null
    order by normalized_value, source_created_at desc, source_row_id desc
  ),
  paged as (
    select normalized_value, display_value
    from contact_values
    order by normalized_value
    limit p_page_size
    offset (p_page::bigint - 1) * p_page_size
  )
  select
    coalesce(pg_catalog.jsonb_agg(display_value order by normalized_value), '[]'::jsonb),
    (select count(*)::bigint from contact_values)
  into v_items, v_total
  from paged;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 'CUSTOMER_360_V1',
    'locator', v_locator,
    'semantics', 'observed',
    'contactType', p_contact_type,
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

revoke all on function public.customer_window_360_v1_get_overview(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_360_v1_list_observed_contacts(jsonb, text, integer, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_window_360_v1_get_overview(jsonb)
  to service_role;
grant execute on function public.customer_window_360_v1_list_observed_contacts(jsonb, text, integer, integer)
  to service_role;

comment on function public.customer_window_360_v1_list_observed_contacts(jsonb, text, integer, integer) is
  'Returns distinct observed related-review contacts with snapshot-scoped pagination; confirmed-customer locators are rejected.';

commit;
