begin;

create or replace function public.customer_window_v2_get_identity_resolution_detail(
  p_related_group_id text
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
  v_group public.customer_related_review_groups%rowtype;
  v_member_count bigint;
  v_assignment_count bigint;
  v_profiles jsonb;
  v_members jsonb;
  v_events jsonb;
  v_related_contacts jsonb;
begin
  if p_related_group_id is null
    or p_related_group_id !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid related group ID' using errcode = '22023';
  end if;

  select count(*)::integer, (pg_catalog.array_agg(snapshot.snapshot_id))[1]
  into v_active_snapshot_count, v_snapshot_id
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and snapshot.status = 'active';

  if v_active_snapshot_count <> 1 or v_snapshot_id is null then
    raise exception 'Identity resolution detail requires exactly one active snapshot'
      using errcode = 'P0001';
  end if;

  select related_group.* into v_group
  from public.customer_related_review_groups related_group
  where related_group.snapshot_id = v_snapshot_id
    and related_group.group_id = p_related_group_id;

  if not found then
    raise exception 'Related group is not part of the active snapshot'
      using errcode = 'P0001';
  end if;

  select count(*)::bigint into v_member_count
  from public.customer_related_review_members member
  where member.snapshot_id = v_snapshot_id
    and member.group_id = p_related_group_id
    and member.source = 'MCP_EAP';

  select count(*)::bigint into v_assignment_count
  from public.customer_analytical_booking_assignments assignment
  where assignment.snapshot_id = v_snapshot_id
    and assignment.related_group_id = p_related_group_id
    and assignment.source = 'MCP_EAP'
    and assignment.representation_type = 'related_review'
    and assignment.customer_id is null;

  if v_member_count <> v_group.booking_count
    or v_assignment_count <> v_group.booking_count then
    raise exception 'Related group membership is inconsistent'
      using errcode = 'P0001';
  end if;

  with profile_facts as (
    select
      member.profile_id,
      profile.status,
      profile.merged_into_profile_id,
      count(*)::bigint as booking_count,
      min(booking.source_created_at) as first_booking_at,
      max(booking.source_created_at) as last_booking_at,
      pg_catalog.jsonb_agg(distinct member.resolver_version
        order by member.resolver_version) as resolver_versions
    from public.customer_related_review_members member
    join public.customer_profiles profile on profile.id = member.profile_id
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = member.source
     and booking.source_row_id = member.source_row_id
     and booking.source = 'MCP_EAP'
    where member.snapshot_id = v_snapshot_id
      and member.group_id = p_related_group_id
      and member.source = 'MCP_EAP'
    group by member.profile_id, profile.status, profile.merged_into_profile_id
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'profileId', profile.profile_id,
      'status', profile.status,
      'mergedIntoProfileId', profile.merged_into_profile_id,
      'bookingCount', profile.booking_count,
      'firstBookingAt', profile.first_booking_at,
      'lastBookingAt', profile.last_booking_at,
      'resolverVersions', profile.resolver_versions
    ) order by profile.first_booking_at, profile.profile_id
  ), '[]'::jsonb)
  into v_profiles
  from profile_facts profile;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'source', member.source,
      'sourceRowId', member.source_row_id,
      'profileId', member.profile_id,
      'linkStatus', member.link_status,
      'resolverVersion', member.resolver_version,
      'relationshipType', member.relationship_type,
      'reason', member.reason_code
    ) order by member.source_row_id
  ), '[]'::jsonb)
  into v_members
  from public.customer_related_review_members member
  where member.snapshot_id = v_snapshot_id
    and member.group_id = p_related_group_id
    and member.source = 'MCP_EAP';

  with scoped_members as materialized (
    select member.source, member.source_row_id
    from public.customer_related_review_members member
    where member.snapshot_id = v_snapshot_id
      and member.group_id = p_related_group_id
      and member.source = 'MCP_EAP'
  ), scoped_events as (
    select event.*
    from scoped_members member
    join public.customer_identity_resolution_events event
      on event.source = member.source
     and event.source_row_id = member.source_row_id
     and event.source = 'MCP_EAP'
     and event.event_type in ('candidate', 'conflict')
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'eventId', event.id,
      'source', event.source,
      'sourceRowId', event.source_row_id,
      'profileId', event.profile_id,
      'eventType', event.event_type,
      'resolverVersion', event.resolver_version,
      'reason', event.reason_code,
      'createdAt', event.created_at,
      'evidence', pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'matchedByEmail', case when pg_catalog.jsonb_typeof(event.evidence -> 'matchedByEmail') = 'boolean' then event.evidence -> 'matchedByEmail' end,
        'matchedBySourceCustomerId', case when pg_catalog.jsonb_typeof(event.evidence -> 'matchedBySourceCustomerId') = 'boolean' then event.evidence -> 'matchedBySourceCustomerId' end,
        'contradictorySignals', case when pg_catalog.jsonb_typeof(event.evidence -> 'contradictorySignals') = 'boolean' then event.evidence -> 'contradictorySignals' end,
        'reusedReviewProfile', case when pg_catalog.jsonb_typeof(event.evidence -> 'reusedReviewProfile') = 'boolean' then event.evidence -> 'reusedReviewProfile' end,
        'emailsForPhone', case when pg_catalog.jsonb_typeof(event.evidence -> 'emailsForPhone') = 'number' then event.evidence -> 'emailsForPhone' end,
        'phonesForEmail', case when pg_catalog.jsonb_typeof(event.evidence -> 'phonesForEmail') = 'number' then event.evidence -> 'phonesForEmail' end,
        'emailBookingCount', case when pg_catalog.jsonb_typeof(event.evidence -> 'emailBookingCount') = 'number' then event.evidence -> 'emailBookingCount' end,
        'phoneBookingCount', case when pg_catalog.jsonb_typeof(event.evidence -> 'phoneBookingCount') = 'number' then event.evidence -> 'phoneBookingCount' end
      ))
    ) order by event.created_at, event.id
  ), '[]'::jsonb)
  into v_events
  from scoped_events event;

  with scoped_members as materialized (
    select member.profile_id, member.source, member.source_row_id
    from public.customer_related_review_members member
    where member.snapshot_id = v_snapshot_id
      and member.group_id = p_related_group_id
      and member.source = 'MCP_EAP'
  ), scoped_profiles as materialized (
    select distinct member.profile_id
    from scoped_members member
  ), observed_contact_observations as materialized (
    select
      observation.identity_type,
      observation.normalized_value,
      observation.raw_value,
      member.profile_id,
      booking.source_created_at,
      booking.source_row_id
    from scoped_members member
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = member.source
     and booking.source_row_id = member.source_row_id
     and booking.source = 'MCP_EAP'
     and booking.booking_status in (1, 8)
    cross join lateral (
      values
        ('email'::text, nullif(booking.email_normalized, ''), nullif(pg_catalog.btrim(booking.email_raw), '')),
        ('phone'::text, nullif(booking.phone_normalized, ''), nullif(pg_catalog.btrim(booking.phone_raw), ''))
    ) observation(identity_type, normalized_value, raw_value)
    where observation.normalized_value is not null
  ), observed_contacts as materialized (
    select
      observation.identity_type,
      observation.normalized_value,
      coalesce(
        (pg_catalog.array_agg(observation.raw_value
          order by observation.source_created_at desc, observation.source_row_id desc)
          filter (where observation.raw_value is not null))[1],
        observation.normalized_value
      ) as display_value,
      case when count(distinct observation.profile_id) = 1
        then min(observation.profile_id::text)::uuid end as profile_id,
      min(observation.source_created_at) as first_seen_at,
      max(observation.source_created_at) as last_seen_at,
      1::bigint as source_count,
      count(distinct observation.source_row_id)::bigint as booking_count,
      'observed_in_group'::text as relation,
      null::text as relation_reason,
      1::integer as relation_priority
    from observed_contact_observations observation
    group by observation.identity_type, observation.normalized_value
  ), scoped_contradictions as materialized (
    select
      coalesce(bool_or(
        event.reason_code = 'contradictory_phone_email'
        and coalesce((event.evidence ->> 'contradictorySignals')::boolean, false)
        and pg_catalog.jsonb_typeof(event.evidence -> 'emailsForPhone') = 'number'
        and (event.evidence ->> 'emailsForPhone')::integer > 1
      ), false) as expand_email_by_phone,
      coalesce(bool_or(
        event.reason_code = 'contradictory_phone_email'
        and coalesce((event.evidence ->> 'contradictorySignals')::boolean, false)
        and pg_catalog.jsonb_typeof(event.evidence -> 'phonesForEmail') = 'number'
        and (event.evidence ->> 'phonesForEmail')::integer > 1
      ), false) as expand_phone_by_email
    from scoped_members member
    join public.customer_identity_resolution_events event
      on event.source = member.source
     and event.source_row_id = member.source_row_id
     and event.source = 'MCP_EAP'
     and event.event_type in ('candidate', 'conflict')
  ), same_phone_history_observations as materialized (
    select
      booking.email_normalized as normalized_value,
      nullif(pg_catalog.btrim(booking.email_raw), '') as raw_value,
      booking.source_created_at,
      booking.source_row_id
    from observed_contacts pivot
    cross join scoped_contradictions contradiction
    join public.customer_source_bookings_mcp_eap booking
      on booking.phone_normalized = pivot.normalized_value
     and booking.source = 'MCP_EAP'
     and booking.booking_status in (1, 8)
    where pivot.identity_type = 'phone'
      and contradiction.expand_email_by_phone
      and nullif(booking.email_normalized, '') is not null
  ), same_phone_historical_contacts as materialized (
    select
      'email'::text as identity_type,
      observation.normalized_value,
      coalesce(
        (pg_catalog.array_agg(observation.raw_value
          order by observation.source_created_at desc, observation.source_row_id desc)
          filter (where observation.raw_value is not null))[1],
        observation.normalized_value
      ) as display_value,
      null::uuid as profile_id,
      min(observation.source_created_at) as first_seen_at,
      max(observation.source_created_at) as last_seen_at,
      1::bigint as source_count,
      count(distinct observation.source_row_id)::bigint as booking_count,
      'historically_related'::text as relation,
      'same_phone_history'::text as relation_reason,
      2::integer as relation_priority
    from same_phone_history_observations observation
    group by observation.normalized_value
  ), same_email_history_observations as materialized (
    select
      booking.phone_normalized as normalized_value,
      nullif(pg_catalog.btrim(booking.phone_raw), '') as raw_value,
      booking.source_created_at,
      booking.source_row_id
    from observed_contacts pivot
    cross join scoped_contradictions contradiction
    join public.customer_source_bookings_mcp_eap booking
      on booking.email_normalized = pivot.normalized_value
     and booking.source = 'MCP_EAP'
     and booking.booking_status in (1, 8)
    where pivot.identity_type = 'email'
      and contradiction.expand_phone_by_email
      and nullif(booking.phone_normalized, '') is not null
  ), same_email_historical_contacts as materialized (
    select
      'phone'::text as identity_type,
      observation.normalized_value,
      coalesce(
        (pg_catalog.array_agg(observation.raw_value
          order by observation.source_created_at desc, observation.source_row_id desc)
          filter (where observation.raw_value is not null))[1],
        observation.normalized_value
      ) as display_value,
      null::uuid as profile_id,
      min(observation.source_created_at) as first_seen_at,
      max(observation.source_created_at) as last_seen_at,
      1::bigint as source_count,
      count(distinct observation.source_row_id)::bigint as booking_count,
      'historically_related'::text as relation,
      'same_email_history'::text as relation_reason,
      2::integer as relation_priority
    from same_email_history_observations observation
    group by observation.normalized_value
  ), historical_identity_profiles as materialized (
    select distinct
      identity.identity_type,
      identity.identity_value_normalized as normalized_value,
      identity.profile_id,
      identity.source,
      identity.first_seen_at,
      identity.last_seen_at
    from scoped_profiles profile
    join public.customer_identity_links identity on identity.profile_id = profile.profile_id
    where identity.identity_type in ('email', 'phone')
      and identity.status in ('active', 'candidate', 'conflict')
      and nullif(pg_catalog.btrim(identity.identity_value_normalized), '') is not null
  ), historical_contacts_base as materialized (
    select
      identity.identity_type,
      identity.normalized_value,
      pg_catalog.array_agg(distinct identity.profile_id order by identity.profile_id) as profile_ids,
      case when count(distinct identity.profile_id) = 1
        then min(identity.profile_id::text)::uuid end as profile_id,
      min(identity.first_seen_at) as first_seen_at,
      max(identity.last_seen_at) as last_seen_at,
      count(distinct identity.source)::bigint as source_count
    from historical_identity_profiles identity
    group by identity.identity_type, identity.normalized_value
  ), historical_contacts as materialized (
    select
      historical.identity_type,
      historical.normalized_value,
      coalesce(raw_value.display_value, historical.normalized_value) as display_value,
      historical.profile_id,
      coalesce(historical.first_seen_at, raw_value.first_seen_at) as first_seen_at,
      coalesce(historical.last_seen_at, raw_value.last_seen_at) as last_seen_at,
      historical.source_count,
      coalesce(raw_value.booking_count, 0)::bigint as booking_count,
      'historically_related'::text as relation,
      'same_profile_history'::text as relation_reason,
      3::integer as relation_priority
    from historical_contacts_base historical
    left join lateral (
      select
        (pg_catalog.array_agg(
          case historical.identity_type
            when 'email' then nullif(pg_catalog.btrim(booking.email_raw), '')
            else nullif(pg_catalog.btrim(booking.phone_raw), '')
          end
          order by booking.source_created_at desc, booking.source_row_id desc
        ) filter (where case historical.identity_type
          when 'email' then nullif(pg_catalog.btrim(booking.email_raw), '')
          else nullif(pg_catalog.btrim(booking.phone_raw), '')
        end is not null))[1] as display_value,
        min(booking.source_created_at) as first_seen_at,
        max(booking.source_created_at) as last_seen_at,
        count(distinct booking.source_row_id)::bigint as booking_count
      from public.customer_booking_profile_links link
      join public.customer_source_bookings_mcp_eap booking
        on booking.source = link.source
       and booking.source_row_id = link.source_row_id
       and booking.source = 'MCP_EAP'
       and booking.booking_status in (1, 8)
      where link.profile_id = any(historical.profile_ids)
        and case historical.identity_type
          when 'email' then booking.email_normalized = historical.normalized_value
          else booking.phone_normalized = historical.normalized_value
        end
    ) raw_value on true
  ), ranked_contacts as (
    select contact.*,
      row_number() over (
        partition by contact.identity_type, contact.normalized_value
        order by contact.relation_priority
      ) as contact_rank
    from (
      select * from observed_contacts
      union all
      select * from same_phone_historical_contacts
      union all
      select * from same_email_historical_contacts
      union all
      select * from historical_contacts
    ) contact
  ), contacts as (
    select * from ranked_contacts contact where contact.contact_rank = 1
  )
  select pg_catalog.jsonb_build_object(
    'emails', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'value', contact.display_value,
      'relation', contact.relation,
      'relationReason', contact.relation_reason,
      'profileId', contact.profile_id,
      'firstSeenAt', contact.first_seen_at,
      'lastSeenAt', contact.last_seen_at,
      'sourceCount', contact.source_count,
      'bookingCount', contact.booking_count
    ) order by contact.relation_priority, contact.last_seen_at desc nulls last,
      contact.display_value) filter (where contact.identity_type = 'email'), '[]'::jsonb),
    'phones', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'value', contact.display_value,
      'relation', contact.relation,
      'relationReason', contact.relation_reason,
      'profileId', contact.profile_id,
      'firstSeenAt', contact.first_seen_at,
      'lastSeenAt', contact.last_seen_at,
      'sourceCount', contact.source_count,
      'bookingCount', contact.booking_count
    ) order by contact.relation_priority, contact.last_seen_at desc nulls last,
      contact.display_value) filter (where contact.identity_type = 'phone'), '[]'::jsonb)
  )
  into v_related_contacts
  from contacts contact;

  return pg_catalog.jsonb_build_object(
    'snapshotId', v_snapshot_id,
    'relatedGroupId', p_related_group_id,
    'summary', pg_catalog.jsonb_build_object(
      'bookingCount', v_group.booking_count,
      'profileCount', v_group.profile_count,
      'emailCount', v_group.email_count,
      'phoneCount', v_group.phone_count,
      'sourceCustomerCount', v_group.source_customer_count,
      'conflictCount', v_group.conflict_count,
      'candidateCount', v_group.candidate_count,
      'v1BookingCount', v_group.v1_booking_count,
      'v2BookingCount', v_group.v2_booking_count
    ),
    'profiles', v_profiles,
    'members', v_members,
    'events', v_events,
    'relatedContacts', v_related_contacts
  );
end;
$$;

revoke all on function public.customer_window_v2_get_identity_resolution_detail(text)
  from public, anon, authenticated;
grant execute on function public.customer_window_v2_get_identity_resolution_detail(text)
  to service_role;

comment on function public.customer_window_v2_get_identity_resolution_detail(text) is
  'Read-only active-snapshot identity-resolution evidence and one-hop group-pivot observed/historical contacts for one related-review group.';

commit;
