begin;

create or replace function public.customer_window_360_v1_get_global_review_identity(p_locator jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with resolved as materialized (
  select public.customer_window_global_review_v1_resolve_locator(p_locator) profile_id
), links as materialized (
  select link.* from resolved r join public.customer_booking_profile_links link
    on link.profile_id = r.profile_id and link.status in ('candidate', 'conflict')
), active_snapshot as materialized (
  select (pg_catalog.array_agg(snapshot_id))[1] snapshot_id from public.customer_related_review_snapshots
  where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active'
  having count(*) = 1
), profile_contacts as materialized (
  select distinct contact.type, contact.normalized_value, contact.display_value, link.source
  from links link
  left join public.customer_source_bookings_mcp_eap mcp
    on link.source = 'MCP_EAP' and mcp.source = link.source and mcp.source_row_id = link.source_row_id
  left join public.customer_source_bookings_okp okp
    on link.source = 'OKP' and okp.source = link.source and okp.source_row_id = link.source_row_id
  cross join lateral (values
    ('email'::text,
      nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(mcp.email_normalized, okp.email_normalized))), ''),
      nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(mcp.email_raw, mcp.email_normalized, okp.email_raw, okp.email_normalized))), '')),
    ('phone'::text,
      nullif(coalesce(mcp.phone_normalized, okp.phone_normalized), ''),
      coalesce(nullif(pg_catalog.btrim(mcp.phone_raw), ''), nullif(mcp.phone_normalized, ''),
        nullif(pg_catalog.btrim(okp.phone_raw), ''), nullif(okp.phone_normalized, '')))
  ) contact(type, normalized_value, display_value)
  where contact.normalized_value is not null
), event_bookings as materialized (
  select
    event.*,
    contact.email_normalized,
    contact.phone_normalized
  from resolved r
  join public.customer_identity_resolution_events event
    on event.profile_id = r.profile_id or event.related_profile_id = r.profile_id
  left join lateral (
    select
      nullif(pg_catalog.lower(pg_catalog.btrim(mcp.email_normalized)), '') as email_normalized,
      nullif(mcp.phone_normalized, '') as phone_normalized
    from public.customer_source_bookings_mcp_eap mcp
    where event.source = 'MCP_EAP'
      and mcp.source = event.source
      and mcp.source_row_id = event.source_row_id
    union all
    select
      nullif(pg_catalog.lower(pg_catalog.btrim(okp.email_normalized)), ''),
      nullif(okp.phone_normalized, '')
    from public.customer_source_bookings_okp okp
    where event.source = 'OKP'
      and okp.source = event.source
      and okp.source_row_id = event.source_row_id
    limit 1
  ) contact on true
), event_evidence as materialized (
  select
    event.*,
    coalesce(phone_stats.emails_for_phone, 0)::integer as emails_for_phone,
    coalesce(email_stats.phones_for_email, 0)::integer as phones_for_email,
    coalesce(phone_stats.phone_booking_count, 0)::integer as phone_booking_count,
    coalesce(email_stats.email_booking_count, 0)::integer as email_booking_count,
    (
      event.phone_normalized is not null
      and coalesce(phone_stats.emails_for_phone, 0)
        > case when event.email_normalized is null then 0 else 1 end
    )
    or (
      event.email_normalized is not null
      and coalesce(email_stats.phones_for_email, 0)
        > case when event.phone_normalized is null then 0 else 1 end
    ) as normalized_contradiction
  from event_bookings event
  left join lateral (
    select
      count(distinct booking.email_normalized) filter (where booking.email_normalized is not null)::integer as emails_for_phone,
      count(*)::integer as phone_booking_count
    from (
      select nullif(pg_catalog.lower(pg_catalog.btrim(okp.email_normalized)), '') as email_normalized
      from public.customer_source_bookings_okp okp
      where event.phone_normalized is not null
        and okp.phone_normalized = event.phone_normalized
        and (
          (okp.status_raw = 'PAGADA' and okp.is_confirmed is true and okp.is_paid is true)
          or (okp.status_raw = 'REEMPLAZADA' and okp.is_confirmed is true)
        )
      union all
      select nullif(pg_catalog.lower(pg_catalog.btrim(mcp.email_normalized)), '')
      from public.customer_source_bookings_mcp_eap mcp
      where event.phone_normalized is not null
        and mcp.phone_normalized = event.phone_normalized
        and mcp.booking_status in (1, 8)
    ) booking
  ) phone_stats on true
  left join lateral (
    select
      count(distinct booking.phone_normalized) filter (where booking.phone_normalized is not null)::integer as phones_for_email,
      count(*)::integer as email_booking_count
    from (
      select nullif(okp.phone_normalized, '') as phone_normalized
      from public.customer_source_bookings_okp okp
      where event.email_normalized is not null
        and nullif(pg_catalog.lower(pg_catalog.btrim(okp.email_normalized)), '') = event.email_normalized
        and (
          (okp.status_raw = 'PAGADA' and okp.is_confirmed is true and okp.is_paid is true)
          or (okp.status_raw = 'REEMPLAZADA' and okp.is_confirmed is true)
        )
      union all
      select nullif(mcp.phone_normalized, '')
      from public.customer_source_bookings_mcp_eap mcp
      where event.email_normalized is not null
        and nullif(pg_catalog.lower(pg_catalog.btrim(mcp.email_normalized)), '') = event.email_normalized
        and mcp.booking_status in (1, 8)
    ) booking
  ) email_stats on true
), observed_contacts as materialized (
  select
    contact.type,
    contact.normalized_value,
    coalesce(min(contact.display_value), contact.normalized_value) as display_value,
    (pg_catalog.array_agg(contact.source order by contact.source))[1] as source,
    count(distinct contact.source)::bigint as source_count,
    'observed_in_group'::text as relation,
    null::text as relation_reason,
    1::integer as relation_priority
  from profile_contacts contact
  group by contact.type, contact.normalized_value
), same_phone_contacts as materialized (
  select
    'email'::text as type,
    booking.email_normalized as normalized_value,
    booking.email_normalized as display_value,
    (pg_catalog.array_agg(booking.source order by booking.source))[1] as source,
    count(distinct booking.source)::bigint as source_count,
    'historically_related'::text as relation,
    'same_phone_history'::text as relation_reason,
    2::integer as relation_priority
  from profile_contacts pivot
  cross join lateral (
    select 'OKP'::text as source, nullif(pg_catalog.lower(pg_catalog.btrim(okp.email_normalized)), '') as email_normalized
    from public.customer_source_bookings_okp okp
    where pivot.type = 'phone'
      and okp.phone_normalized = pivot.normalized_value
      and (
        (okp.status_raw = 'PAGADA' and okp.is_confirmed is true and okp.is_paid is true)
        or (okp.status_raw = 'REEMPLAZADA' and okp.is_confirmed is true)
      )
    union all
    select 'MCP_EAP'::text, nullif(pg_catalog.lower(pg_catalog.btrim(mcp.email_normalized)), '')
    from public.customer_source_bookings_mcp_eap mcp
    where pivot.type = 'phone'
      and mcp.phone_normalized = pivot.normalized_value
      and mcp.booking_status in (1, 8)
  ) booking
  where booking.email_normalized is not null
  group by booking.email_normalized
), same_email_contacts as materialized (
  select
    'phone'::text as type,
    booking.phone_normalized as normalized_value,
    booking.phone_normalized as display_value,
    (pg_catalog.array_agg(booking.source order by booking.source))[1] as source,
    count(distinct booking.source)::bigint as source_count,
    'historically_related'::text as relation,
    'same_email_history'::text as relation_reason,
    2::integer as relation_priority
  from profile_contacts pivot
  cross join lateral (
    select 'OKP'::text as source, nullif(okp.phone_normalized, '') as phone_normalized
    from public.customer_source_bookings_okp okp
    where pivot.type = 'email'
      and nullif(pg_catalog.lower(pg_catalog.btrim(okp.email_normalized)), '') = pivot.normalized_value
      and (
        (okp.status_raw = 'PAGADA' and okp.is_confirmed is true and okp.is_paid is true)
        or (okp.status_raw = 'REEMPLAZADA' and okp.is_confirmed is true)
      )
    union all
    select 'MCP_EAP'::text, nullif(mcp.phone_normalized, '')
    from public.customer_source_bookings_mcp_eap mcp
    where pivot.type = 'email'
      and nullif(pg_catalog.lower(pg_catalog.btrim(mcp.email_normalized)), '') = pivot.normalized_value
      and mcp.booking_status in (1, 8)
  ) booking
  where booking.phone_normalized is not null
  group by booking.phone_normalized
), ranked_contacts as materialized (
  select contact.*,
    row_number() over (
      partition by contact.type, contact.normalized_value
      order by contact.relation_priority
    ) as contact_rank
  from (
    select * from observed_contacts
    union all
    select * from same_phone_contacts
    union all
    select * from same_email_contacts
  ) contact
), contacts as materialized (
  select * from ranked_contacts where contact_rank = 1
), related_contacts as materialized (
  select pg_catalog.jsonb_build_object(
    'emails', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'value', contact.display_value,
      'type', contact.type,
      'source', contact.source,
      'sourceRowId', null,
      'bookingCode', null,
      'observedAt', null,
      'relation', contact.relation,
      'relationReason', contact.relation_reason,
      'profileId', null,
      'firstSeenAt', null,
      'lastSeenAt', null,
      'sourceCount', contact.source_count,
      'bookingCount', 0
    ) order by contact.relation_priority, contact.display_value)
      filter (where contact.type = 'email'), '[]'::jsonb),
    'phones', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'value', contact.display_value,
      'type', contact.type,
      'source', contact.source,
      'sourceRowId', null,
      'bookingCode', null,
      'observedAt', null,
      'relation', contact.relation,
      'relationReason', contact.relation_reason,
      'profileId', null,
      'firstSeenAt', null,
      'lastSeenAt', null,
      'sourceCount', contact.source_count,
      'bookingCount', 0
    ) order by contact.relation_priority, contact.display_value)
      filter (where contact.type = 'phone'), '[]'::jsonb)
  ) value
  from contacts contact
), direct_related_evidence as materialized (
  select distinct member.group_id, member.snapshot_id,
    'profile_membership'::text evidence_source, 'profile_membership'::text relation_reason,
    null::text contact_type, null::text display_value, null::text normalized_value
  from resolved r cross join active_snapshot snapshot
  join public.customer_related_review_members member
    on member.snapshot_id = snapshot.snapshot_id and member.profile_id = r.profile_id
), contact_related_evidence as materialized (
  select distinct assignment.related_group_id group_id, assignment.snapshot_id,
    'contact_match'::text evidence_source,
    case when contact.type = 'phone' then 'same_phone_history' else 'same_email_history' end relation_reason,
    contact.type contact_type, contact.display_value, contact.normalized_value
  from profile_contacts contact
  cross join active_snapshot snapshot
  join public.customer_source_bookings_mcp_eap booking
    on (
      (contact.type = 'phone' and booking.phone_normalized = contact.normalized_value)
      or (contact.type = 'email'
        and nullif(pg_catalog.lower(pg_catalog.btrim(booking.email_normalized)), '') = contact.normalized_value)
    )
  join public.customer_analytical_booking_assignments assignment
    on assignment.snapshot_id = snapshot.snapshot_id
    and assignment.source = booking.source
    and assignment.source_row_id = booking.source_row_id
    and assignment.representation_type = 'related_review'
), related_evidence as materialized (
  select * from direct_related_evidence
  union
  select * from contact_related_evidence
)
select pg_catalog.jsonb_build_object(
  'ok', true, 'contractVersion', 'CUSTOMER_360_GLOBAL_REVIEW_IDENTITY_V1',
  'locator', p_locator,
  'profile', pg_catalog.jsonb_build_object(
    'profileId', profile.id, 'status', profile.status, 'needsReview', profile.needs_review,
    'mergedIntoProfileId', profile.merged_into_profile_id, 'resolverVersion', profile.resolver_version),
  'links', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'bookingLinkId', id, 'source', source, 'sourceRowId', source_row_id,
    'status', status, 'confidence', confidence, 'resolverVersion', resolver_version,
    'evidence', evidence) order by source, source_row_id) from links), '[]'::jsonb),
  'events', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'eventId', id, 'eventType', event_type, 'source', source, 'sourceRowId', source_row_id,
    'resolverVersion', resolver_version,
    'reason', case
      when reason_code = 'contradictory_phone_email' and normalized_contradiction is false
        then 'requires_review'
      else reason_code
    end,
    'evidence', pg_catalog.jsonb_strip_nulls(
      coalesce(evidence, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'contradictorySignals', normalized_contradiction,
        'phoneContradictory', emails_for_phone > 1,
        'emailContradictory', phones_for_email > 1,
        'emailsForPhone', emails_for_phone,
        'phonesForEmail', phones_for_email,
        'phoneBookingCount', phone_booking_count,
        'emailBookingCount', email_booking_count
      )
    ),
    'createdAt', created_at) order by created_at desc, id desc) from event_evidence), '[]'::jsonb),
  'relatedContacts', coalesce((select value from related_contacts), '{"emails":[],"phones":[]}'::jsonb),
  'relatedMcpEapEvidence', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'groupId', group_id, 'snapshotId', snapshot_id, 'evidenceSource', evidence_source,
    'relationReason', relation_reason, 'contactType', contact_type, 'displayValue', display_value,
    'normalizedValue', normalized_value))
    order by group_id, evidence_source, relation_reason, contact_type, normalized_value) from related_evidence), '[]'::jsonb)
)
from resolved r join public.customer_profiles profile on profile.id = r.profile_id;
$function$;

alter function public.customer_window_360_v1_get_global_review_identity(jsonb) owner to postgres;
revoke all on function public.customer_window_360_v1_get_global_review_identity(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.customer_window_360_v1_get_global_review_identity(jsonb) to customer_window_360_reader;

commit;
