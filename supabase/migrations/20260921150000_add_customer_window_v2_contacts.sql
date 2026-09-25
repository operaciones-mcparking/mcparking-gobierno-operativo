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
      period.snapshot_id,
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
  paged as materialized (
    select *
    from enriched
    order by last_booking_at_in_period desc, representation_key asc
    limit p_page_size offset (p_page - 1) * p_page_size
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
    join public.customer_window_mcp_eap_representations_v2 representation
      on paged.representation_type = 'related_review'
     and representation.snapshot_id = paged.snapshot_id
     and representation.representation_type = paged.representation_type
     and representation.representation_id = paged.representation_id
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = representation.source
     and booking.source_row_id = representation.source_row_id
     and booking.source = 'MCP_EAP'
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
            'lastBookingAtInPeriod', paged.last_booking_at_in_period,
            'contactSummary', pg_catalog.jsonb_build_object(
              'semantics', case paged.representation_type
                when 'confirmed_customer' then 'direct'
                else 'observed'
              end,
              'emailCount', coalesce(confirmed.email_count, related.email_count, 0),
              'phoneCount', coalesce(confirmed.phone_count, related.phone_count, 0),
              'singleEmail', coalesce(confirmed.single_email, related.single_email),
              'singlePhone', coalesce(confirmed.single_phone, related.single_phone)
            )
          ) order by paged.last_booking_at_in_period desc, paged.representation_key asc
        )
        from paged
        left join confirmed_contacts confirmed using (representation_key)
        left join related_contacts related using (representation_key)
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
          then max(display_value) filter (where identity_type = 'phone') end as single_phone,
        coalesce(pg_catalog.jsonb_agg(display_value order by display_value)
          filter (where identity_type = 'email'), '[]'::jsonb) as direct_emails,
        coalesce(pg_catalog.jsonb_agg(display_value order by display_value)
          filter (where identity_type = 'phone'), '[]'::jsonb) as direct_phones
      from contact_values
    )
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
      'contactSummary', pg_catalog.jsonb_build_object(
        'semantics', 'direct',
        'emailCount', contacts.email_count,
        'phoneCount', contacts.phone_count,
        'singleEmail', contacts.single_email,
        'singlePhone', contacts.single_phone
      ),
      'directEmails', contacts.direct_emails,
      'directPhones', contacts.direct_phones,
      'observedEmails', '[]'::jsonb,
      'observedPhones', '[]'::jsonb,
      'group', null
    )
    into v_result
    from public.customer_profile_metrics metrics
    cross join contacts
    where metrics.customer_id = v_customer_id;
  else
    if v_customer_id is not null or v_related_group_id is null
      or v_related_group_id <> p_representation_id then
      raise exception 'Related-review representation contract is invalid'
        using errcode = 'P0001';
    end if;

    with contact_observations as materialized (
      select
        observation.identity_type,
        observation.normalized_value,
        observation.raw_value,
        booking.source_created_at,
        booking.source_row_id
      from public.customer_window_mcp_eap_representations_v2 representation
      join public.customer_source_bookings_mcp_eap booking
        on booking.source = representation.source
       and booking.source_row_id = representation.source_row_id
       and booking.source = 'MCP_EAP'
       and booking.booking_status in (1, 8)
      cross join lateral (
        values
          ('email'::text, nullif(booking.email_normalized, ''), nullif(pg_catalog.btrim(booking.email_raw), '')),
          ('phone'::text, nullif(booking.phone_normalized, ''), nullif(pg_catalog.btrim(booking.phone_raw), ''))
      ) observation(identity_type, normalized_value, raw_value)
      where representation.snapshot_id = v_snapshot_id
        and representation.representation_type = 'related_review'
        and representation.representation_id = p_representation_id
        and observation.normalized_value is not null
    ),
    contact_values as materialized (
      select
        observation.identity_type,
        observation.normalized_value,
        coalesce(
          (pg_catalog.array_agg(
            observation.raw_value
            order by observation.source_created_at desc, observation.source_row_id desc
          ) filter (where observation.raw_value is not null))[1],
          observation.normalized_value
        ) as display_value,
        count(*)::bigint as booking_count,
        min(observation.source_created_at) as first_seen_at,
        max(observation.source_created_at) as last_seen_at
      from contact_observations observation
      group by observation.identity_type, observation.normalized_value
    ),
    contacts as (
      select
        count(*) filter (where identity_type = 'email')::bigint as email_count,
        count(*) filter (where identity_type = 'phone')::bigint as phone_count,
        case when count(*) filter (where identity_type = 'email') = 1
          then max(display_value) filter (where identity_type = 'email') end as single_email,
        case when count(*) filter (where identity_type = 'phone') = 1
          then max(display_value) filter (where identity_type = 'phone') end as single_phone,
        coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'value', display_value,
            'bookingCount', booking_count,
            'firstSeenAt', first_seen_at,
            'lastSeenAt', last_seen_at
          ) order by booking_count desc, last_seen_at desc, display_value asc
        ) filter (where identity_type = 'email'), '[]'::jsonb) as observed_emails,
        coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'value', display_value,
            'bookingCount', booking_count,
            'firstSeenAt', first_seen_at,
            'lastSeenAt', last_seen_at
          ) order by booking_count desc, last_seen_at desc, display_value asc
        ) filter (where identity_type = 'phone'), '[]'::jsonb) as observed_phones
      from contact_values
    )
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
      'contactSummary', pg_catalog.jsonb_build_object(
        'semantics', 'observed',
        'emailCount', contacts.email_count,
        'phoneCount', contacts.phone_count,
        'singleEmail', contacts.single_email,
        'singlePhone', contacts.single_phone
      ),
      'directEmails', '[]'::jsonb,
      'directPhones', '[]'::jsonb,
      'observedEmails', contacts.observed_emails,
      'observedPhones', contacts.observed_phones,
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
    cross join contacts
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
      booking.promotion_code,
      coalesce(nullif(pg_catalog.btrim(booking.email_raw), ''), nullif(booking.email_normalized, '')) as email,
      coalesce(nullif(pg_catalog.btrim(booking.phone_raw), ''), nullif(booking.phone_normalized, '')) as phone
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
            'promotionCode', paged.promotion_code,
            'email', paged.email,
            'phone', paged.phone
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

revoke all on function public.customer_window_v2_list_representations_by_purchase_period(
  date, date, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_v2_get_representation_summary(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_v2_list_representation_bookings(
  text, text, integer, integer
) from public, anon, authenticated, service_role;

grant execute on function public.customer_window_v2_list_representations_by_purchase_period(
  date, date, integer, integer
) to service_role;
grant execute on function public.customer_window_v2_get_representation_summary(text, text)
  to service_role;
grant execute on function public.customer_window_v2_list_representation_bookings(
  text, text, integer, integer
) to service_role;

comment on function public.customer_window_v2_list_representations_by_purchase_period(
  date, date, integer, integer
) is 'Lists active-snapshot MCP/EAP analytical representations with bounded contact summaries that never invent a primary contact.';
comment on function public.customer_window_v2_get_representation_summary(text, text) is
  'Returns direct active identities for confirmed customers or snapshot-scoped observed contacts for related-review groups.';
comment on function public.customer_window_v2_list_representation_bookings(
  text, text, integer, integer
) is 'Lists active-snapshot MCP/EAP booking facts including the email and phone observed on each source booking.';

commit;
