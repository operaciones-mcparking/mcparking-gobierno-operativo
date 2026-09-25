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
    select booking.email_normalized as normalized_value,
      nullif(pg_catalog.btrim(booking.email_raw), '') as raw_value,
      booking.source_created_at, booking.source_row_id
    from observed_contacts pivot
    cross join scoped_contradictions contradiction
    join public.customer_source_bookings_mcp_eap booking
      on booking.phone_normalized = pivot.normalized_value
     and booking.source = 'MCP_EAP' and booking.booking_status in (1, 8)
    where pivot.identity_type = 'phone' and contradiction.expand_email_by_phone
      and nullif(booking.email_normalized, '') is not null
  ), same_phone_historical_contacts as materialized (
    select 'email'::text as identity_type, observation.normalized_value,
      coalesce( (pg_catalog.array_agg(observation.raw_value
        order by observation.source_created_at desc, observation.source_row_id desc)
        filter (where observation.raw_value is not null))[1], observation.normalized_value ) as display_value,
      null::uuid as profile_id, min(observation.source_created_at) as first_seen_at,
      max(observation.source_created_at) as last_seen_at, 1::bigint as source_count,
      count(distinct observation.source_row_id)::bigint as booking_count,
      'historically_related'::text as relation, 'same_phone_history'::text as relation_reason,
      2::integer as relation_priority
    from same_phone_history_observations observation group by observation.normalized_value
  ), same_email_history_observations as materialized (
    select booking.phone_normalized as normalized_value,
      nullif(pg_catalog.btrim(booking.phone_raw), '') as raw_value,
      booking.source_created_at, booking.source_row_id
    from observed_contacts pivot
    cross join scoped_contradictions contradiction
    join public.customer_source_bookings_mcp_eap booking
      on booking.email_normalized = pivot.normalized_value
     and booking.source = 'MCP_EAP' and booking.booking_status in (1, 8)
    where pivot.identity_type = 'email' and contradiction.expand_phone_by_email
      and nullif(booking.phone_normalized, '') is not null
  ), same_email_historical_contacts as materialized (
    select 'phone'::text as identity_type, observation.normalized_value,
      coalesce( (pg_catalog.array_agg(observation.raw_value
        order by observation.source_created_at desc, observation.source_row_id desc)
        filter (where observation.raw_value is not null))[1], observation.normalized_value ) as display_value,
      null::uuid as profile_id, min(observation.source_created_at) as first_seen_at,
      max(observation.source_created_at) as last_seen_at, 1::bigint as source_count,
      count(distinct observation.source_row_id)::bigint as booking_count,
      'historically_related'::text as relation, 'same_email_history'::text as relation_reason,
      2::integer as relation_priority
    from same_email_history_observations observation group by observation.normalized_value
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

-- Catalog contract.
do $$
declare
  v_oid oid := pg_catalog.to_regprocedure(
    'public.customer_window_v2_get_identity_resolution_detail(text)');
begin
  if v_oid is null then raise exception 'identity detail RPC missing'; end if;
  if not exists (
    select 1 from pg_catalog.pg_proc procedure
    join pg_catalog.pg_language language on language.oid = procedure.prolang
    where procedure.oid = v_oid
      and procedure.prorettype = 'jsonb'::pg_catalog.regtype
      and language.lanname = 'plpgsql'
      and procedure.provolatile = 's'
      and procedure.prosecdef
      and exists (
        select 1 from pg_catalog.unnest(procedure.proconfig) setting
        where setting in ('search_path=', 'search_path=""')
      )
  ) then raise exception 'identity detail RPC catalog contract failed'; end if;
  if pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'identity detail RPC ACL contract failed';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.aclexplode(coalesce(
      procedure.proacl,
      pg_catalog.acldefault('f', procedure.proowner)
    )) acl
    where procedure.oid = v_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then raise exception 'identity detail RPC PUBLIC execute is not revoked'; end if;
end;
$$;

create temp table identity_detail_cases on commit drop as
with active_snapshot as (
  select snapshot.snapshot_id
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and snapshot.status = 'active'
), candidates as (
  select related_group.*
  from public.customer_related_review_groups related_group
  join active_snapshot snapshot using (snapshot_id)
)
select
  (select group_id from candidates where profile_count = 1 order by booking_count, group_id limit 1) as one_profile_group,
  (select group_id from candidates where profile_count > 1 order by booking_count, group_id limit 1) as multiple_profile_group,
  (select group_id from candidates order by booking_count desc, group_id limit 1) as large_group,
  (
    select candidate.group_id
    from candidates candidate
    where exists (
      select 1
      from public.customer_related_review_members member
      join public.customer_profiles profile on profile.id = member.profile_id
      where member.snapshot_id = candidate.snapshot_id
        and member.group_id = candidate.group_id
        and profile.status = 'merged'
        and profile.merged_into_profile_id is not null
    )
    order by candidate.booking_count, candidate.group_id
    limit 1
  ) as merged_profile_group,
  (
    select count(distinct member.profile_id)::bigint
    from candidates candidate
    join public.customer_related_review_members member
      on member.snapshot_id = candidate.snapshot_id
     and member.group_id = candidate.group_id
    join public.customer_profiles profile on profile.id = member.profile_id
    where profile.status = 'merged'
  ) as merged_status_profile_count,
  (
    select count(distinct member.profile_id)::bigint
    from candidates candidate
    join public.customer_related_review_members member
      on member.snapshot_id = candidate.snapshot_id
     and member.group_id = candidate.group_id
    join public.customer_profiles profile on profile.id = member.profile_id
    where profile.merged_into_profile_id is not null
  ) as merged_pointer_profile_count;

do $$
declare
  v_case record;
  v_payload jsonb;
  v_missing_group_rejected boolean := false;
begin
  select * into v_case from identity_detail_cases;
  if v_case.one_profile_group is null or v_case.multiple_profile_group is null
    or v_case.large_group is null then
    raise exception 'Required real groups are unavailable';
  end if;
  v_payload := public.customer_window_v2_get_identity_resolution_detail(v_case.one_profile_group);
  if pg_catalog.jsonb_array_length(v_payload -> 'profiles') <> 1 then
    raise exception 'one profile case failed';
  end if;
  v_payload := public.customer_window_v2_get_identity_resolution_detail(v_case.multiple_profile_group);
  if pg_catalog.jsonb_array_length(v_payload -> 'profiles') <= 1 then
    raise exception 'multiple profile case failed';
  end if;
  v_payload := public.customer_window_v2_get_identity_resolution_detail(v_case.large_group);
  if (v_payload #>> '{summary,bookingCount}')::bigint
      <> pg_catalog.jsonb_array_length(v_payload -> 'members') then
    raise exception 'large group case failed';
  end if;
  begin
    perform public.customer_window_v2_get_identity_resolution_detail(
      pg_catalog.repeat('f', 64));
  exception when others then
    v_missing_group_rejected := true;
  end;
  if not v_missing_group_rejected then raise exception 'missing group was accepted'; end if;
end;
$$;

with cases as (
  select
    public.customer_window_v2_get_identity_resolution_detail(one_profile_group) as one_profile,
    public.customer_window_v2_get_identity_resolution_detail(multiple_profile_group) as multiple_profiles,
    public.customer_window_v2_get_identity_resolution_detail(large_group) as large_group,
    case
      when merged_profile_group is null then null
      else public.customer_window_v2_get_identity_resolution_detail(merged_profile_group)
    end as merged_profile
  from identity_detail_cases
), case_payloads as (
  select selected.group_id, selected.payload
  from cases
  cross join identity_detail_cases case_id
  cross join lateral (values
    (case_id.one_profile_group, cases.one_profile),
    (case_id.multiple_profile_group, cases.multiple_profiles),
    (case_id.large_group, cases.large_group)
  ) selected(group_id, payload)
), all_events as (
  select scoped.group_id, event.value
  from case_payloads scoped
  cross join lateral pg_catalog.jsonb_array_elements(scoped.payload -> 'events') event(value)
), active_snapshot as (
  select snapshot_id from public.customer_related_review_snapshots
  where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active'
)
select
  pg_catalog.jsonb_array_length(cases.one_profile -> 'profiles') = 1 as one_profile_ok,
  pg_catalog.jsonb_array_length(cases.multiple_profiles -> 'profiles') > 1 as multiple_profiles_ok,
  exists (select 1 from all_events where value ->> 'resolverVersion' = 'customer_identity_v1'
    and value ->> 'reason' = 'contradictory_phone_email') as v1_contradictory_phone_email_available,
  exists (select 1 from all_events where value ->> 'resolverVersion' = 'customer_identity_v2'
    and value ->> 'reason' = 'review_profile_reused_exact') as v2_review_profile_reused_exact_available,
  not exists (select 1 from all_events where pg_catalog.jsonb_typeof(value -> 'evidence') <> 'object') as partial_evidence_supported,
  case_id.merged_profile_group is not null as merged_profile_case_available,
  case_id.merged_status_profile_count,
  case_id.merged_pointer_profile_count,
  case
    when case_id.merged_profile_group is null then true
    else
      exists (
        select 1
        from pg_catalog.jsonb_array_elements(cases.merged_profile -> 'profiles') returned(value)
        join public.customer_profiles profile
          on profile.id = (returned.value ->> 'profileId')::uuid
        where profile.status = 'merged'
          and profile.merged_into_profile_id is not null
          and returned.value ->> 'status' = 'merged'
          and returned.value ->> 'mergedIntoProfileId'
            = profile.merged_into_profile_id::text
      )
      and not exists (
        select 1
        from public.customer_related_review_members member
        join active_snapshot snapshot on snapshot.snapshot_id = member.snapshot_id
        join public.customer_profiles profile on profile.id = member.profile_id
        where member.group_id = case_id.merged_profile_group
          and profile.status = 'merged'
          and profile.merged_into_profile_id is not null
          and not exists (
            select 1
            from pg_catalog.jsonb_array_elements(cases.merged_profile -> 'profiles') returned(value)
            where returned.value ->> 'profileId' = profile.id::text
              and returned.value ->> 'status' = 'merged'
              and returned.value ->> 'mergedIntoProfileId'
                = profile.merged_into_profile_id::text
          )
      )
  end as merged_profile_supported,
  pg_catalog.jsonb_array_length(cases.large_group -> 'members') >= 1 as large_group_ok,
  not exists (
    select 1
    from case_payloads scoped
    where pg_catalog.jsonb_typeof(scoped.payload -> 'relatedContacts') <> 'object'
      or pg_catalog.jsonb_typeof(scoped.payload #> '{relatedContacts,emails}') <> 'array'
      or pg_catalog.jsonb_typeof(scoped.payload #> '{relatedContacts,phones}') <> 'array'
  ) as related_contacts_shape_ok,
  not exists (
    select 1
    from case_payloads scoped
    cross join lateral pg_catalog.jsonb_array_elements(
      (scoped.payload #> '{relatedContacts,emails}') ||
      (scoped.payload #> '{relatedContacts,phones}')) contact(value)
    where contact.value ->> 'profileId' is not null
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(scoped.payload -> 'profiles') profile(value)
        where profile.value ->> 'profileId' = contact.value ->> 'profileId'
      )
  ) as related_contacts_profile_scope_ok,
  not exists (
    select 1
    from case_payloads scoped
    cross join lateral (values ('emails'::text), ('phones'::text)) kind(name)
    cross join lateral pg_catalog.jsonb_array_elements(
      scoped.payload #> array['relatedContacts', kind.name]) contact(value)
    group by scoped.group_id, kind.name, contact.value ->> 'value'
    having count(*) > 1
  ) as related_contacts_deduped_ok,
  not exists (
    select 1
    from case_payloads scoped
    cross join lateral pg_catalog.jsonb_array_elements(
      (scoped.payload #> '{relatedContacts,emails}') ||
      (scoped.payload #> '{relatedContacts,phones}')) contact(value)
    where (contact.value ->> 'relation' = 'observed_in_group'
        and contact.value ->> 'relationReason' is not null)
      or (contact.value ->> 'relation' = 'historically_related'
        and contact.value ->> 'relationReason' not in (
          'same_phone_history', 'same_email_history', 'same_profile_history'))
  ) as related_contacts_reason_ok,
  true as missing_group_rejected,
  (cases.one_profile ->> 'snapshotId')::uuid = (select snapshot_id from active_snapshot) as active_scope_ok,
  (select count(*) from all_events event
    where not exists (
      select 1
      from active_snapshot snapshot
      join public.customer_related_review_members member
        on member.snapshot_id = snapshot.snapshot_id
       and member.group_id = event.group_id
       and member.source = event.value ->> 'source'
       and member.source_row_id = (event.value ->> 'sourceRowId')::bigint
    )) as cross_group_leakage_count
from cases
cross join identity_detail_cases case_id;

rollback;

select pg_catalog.to_regprocedure(
  'public.customer_window_v2_get_identity_resolution_detail(text)') is not null
  as rpc_restored_after_rollback;
