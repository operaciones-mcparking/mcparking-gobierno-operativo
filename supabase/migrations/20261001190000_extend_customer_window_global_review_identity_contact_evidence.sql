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
), events as materialized (
  select event.* from resolved r join public.customer_identity_resolution_events event
    on event.profile_id = r.profile_id or event.related_profile_id = r.profile_id
), active_snapshot as materialized (
  select (pg_catalog.array_agg(snapshot_id))[1] snapshot_id from public.customer_related_review_snapshots
  where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active'
  having count(*) = 1
), profile_contacts as materialized (
  select distinct contact.type, contact.normalized_value, contact.display_value
  from links link
  left join public.customer_source_bookings_mcp_eap mcp
    on link.source = 'MCP_EAP' and mcp.source = link.source and mcp.source_row_id = link.source_row_id
  left join public.customer_source_bookings_okp okp
    on link.source = 'OKP' and okp.source = link.source and okp.source_row_id = link.source_row_id
  cross join lateral (values
    ('email'::text,
      nullif(coalesce(mcp.email_normalized, okp.email_normalized), ''),
      coalesce(nullif(pg_catalog.btrim(mcp.email_raw), ''), nullif(mcp.email_normalized, ''), nullif(okp.email_normalized, ''))),
    ('phone'::text,
      nullif(coalesce(mcp.phone_normalized, okp.phone_normalized), ''),
      coalesce(nullif(pg_catalog.btrim(mcp.phone_raw), ''), nullif(mcp.phone_normalized, ''), nullif(okp.phone_normalized, '')))
  ) contact(type, normalized_value, display_value)
  where contact.normalized_value is not null
), direct_related_evidence as materialized (
  select distinct member.group_id, member.snapshot_id,
    'profile_membership'::text evidence_source, 'profile_membership'::text relation_reason,
    null::text contact_type, null::text display_value, null::text normalized_value
  from resolved r cross join active_snapshot snapshot
  join public.customer_related_review_members member
    on member.snapshot_id = snapshot.snapshot_id and member.profile_id = r.profile_id
), contact_related_evidence as materialized (
  select distinct assignment.related_group_id group_id, assignment.snapshot_id,
    'contact_match'::text evidence_source, 'same_phone_history'::text relation_reason,
    contact.type contact_type, contact.display_value, contact.normalized_value
  from profile_contacts contact
  cross join active_snapshot snapshot
  join public.customer_source_bookings_mcp_eap booking
    on contact.type = 'phone' and booking.phone_normalized = contact.normalized_value
  join public.customer_analytical_booking_assignments assignment
    on assignment.snapshot_id = snapshot.snapshot_id
    and assignment.source = booking.source
    and assignment.source_row_id = booking.source_row_id
    and assignment.representation_type = 'related_review'

  union

  select distinct assignment.related_group_id, assignment.snapshot_id,
    'contact_match'::text, 'same_email_history'::text,
    contact.type, contact.display_value, contact.normalized_value
  from profile_contacts contact
  cross join active_snapshot snapshot
  join public.customer_source_bookings_mcp_eap booking
    on contact.type = 'email' and booking.email_normalized = contact.normalized_value
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
    'resolverVersion', resolver_version, 'reason', reason_code, 'evidence', evidence,
    'createdAt', created_at) order by created_at desc, id desc) from events), '[]'::jsonb),
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
