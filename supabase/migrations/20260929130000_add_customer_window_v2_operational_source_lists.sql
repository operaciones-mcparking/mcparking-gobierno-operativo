begin;

create or replace function public.customer_window_v2_list_operational_representations_by_purchase_period(
  p_from date,
  p_to date,
  p_family text,
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
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid purchase period' using errcode = '22023';
  end if;
  if p_family not in ('OKP', 'MCP_EAP') then
    raise exception 'Invalid source family' using errcode = '22023';
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
      v_snapshot_id as snapshot_id,
      'confirmed_customer'::text as representation_type,
      link.profile_id::text as representation_id,
      'confirmed_customer:' || link.profile_id::text as representation_key,
      link.profile_id as customer_id,
      null::text as related_group_id,
      count(*)::bigint as reservations_in_period,
      max(booking.source_created_at) as last_booking_at_in_period
    from public.customer_source_bookings_okp booking
    join public.customer_booking_profile_links link
      on link.source = 'OKP'
     and link.source_row_id = booking.source_row_id
     and link.status = 'active'
    where p_family = 'OKP'
      and booking.source = 'OKP'
      and booking.source_created_at >= p_from::timestamp without time zone
      and booking.source_created_at < (p_to + 1)::timestamp without time zone
      and (
        (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
        or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
      )
    group by link.profile_id

    union all

    select
      representation.snapshot_id,
      representation.representation_type,
      representation.representation_id,
      representation.representation_key,
      representation.customer_id,
      representation.related_group_id,
      count(*)::bigint,
      max(booking.source_created_at)
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = booking.source
     and representation.source_row_id = booking.source_row_id
    where p_family = 'MCP_EAP'
      and booking.source = 'MCP_EAP'
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
      period.*,
      case period.representation_type
        when 'confirmed_customer' then profile_metrics.total_reservations
        else related_metrics.total_reservations
      end as total_reservations,
      case period.representation_type
        when 'confirmed_customer' then profile_metrics.first_purchase_at
        else related_metrics.first_purchase_at
      end as first_purchase_at,
      case period.representation_type
        when 'confirmed_customer' then profile_metrics.last_purchase_at
        else related_metrics.last_purchase_at
      end as last_purchase_at,
      case period.representation_type
        when 'confirmed_customer' then profile_metrics.brand_behavior
        else 'ONLY_MCP_EAP'::text
      end as commercial_trajectory,
      case period.representation_type
        when 'confirmed_customer' then 'confirmed_identity'::text
        else 'related_group'::text
      end as trajectory_scope,
      case period.representation_type
        when 'confirmed_customer' then 'all_confirmed_sources'::text
        else 'mcp_eap_active_snapshot'::text
      end as metric_scope
    from period_representations period
    left join public.customer_profiles profile
      on period.representation_type = 'confirmed_customer'
     and profile.id = period.customer_id
     and profile.status = 'active'
    left join public.customer_profile_metrics profile_metrics
      on period.representation_type = 'confirmed_customer'
     and profile_metrics.customer_id = period.customer_id
    left join public.customer_related_review_metrics related_metrics
      on period.representation_type = 'related_review'
     and related_metrics.snapshot_id = period.snapshot_id
     and related_metrics.group_id = period.related_group_id
    where period.representation_type = 'related_review' or profile.id is not null
  ),
  paged as materialized (
    select *
    from enriched
    order by last_booking_at_in_period desc, representation_key asc
    limit p_page_size offset (p_page - 1) * p_page_size
  ),
  confirmed_source_rows as materialized (
    select paged.representation_key, booking.is_pack
    from paged
    join public.customer_booking_profile_links link
      on paged.representation_type = 'confirmed_customer'
     and link.profile_id = paged.customer_id
     and link.source = 'OKP'
     and link.status = 'active'
    join public.customer_source_bookings_okp booking
      on booking.source = link.source
     and booking.source_row_id = link.source_row_id
    where p_family = 'OKP'
      and (
        (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
        or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
      )

    union all

    select paged.representation_key, booking.is_pack
    from paged
    join public.customer_booking_profile_links link
      on paged.representation_type = 'confirmed_customer'
     and link.profile_id = paged.customer_id
     and link.source = 'MCP_EAP'
     and link.status = 'active'
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = link.source
     and booking.source_row_id = link.source_row_id
     and booking.booking_status in (1, 8)
    where p_family = 'MCP_EAP'
  ),
  related_source_rows as materialized (
    select paged.representation_key, booking.is_pack
    from paged
    join public.customer_analytical_booking_assignments assignment
      on paged.representation_type = 'related_review'
     and assignment.snapshot_id = paged.snapshot_id
     and assignment.representation_type = 'related_review'
     and assignment.related_group_id = paged.related_group_id
     and assignment.customer_id is null
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = assignment.source
     and booking.source_row_id = assignment.source_row_id
     and booking.booking_status in (1, 8)
    where p_family = 'MCP_EAP'
  ),
  source_counts as (
    select
      source_row.representation_key,
      count(*)::bigint as source_reservations,
      count(*) filter (where source_row.is_pack is false)::bigint as boleta_reservations,
      count(*) filter (where source_row.is_pack is true)::bigint as pack_reservations
    from (
      select * from confirmed_source_rows
      union all
      select * from related_source_rows
    ) source_row
    group by source_row.representation_key
  ),
  confirmed_contact_values as materialized (
    select distinct
      paged.representation_key,
      identity.identity_type,
      identity.identity_value_normalized as display_value
    from paged
    join public.customer_identity_links identity
      on paged.representation_type = 'confirmed_customer'
     and identity.profile_id = paged.customer_id
     and identity.status = 'active'
     and identity.identity_type in ('email', 'phone')
  ),
  confirmed_contacts as (
    select
      contact.representation_key,
      count(*) filter (where contact.identity_type = 'email')::bigint as email_count,
      count(*) filter (where contact.identity_type = 'phone')::bigint as phone_count,
      case when count(*) filter (where contact.identity_type = 'email') = 1
        then max(contact.display_value) filter (where contact.identity_type = 'email') end as single_email,
      case when count(*) filter (where contact.identity_type = 'phone') = 1
        then max(contact.display_value) filter (where contact.identity_type = 'phone') end as single_phone
    from confirmed_contact_values contact
    group by contact.representation_key
  ),
  related_contact_observations as materialized (
    select
      paged.representation_key,
      observation.identity_type,
      observation.normalized_value,
      observation.raw_value,
      booking.source_created_at,
      booking.source_row_id
    from paged
    join public.customer_analytical_booking_assignments assignment
      on paged.representation_type = 'related_review'
     and assignment.snapshot_id = paged.snapshot_id
     and assignment.representation_type = 'related_review'
     and assignment.related_group_id = paged.related_group_id
     and assignment.customer_id is null
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = assignment.source
     and booking.source_row_id = assignment.source_row_id
     and booking.booking_status in (1, 8)
    cross join lateral (
      values
        ('email'::text, nullif(booking.email_normalized, ''), nullif(pg_catalog.btrim(booking.email_raw), '')),
        ('phone'::text, nullif(booking.phone_normalized, ''), nullif(pg_catalog.btrim(booking.phone_raw), ''))
    ) observation(identity_type, normalized_value, raw_value)
    where observation.normalized_value is not null
  ),
  related_contact_values as materialized (
    select
      observation.representation_key,
      observation.identity_type,
      observation.normalized_value,
      coalesce(
        (pg_catalog.array_agg(
          observation.raw_value
          order by observation.source_created_at desc, observation.source_row_id desc
        ) filter (where observation.raw_value is not null))[1],
        observation.normalized_value
      ) as display_value
    from related_contact_observations observation
    group by observation.representation_key, observation.identity_type, observation.normalized_value
  ),
  related_contacts as (
    select
      contact.representation_key,
      count(*) filter (where contact.identity_type = 'email')::bigint as email_count,
      count(*) filter (where contact.identity_type = 'phone')::bigint as phone_count,
      case when count(*) filter (where contact.identity_type = 'email') = 1
        then max(contact.display_value) filter (where contact.identity_type = 'email') end as single_email,
      case when count(*) filter (where contact.identity_type = 'phone') = 1
        then max(contact.display_value) filter (where contact.identity_type = 'phone') end as single_phone
    from related_contact_values contact
    group by contact.representation_key
  )
  select pg_catalog.jsonb_build_object(
    'family', p_family,
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
          'lastBookingAtInPeriod', paged.last_booking_at_in_period,
          'sourceReservations', source_count.source_reservations,
          'boletaReservations', source_count.boleta_reservations,
          'packReservations', source_count.pack_reservations,
          'commercialTrajectory', paged.commercial_trajectory,
          'trajectoryScope', paged.trajectory_scope,
          'contactSummary', pg_catalog.jsonb_build_object(
            'semantics', case paged.representation_type when 'confirmed_customer' then 'direct' else 'observed' end,
            'emailCount', coalesce(confirmed.email_count, related.email_count, 0),
            'phoneCount', coalesce(confirmed.phone_count, related.phone_count, 0),
            'singleEmail', coalesce(confirmed.single_email, related.single_email),
            'singlePhone', coalesce(confirmed.single_phone, related.single_phone)
          )
        ) order by paged.last_booking_at_in_period desc, paged.representation_key asc
      )
      from paged
      left join source_counts source_count using (representation_key)
      left join confirmed_contacts confirmed using (representation_key)
      left join related_contacts related using (representation_key)
    ), '[]'::jsonb),
    'total', (select count(*)::bigint from enriched),
    'page', p_page,
    'pageSize', p_page_size
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.customer_window_v2_list_operational_representations_by_purchase_period(
  date, date, text, integer, integer
) from public, anon, authenticated, service_role;

grant execute on function public.customer_window_v2_list_operational_representations_by_purchase_period(
  date, date, text, integer, integer
) to service_role;

comment on function public.customer_window_v2_list_operational_representations_by_purchase_period(
  date, date, text, integer, integer
) is 'Lists source-scoped Customer Window operational rows without attributing OKP activity to related-review groups.';

commit;
