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
    'events', v_events
  );
end;
$$;

revoke all on function public.customer_window_v2_get_identity_resolution_detail(text)
  from public, anon, authenticated;
grant execute on function public.customer_window_v2_get_identity_resolution_detail(text)
  to service_role;

comment on function public.customer_window_v2_get_identity_resolution_detail(text) is
  'Read-only active-snapshot identity-resolution evidence for one related-review group. Returns no raw identity values.';

commit;
