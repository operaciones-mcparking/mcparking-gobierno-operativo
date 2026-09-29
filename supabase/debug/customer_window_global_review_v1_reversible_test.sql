begin;

set local statement_timeout = '5min';
set local lock_timeout = '30s';

do $baseline$
begin
  if exists (
    select 1 from (values
    ('public.customer_window_global_review_v1_invalid(text)'),
    ('public.customer_window_global_review_v1_resolve_locator(jsonb)'),
    ('public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer)'),
    ('public.customer_window_v2_search_global_v1(text,text,text,bigint,text,integer)'),
    ('public.customer_window_360_v1_get_global_review_overview(jsonb)'),
    ('public.customer_window_360_v1_list_global_review_bookings(jsonb,integer,integer)'),
    ('public.customer_window_360_v1_list_global_review_contacts(jsonb,text,integer,integer)'),
    ('public.customer_window_360_v1_get_global_review_analytics(jsonb)'),
    ('public.customer_window_360_v1_get_global_review_identity(jsonb)')
    ) expected(signature)
    where pg_catalog.to_regprocedure(expected.signature) is not null
  ) then
    raise exception 'global_review_harness_requires_clean_baseline';
  end if;
end;
$baseline$;

create or replace function public.customer_window_global_review_v1_resolve_locator(
  p_locator jsonb
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
begin
  if p_locator is null
    or pg_catalog.jsonb_typeof(p_locator) <> 'object'
    or p_locator ->> 'representationType' <> 'global_review'
    or p_locator ->> 'customerUniverse' <> 'GLOBAL_REVIEW'
    or p_locator -> 'authoritySnapshotId' is distinct from 'null'::jsonb
    or coalesce(p_locator ->> 'representationKey', '') <> 'global_review:' || coalesce(p_locator ->> 'representationId', '')
    or coalesce(p_locator ->> 'representationId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'invalid_locator_contract' using errcode = '22023';
  end if;

  v_profile_id := (p_locator ->> 'representationId')::uuid;
  if not exists (
    select 1
    from public.customer_profiles profile
    where profile.id = v_profile_id
      and profile.status = 'active'
      and profile.merged_into_profile_id is null
      and profile.needs_review is true
  ) then
    raise exception 'representation_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.customer_booking_profile_links link
    where link.profile_id = v_profile_id and link.status = 'active'
  ) then
    raise exception 'representation_contract_unavailable' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.customer_booking_profile_links link
    where link.profile_id = v_profile_id and link.status in ('candidate', 'conflict')
  ) then
    raise exception 'stale_representation' using errcode = '40001';
  end if;
  return v_profile_id;
end;
$function$;

create or replace function public.customer_window_global_review_v1_invalid(p_reason text)
returns boolean
language plpgsql
stable
set search_path = ''
as $function$
begin
  raise exception 'Invalid global review %', p_reason using errcode = '22023';
end;
$function$;

create or replace function public.customer_window_v2_list_operational_global_v1(
  p_from date,
  p_to date,
  p_family text,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with input_guard as materialized (
  select case
    when p_from is null or p_to is null or p_from > p_to then public.customer_window_global_review_v1_invalid('period')
    when p_family not in ('OKP', 'MCP_EAP') then public.customer_window_global_review_v1_invalid('family')
    when p_page is null or p_page < 1 or p_page_size is null or p_page_size < 1 or p_page_size > 100
      then public.customer_window_global_review_v1_invalid('pagination')
    when p_family = 'MCP_EAP' and (
      select count(*)
      from public.customer_related_review_snapshots snapshot
      where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
        and snapshot.status = 'active'
    ) <> 1 then public.customer_window_global_review_v1_invalid('snapshot_authority')
    else true end as valid
), active_snapshot as materialized (
  select snapshot.snapshot_id, snapshot.captured_at
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and snapshot.status = 'active'
), source_rows as materialized (
  select b.source, b.source_row_id, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized, l.profile_id, l.status as link_status,
    true as is_stable
  from input_guard guard
  join public.customer_source_bookings_okp b on guard.valid and p_family = 'OKP'
  left join public.customer_booking_profile_links l
    on l.source = 'OKP' and l.source_row_id = b.source_row_id
  where b.source_created_at >= p_from::timestamp without time zone
    and b.source_created_at < (p_to + 1)::timestamp without time zone
    and ((b.status_raw = 'PAGADA' and b.is_confirmed is true and b.is_paid is true)
      or (b.status_raw = 'REEMPLAZADA' and b.is_confirmed is true))

  union all

  select b.source, b.source_row_id, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized, l.profile_id, l.status,
    greatest(b.created_at, b.updated_at, b.source_synced_at, l.created_at, l.updated_at)
      <= snapshot.captured_at - interval '30 minutes' as is_stable
  from input_guard guard
  join public.customer_source_bookings_mcp_eap b on guard.valid and p_family = 'MCP_EAP'
  cross join active_snapshot snapshot
  left join public.customer_booking_profile_links l
    on l.source = 'MCP_EAP' and l.source_row_id = b.source_row_id
  where b.booking_status in (1, 8)
    and b.source_created_at >= p_from::timestamp without time zone
    and b.source_created_at < (p_to + 1)::timestamp without time zone
), classified as materialized (
  select row.*,
    case row.link_status when 'active' then 'confirmed_customer' else 'global_review' end representation_type
  from source_rows row
  join public.customer_profiles profile on profile.id = row.profile_id
    and profile.status = 'active' and profile.merged_into_profile_id is null
  where row.is_stable
    and (row.link_status = 'active'
      or (row.link_status in ('candidate', 'conflict') and profile.needs_review is true
        and not exists (
          select 1 from public.customer_booking_profile_links active_link
          where active_link.profile_id = row.profile_id and active_link.status = 'active'
        )))
), reconciliation as materialized (
  select
    count(*)::bigint as valid_reservations,
    count(*) filter (where is_stable)::bigint as stable_reservations,
    count(*) filter (where not is_stable)::bigint as hot_pending_reservations,
    (select count(*) from classified where representation_type = 'confirmed_customer')::bigint
      as represented_confirmed_reservations,
    (select count(*) from classified where representation_type = 'global_review')::bigint
      as represented_review_reservations
  from source_rows
), period_representations as materialized (
  select representation_type, profile_id,
    representation_type || ':' || profile_id::text as representation_key,
    count(*)::bigint reservations_in_period,
    max(source_created_at) last_booking_at_in_period
  from classified
  group by representation_type, profile_id
), paged as materialized (
  select * from period_representations
  order by last_booking_at_in_period desc, representation_key
  limit p_page_size offset (p_page::bigint - 1) * p_page_size
), history as materialized (
  select paged.representation_key, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized
  from paged
  join public.customer_booking_profile_links l on l.profile_id = paged.profile_id
    and ((paged.representation_type = 'confirmed_customer' and l.status = 'active')
      or (paged.representation_type = 'global_review' and l.status in ('candidate', 'conflict')))
  join public.customer_source_bookings_okp b
    on p_family = 'OKP' and l.source = 'OKP' and b.source = l.source and b.source_row_id = l.source_row_id
  where ((b.status_raw = 'PAGADA' and b.is_confirmed is true and b.is_paid is true)
      or (b.status_raw = 'REEMPLAZADA' and b.is_confirmed is true))

  union all

  select paged.representation_key, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized
  from paged
  join public.customer_booking_profile_links l on l.profile_id = paged.profile_id
    and ((paged.representation_type = 'confirmed_customer' and l.status = 'active')
      or (paged.representation_type = 'global_review' and l.status in ('candidate', 'conflict')))
  join public.customer_source_bookings_mcp_eap b
    on p_family = 'MCP_EAP' and l.source = 'MCP_EAP' and b.source = l.source and b.source_row_id = l.source_row_id
  where b.booking_status in (1, 8)
), review_history_all as materialized (
  select paged.representation_key, b.source, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized
  from paged
  join public.customer_booking_profile_links l on paged.representation_type = 'global_review'
    and l.profile_id = paged.profile_id and l.source = 'OKP'
    and l.status in ('candidate', 'conflict')
  join public.customer_source_bookings_okp b
    on b.source = l.source and b.source_row_id = l.source_row_id
  where ((b.status_raw = 'PAGADA' and b.is_confirmed is true and b.is_paid is true)
      or (b.status_raw = 'REEMPLAZADA' and b.is_confirmed is true))

  union all

  select paged.representation_key, b.source, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized
  from paged
  join public.customer_booking_profile_links l on paged.representation_type = 'global_review'
    and l.profile_id = paged.profile_id and l.source = 'MCP_EAP'
    and l.status in ('candidate', 'conflict')
  join public.customer_source_bookings_mcp_eap b
    on b.source = l.source and b.source_row_id = l.source_row_id
  where b.booking_status in (1, 8)
), history_counts as materialized (
  select representation_key, count(*)::bigint source_reservations,
    count(*) filter (where is_pack is false)::bigint boleta_reservations,
    count(*) filter (where is_pack is true)::bigint pack_reservations,
    min(source_created_at) first_purchase_at,
    max(source_created_at) last_purchase_at
  from history group by representation_key
), review_history_counts as materialized (
  select representation_key, count(*)::bigint total_reservations,
    min(source_created_at) first_purchase_at,
    max(source_created_at) last_purchase_at,
    bool_or(source = 'MCP_EAP') has_mcp_eap,
    bool_or(source = 'OKP') has_okp
  from review_history_all group by representation_key
), contact_history as materialized (
  select history.representation_key, history.email_normalized, history.phone_normalized
  from history join paged using (representation_key)
  where paged.representation_type = 'confirmed_customer'
  union all
  select representation_key, email_normalized, phone_normalized
  from review_history_all
), observed_contacts as materialized (
  select history.representation_key, contact.type, contact.value
  from contact_history history
  cross join lateral (values
    ('email'::text, nullif(history.email_normalized, '')),
    ('phone'::text, nullif(history.phone_normalized, ''))
  ) contact(type, value)
  where contact.value is not null
  group by history.representation_key, contact.type, contact.value
), contacts as materialized (
  select representation_key,
    count(*) filter (where type = 'email')::bigint email_count,
    count(*) filter (where type = 'phone')::bigint phone_count,
    case when count(*) filter (where type = 'email') = 1 then max(value) filter (where type = 'email') end single_email,
    case when count(*) filter (where type = 'phone') = 1 then max(value) filter (where type = 'phone') end single_phone
  from observed_contacts group by representation_key
), direct_contacts as materialized (
  select paged.representation_key,
    count(distinct identity.identity_value_normalized) filter (where identity.identity_type = 'email')::bigint email_count,
    count(distinct identity.identity_value_normalized) filter (where identity.identity_type = 'phone')::bigint phone_count,
    case when count(distinct identity.identity_value_normalized) filter (where identity.identity_type = 'email') = 1
      then max(identity.identity_value_normalized) filter (where identity.identity_type = 'email') end single_email,
    case when count(distinct identity.identity_value_normalized) filter (where identity.identity_type = 'phone') = 1
      then max(identity.identity_value_normalized) filter (where identity.identity_type = 'phone') end single_phone
  from paged join public.customer_identity_links identity on paged.representation_type = 'confirmed_customer'
    and identity.profile_id = paged.profile_id and identity.status = 'active'
    and identity.identity_type in ('email', 'phone')
  group by paged.representation_key
)
select pg_catalog.jsonb_build_object(
  'family', p_family,
  'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'authoritySnapshotId', null,
    'representationType', paged.representation_type,
    'representationId', paged.profile_id,
    'representationKey', paged.representation_key,
    'customerId', case when paged.representation_type = 'confirmed_customer' then paged.profile_id end,
    'reviewProfileId', case when paged.representation_type = 'global_review' then paged.profile_id end,
    'relatedGroupId', null,
    'totalReservations', case paged.representation_type when 'confirmed_customer'
      then coalesce(metrics.total_reservations, counts.source_reservations)
      else review_counts.total_reservations end,
    'firstPurchaseAt', case paged.representation_type when 'confirmed_customer'
      then coalesce(metrics.first_purchase_at, counts.first_purchase_at)
      else review_counts.first_purchase_at end,
    'lastPurchaseAt', case paged.representation_type when 'confirmed_customer'
      then coalesce(metrics.last_purchase_at, counts.last_purchase_at)
      else review_counts.last_purchase_at end,
    'metricScope', case paged.representation_type when 'confirmed_customer' then 'all_confirmed_sources' else 'global_review_profile' end,
    'reservationsInPeriod', paged.reservations_in_period,
    'lastBookingAtInPeriod', paged.last_booking_at_in_period,
    'sourceReservations', counts.source_reservations,
    'boletaReservations', counts.boleta_reservations,
    'packReservations', counts.pack_reservations,
    'commercialTrajectory', case when paged.representation_type = 'global_review'
      then case when review_counts.has_mcp_eap and review_counts.has_okp then 'ACTIVITY_CROSS_SOURCE'
        when review_counts.has_okp then 'ACTIVITY_OKP' else 'ACTIVITY_MCP_EAP' end
      else coalesce(metrics.brand_behavior, case p_family when 'OKP' then 'ONLY_OKP' else 'ONLY_MCP_EAP' end) end,
    'trajectoryScope', case paged.representation_type when 'confirmed_customer' then 'confirmed_identity' else 'review_profile' end,
    'contactSummary', pg_catalog.jsonb_build_object(
      'semantics', case paged.representation_type when 'confirmed_customer' then 'direct' else 'observed' end,
      'emailCount', coalesce(direct.email_count, observed.email_count, 0),
      'phoneCount', coalesce(direct.phone_count, observed.phone_count, 0),
      'singleEmail', coalesce(direct.single_email, observed.single_email),
      'singlePhone', coalesce(direct.single_phone, observed.single_phone)
    )
  ) order by paged.last_booking_at_in_period desc, paged.representation_key) from paged
    join history_counts counts using (representation_key)
    left join review_history_counts review_counts using (representation_key)
    left join contacts observed using (representation_key)
    left join direct_contacts direct using (representation_key)
    left join public.customer_profile_metrics metrics on paged.representation_type = 'confirmed_customer'
      and metrics.customer_id = paged.profile_id), '[]'::jsonb),
  'total', (select count(*)::bigint from period_representations),
  'page', p_page,
  'pageSize', p_page_size,
  'validReservations', reconciliation.valid_reservations,
  'stableReservations', reconciliation.stable_reservations,
  'representedConfirmedReservations', reconciliation.represented_confirmed_reservations,
  'representedReviewReservations', reconciliation.represented_review_reservations,
  'hotPendingReservations', reconciliation.hot_pending_reservations,
  'unrepresentedStableReservations', reconciliation.stable_reservations
    - reconciliation.represented_confirmed_reservations
    - reconciliation.represented_review_reservations
)
from reconciliation;
$function$;

create or replace function public.customer_window_360_v1_get_global_review_analytics(p_locator jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with resolved as materialized (
  select public.customer_window_global_review_v1_resolve_locator(p_locator) profile_id
), bookings as materialized (
  select 'MCP_EAP'::text source, b.source_row_id, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized, l.status
  from resolved r join public.customer_booking_profile_links l on l.profile_id = r.profile_id
    and l.source = 'MCP_EAP' and l.status in ('candidate', 'conflict')
  join public.customer_source_bookings_mcp_eap b on b.source = l.source and b.source_row_id = l.source_row_id
  where b.booking_status in (1, 8)
  union all
  select 'OKP', b.source_row_id, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized, l.status
  from resolved r join public.customer_booking_profile_links l on l.profile_id = r.profile_id
    and l.source = 'OKP' and l.status in ('candidate', 'conflict')
  join public.customer_source_bookings_okp b on b.source = l.source and b.source_row_id = l.source_row_id
  where ((b.status_raw = 'PAGADA' and b.is_confirmed is true and b.is_paid is true)
      or (b.status_raw = 'REEMPLAZADA' and b.is_confirmed is true))
), contacts as materialized (
  select contact.type, contact.value,
    pg_catalog.array_agg(distinct bookings.source order by bookings.source) sources,
    count(*)::bigint booking_count, min(source_created_at) first_seen_at,
    max(source_created_at) last_seen_at,
    bool_or(status = 'conflict') conflict_involvement
  from bookings cross join lateral (values
    ('email'::text, nullif(email_normalized, '')),
    ('phone'::text, nullif(phone_normalized, ''))
  ) contact(type, value)
  where contact.value is not null group by contact.type, contact.value
), candidate_payloads as materialized (
  select contact.*,
    pg_catalog.jsonb_build_object(
      'type', type, 'normalizedValue', value, 'displayValue', value,
      'relation', 'observed_in_review_profile', 'sources', pg_catalog.to_jsonb(sources),
      'sourceCount', pg_catalog.array_length(sources, 1),
      'firstSeenAt', first_seen_at, 'lastSeenAt', last_seen_at,
      'bookingCount', booking_count, 'profileCount', 1,
      'currentGroupMembership', true, 'conflictInvolvement', conflict_involvement,
      'contradictorySignals', conflict_involvement,
      'samePhoneHistory', null, 'sameEmailHistory', null,
      'qualityFlags', '[]'::jsonb,
      'eligibility', pg_catalog.jsonb_build_object(
        'status', case when conflict_involvement then 'BLOCKED' else 'REVIEW' end,
        'reasonCodes', case when conflict_involvement
          then pg_catalog.jsonb_build_array('AUTOMATION_NOT_AUTHORIZED_V1', 'CURRENT_CONFLICT_LINK')
          else pg_catalog.jsonb_build_array('AUTOMATION_NOT_AUTHORIZED_V1') end),
      'policyVersion', 'RELATED_CONTACTABILITY_V1'
    ) payload
  from contacts contact
), activity as materialized (
  select count(*)::bigint total,
    count(*) filter (where is_pack is false)::bigint boleta,
    count(*) filter (where is_pack is true)::bigint pack,
    min(source_created_at) first_at, max(source_created_at) last_at,
    count(*) filter (where source = 'MCP_EAP')::bigint mcp_eap,
    count(*) filter (where source = 'OKP')::bigint okp
  from bookings
), active_snapshot as materialized (
  select (pg_catalog.array_agg(snapshot_id))[1] snapshot_id
  from public.customer_related_review_snapshots
  where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active'
  having count(*) = 1
), profile_contacts as materialized (
  select distinct contact.type, contact.value
  from bookings
  cross join lateral (values
    ('email'::text, nullif(bookings.email_normalized, '')),
    ('phone'::text, nullif(bookings.phone_normalized, ''))
  ) contact(type, value)
  where contact.value is not null
), direct_related_evidence as materialized (
  select distinct assignment.related_group_id group_id, assignment.snapshot_id,
    'profile_membership'::text evidence_source, 'profile_membership'::text relation_reason
  from resolved r
  cross join active_snapshot snapshot
  join public.customer_related_review_members member
    on member.snapshot_id = snapshot.snapshot_id and member.profile_id = r.profile_id
  join public.customer_analytical_booking_assignments assignment
    on assignment.snapshot_id = member.snapshot_id and assignment.source = member.source
    and assignment.source_row_id = member.source_row_id and assignment.representation_type = 'related_review'
), contact_related_evidence as materialized (
  select distinct assignment.related_group_id group_id, assignment.snapshot_id,
    'contact_match'::text evidence_source, 'same_phone_history'::text relation_reason
  from profile_contacts contact
  cross join active_snapshot snapshot
  join public.customer_source_bookings_mcp_eap booking
    on contact.type = 'phone' and booking.phone_normalized = contact.value
  join public.customer_analytical_booking_assignments assignment
    on assignment.snapshot_id = snapshot.snapshot_id
    and assignment.source = booking.source
    and assignment.source_row_id = booking.source_row_id
    and assignment.representation_type = 'related_review'

  union

  select distinct assignment.related_group_id, assignment.snapshot_id,
    'contact_match'::text, 'same_email_history'::text
  from profile_contacts contact
  cross join active_snapshot snapshot
  join public.customer_source_bookings_mcp_eap booking
    on contact.type = 'email' and booking.email_normalized = contact.value
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
  'ok', true, 'contractVersion', 'CUSTOMER_360_GLOBAL_REVIEW_ANALYTICS_V1',
  'locator', p_locator,
  'scope', pg_catalog.jsonb_build_object('entity', 'review_profile', 'semantics', 'group_observed', 'customerUniverse', 'GLOBAL_REVIEW'),
  'activity', pg_catalog.jsonb_build_object(
    'totalValidBookings', activity.total, 'boletaBookings', activity.boleta,
    'packBookings', activity.pack, 'firstActivityAt', activity.first_at,
    'lastActivityAt', activity.last_at),
  'origin', pg_catalog.jsonb_build_object(
    'sourceCoverage', case when activity.mcp_eap > 0 and activity.okp > 0 then 'CROSS_SOURCE'
      when activity.okp > 0 then 'OKP' else 'MCP_EAP' end,
    'counts', pg_catalog.jsonb_build_object('MCP_EAP', activity.mcp_eap, 'OKP', activity.okp)),
  'relatedMcpEapEvidence', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'groupId', group_id, 'snapshotId', snapshot_id, 'evidenceSource', evidence_source,
    'relationReason', relation_reason)
    order by group_id, evidence_source, relation_reason) from related_evidence), '[]'::jsonb),
  'contactability', pg_catalog.jsonb_build_object(
    'mode', 'read_only_review', 'automationEnabled', false,
    'policyVersion', 'RELATED_CONTACTABILITY_V1',
    'primaryContactCandidate', pg_catalog.jsonb_build_object(
      'email', (select payload from candidate_payloads where type = 'email'
        and payload #>> '{eligibility,status}' = 'REVIEW'
        and (select count(*) from candidate_payloads where type = 'email') = 1),
      'phone', (select payload from candidate_payloads where type = 'phone'
        and payload #>> '{eligibility,status}' = 'REVIEW'
        and (select count(*) from candidate_payloads where type = 'phone') = 1)),
    'candidates', coalesce((select pg_catalog.jsonb_agg(payload order by type, value) from candidate_payloads), '[]'::jsonb),
    'historicalEvidence', pg_catalog.jsonb_build_object('materialized', false, 'detailSurface', 'identity')),
  'dataQuality', pg_catalog.jsonb_build_object(
    'calculationVersion', 'CUSTOMER_360_GLOBAL_REVIEW_ANALYTICS_V1',
    'computedAt', pg_catalog.statement_timestamp())
)
from activity;
$function$;

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
  select distinct contact.type, contact.value
  from links link
  left join public.customer_source_bookings_mcp_eap mcp
    on link.source = 'MCP_EAP' and mcp.source = link.source and mcp.source_row_id = link.source_row_id
  left join public.customer_source_bookings_okp okp
    on link.source = 'OKP' and okp.source = link.source and okp.source_row_id = link.source_row_id
  cross join lateral (values
    ('email'::text, nullif(coalesce(mcp.email_normalized, okp.email_normalized), '')),
    ('phone'::text, nullif(coalesce(mcp.phone_normalized, okp.phone_normalized), ''))
  ) contact(type, value)
  where contact.value is not null
), direct_related_evidence as materialized (
  select distinct member.group_id, member.snapshot_id,
    'profile_membership'::text evidence_source, 'profile_membership'::text relation_reason
  from resolved r cross join active_snapshot snapshot
  join public.customer_related_review_members member
    on member.snapshot_id = snapshot.snapshot_id and member.profile_id = r.profile_id
), contact_related_evidence as materialized (
  select distinct assignment.related_group_id group_id, assignment.snapshot_id,
    'contact_match'::text evidence_source, 'same_phone_history'::text relation_reason
  from profile_contacts contact
  cross join active_snapshot snapshot
  join public.customer_source_bookings_mcp_eap booking
    on contact.type = 'phone' and booking.phone_normalized = contact.value
  join public.customer_analytical_booking_assignments assignment
    on assignment.snapshot_id = snapshot.snapshot_id
    and assignment.source = booking.source
    and assignment.source_row_id = booking.source_row_id
    and assignment.representation_type = 'related_review'

  union

  select distinct assignment.related_group_id, assignment.snapshot_id,
    'contact_match'::text, 'same_email_history'::text
  from profile_contacts contact
  cross join active_snapshot snapshot
  join public.customer_source_bookings_mcp_eap booking
    on contact.type = 'email' and booking.email_normalized = contact.value
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
  'relatedMcpEapEvidence', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'groupId', group_id, 'snapshotId', snapshot_id, 'evidenceSource', evidence_source,
    'relationReason', relation_reason)
    order by group_id, evidence_source, relation_reason) from related_evidence), '[]'::jsonb)
)
from resolved r join public.customer_profiles profile on profile.id = r.profile_id;
$function$;

create or replace function public.customer_window_360_v1_get_global_review_overview(p_locator jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with resolved as materialized (
  select public.customer_window_global_review_v1_resolve_locator(p_locator) profile_id
), bookings as materialized (
  select 'OKP'::text source, b.source_row_id, b.source_created_at,
    b.email_normalized, b.phone_normalized, l.status
  from resolved r join public.customer_booking_profile_links l on l.profile_id = r.profile_id
    and l.source = 'OKP' and l.status in ('candidate', 'conflict')
  join public.customer_source_bookings_okp b on b.source = l.source and b.source_row_id = l.source_row_id
  where ((b.status_raw = 'PAGADA' and b.is_confirmed is true and b.is_paid is true)
      or (b.status_raw = 'REEMPLAZADA' and b.is_confirmed is true))
  union all
  select 'MCP_EAP', b.source_row_id, b.source_created_at,
    b.email_normalized, b.phone_normalized, l.status
  from resolved r join public.customer_booking_profile_links l on l.profile_id = r.profile_id
    and l.source = 'MCP_EAP' and l.status in ('candidate', 'conflict')
  join public.customer_source_bookings_mcp_eap b on b.source = l.source and b.source_row_id = l.source_row_id
  where b.booking_status in (1, 8)
), contacts as materialized (
  select type, value, max(source_created_at) last_seen_at
  from bookings cross join lateral (values
    ('email'::text, nullif(email_normalized, '')),
    ('phone'::text, nullif(phone_normalized, ''))
  ) contact(type, value)
  where value is not null group by type, value
), summary as materialized (
  select count(*)::bigint total_bookings, min(source_created_at) first_booking_at,
    max(source_created_at) last_booking_at,
    count(*) filter (where status = 'candidate')::bigint candidate_count,
    count(*) filter (where status = 'conflict')::bigint conflict_count
  from bookings
), coverage as materialized (
  select source, count(*)::bigint booking_count from bookings group by source
)
select pg_catalog.jsonb_build_object(
  'ok', true, 'contractVersion', 'CUSTOMER_360_V1',
  'locator', p_locator,
  'representation', pg_catalog.jsonb_build_object('authorityStatus', 'global_review_profile', 'readOnly', true),
  'identity', pg_catalog.jsonb_build_object(
    'status', 'global_review', 'contactability', 'observed_only', 'customerId', null,
    'relatedGroupId', null, 'reviewProfileId', (select profile_id from resolved),
    'relatedReviewSummary', pg_catalog.jsonb_build_object(
      'profileCount', 1, 'conflictCount', summary.conflict_count,
      'candidateCount', summary.candidate_count, 'v1BookingCount', 0, 'v2BookingCount', 0),
    'contacts', pg_catalog.jsonb_build_object(
      'semantics', 'observed',
      'emailCount', (select count(*) from contacts where type = 'email'),
      'phoneCount', (select count(*) from contacts where type = 'phone'),
      'singleEmail', case when (select count(*) from contacts where type = 'email') = 1 then (select value from contacts where type = 'email') end,
      'singlePhone', case when (select count(*) from contacts where type = 'phone') = 1 then (select value from contacts where type = 'phone') end,
      'emailPreview', coalesce((select pg_catalog.jsonb_agg(value order by last_seen_at desc, value) from (select * from contacts where type = 'email' order by last_seen_at desc, value limit 5) preview), '[]'::jsonb),
      'phonePreview', coalesce((select pg_catalog.jsonb_agg(value order by last_seen_at desc, value) from (select * from contacts where type = 'phone' order by last_seen_at desc, value limit 5) preview), '[]'::jsonb)
    )
  ),
  'summary', pg_catalog.jsonb_build_object('totalBookings', summary.total_bookings,
    'firstBookingAt', summary.first_booking_at, 'lastBookingAt', summary.last_booking_at),
  'sourceCoverage', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'source', source, 'bookingCount', booking_count) order by source) from coverage), '[]'::jsonb),
  'moduleAvailability', pg_catalog.jsonb_build_object(
    'bookings', pg_catalog.jsonb_build_object('status', 'available'),
    'commercialEvents', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'review_identity'),
    'communications', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'review_identity'),
    'advancedMetrics', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'review_identity'),
    'attribution', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'review_identity')
  )
)
from summary;
$function$;

create or replace function public.customer_window_360_v1_list_global_review_bookings(
  p_locator jsonb,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
  v_items jsonb;
  v_total bigint;
begin
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid_locator_contract' using errcode = '22023';
  end if;
  v_profile_id := public.customer_window_global_review_v1_resolve_locator(p_locator);

  with scoped as materialized (
    select 'MCP_EAP'::text source, booking.source_row_id, booking.source_booking_code,
      booking.source_created_at purchase_created_at, booking.planned_arrival_at,
      booking.planned_departure_at, null::timestamp without time zone actual_checkin_at,
      null::timestamp without time zone actual_checkout_at, booking.brand_normalized brand,
      booking.parking_normalized parking, booking.booking_paid paid_amount,
      booking.booking_status::text status, booking.duration_days, booking.is_pack,
      booking.promotion_code promo_code,
      coalesce(nullif(pg_catalog.btrim(booking.email_raw), ''), nullif(booking.email_normalized, '')) observed_email,
      coalesce(nullif(pg_catalog.btrim(booking.phone_raw), ''), nullif(booking.phone_normalized, '')) observed_phone
    from public.customer_booking_profile_links link
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = link.source and booking.source_row_id = link.source_row_id
    where link.profile_id = v_profile_id and link.source = 'MCP_EAP'
      and link.status in ('candidate', 'conflict') and booking.booking_status in (1, 8)

    union all

    select 'OKP', booking.source_row_id, booking.source_booking_code,
      booking.source_created_at, booking.planned_arrival_at, booking.planned_departure_at,
      booking.actual_checkin_at, booking.actual_checkout_at, 'OKP', booking.parking_normalized,
      booking.source_total_amount, booking.status_raw,
      case when booking.planned_arrival_at is null or booking.planned_departure_at is null then null
        else greatest(0, booking.planned_departure_at::date - booking.planned_arrival_at::date) end,
      booking.is_pack, booking.coupon_code,
      coalesce(nullif(pg_catalog.btrim(booking.email_raw), ''), nullif(booking.email_normalized, '')),
      coalesce(nullif(pg_catalog.btrim(booking.phone_raw), ''), nullif(booking.phone_normalized, ''))
    from public.customer_booking_profile_links link
    join public.customer_source_bookings_okp booking
      on booking.source = link.source and booking.source_row_id = link.source_row_id
    where link.profile_id = v_profile_id and link.source = 'OKP'
      and link.status in ('candidate', 'conflict')
      and ((booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
        or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true))
  ), paged as (
    select * from scoped
    order by purchase_created_at desc nulls last, source desc, source_row_id desc
    limit p_page_size offset (p_page::bigint - 1) * p_page_size
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'source', source, 'sourceRowId', source_row_id::text, 'bookingId', source_booking_code,
    'createdAt', purchase_created_at, 'plannedCheckInAt', planned_arrival_at,
    'plannedCheckOutAt', planned_departure_at, 'actualCheckInAt', actual_checkin_at,
    'actualCheckOutAt', actual_checkout_at, 'brand', brand, 'parking', parking,
    'amount', case when paid_amount is null then null else paid_amount::text end,
    'amountKind', case when paid_amount is null then null else 'paid_amount' end,
    'status', status, 'durationDays', duration_days, 'isPack', is_pack,
    'promoCode', promo_code, 'observedEmail', observed_email, 'observedPhone', observed_phone
  ) order by purchase_created_at desc nulls last, source desc, source_row_id desc), '[]'::jsonb),
    (select count(*)::bigint from scoped)
  into v_items, v_total from paged;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'contractVersion', 'CUSTOMER_360_V1', 'locator', p_locator,
    'items', v_items, 'pagination', pg_catalog.jsonb_build_object(
      'page', p_page, 'pageSize', p_page_size, 'total', v_total,
      'hasNextPage', p_page::bigint * p_page_size < v_total));
end;
$function$;

create or replace function public.customer_window_360_v1_list_global_review_contacts(
  p_locator jsonb,
  p_contact_type text,
  p_page integer default 1,
  p_page_size integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with resolved as materialized (
  select public.customer_window_global_review_v1_resolve_locator(p_locator) profile_id,
    case when p_contact_type in ('email', 'phone') and p_page >= 1
      and p_page_size between 1 and 100 then true
      else public.customer_window_global_review_v1_invalid('contacts') end valid
), observations as materialized (
  select case when p_contact_type = 'email' then b.email_normalized else b.phone_normalized end value,
    b.source_created_at, b.source_row_id
  from resolved r join public.customer_booking_profile_links l on l.profile_id = r.profile_id
    and l.source = 'MCP_EAP' and l.status in ('candidate', 'conflict')
  join public.customer_source_bookings_mcp_eap b on b.source = l.source and b.source_row_id = l.source_row_id
  where r.valid and b.booking_status in (1, 8)
  union all
  select case when p_contact_type = 'email' then b.email_normalized else b.phone_normalized end,
    b.source_created_at, b.source_row_id
  from resolved r join public.customer_booking_profile_links l on r.valid and l.profile_id = r.profile_id
    and l.source = 'OKP' and l.status in ('candidate', 'conflict')
  join public.customer_source_bookings_okp b on b.source = l.source and b.source_row_id = l.source_row_id
  where ((b.status_raw = 'PAGADA' and b.is_confirmed is true and b.is_paid is true)
      or (b.status_raw = 'REEMPLAZADA' and b.is_confirmed is true))
), values as materialized (
  select value, max(source_created_at) last_seen_at from observations
  where nullif(value, '') is not null group by value
), paged as (
  select * from values order by value
  limit p_page_size offset (p_page::bigint - 1) * p_page_size
)
select pg_catalog.jsonb_build_object(
  'ok', true, 'contractVersion', 'CUSTOMER_360_V1', 'locator', p_locator,
  'semantics', 'observed', 'contactType', p_contact_type,
  'items', coalesce((select pg_catalog.jsonb_agg(value order by value) from paged), '[]'::jsonb),
  'pagination', pg_catalog.jsonb_build_object(
    'page', p_page, 'pageSize', p_page_size, 'total', (select count(*)::bigint from values),
    'hasNextPage', p_page::bigint * p_page_size < (select count(*) from values))
);
$function$;

create or replace function public.customer_window_v2_search_global_v1(
  p_email text default null,
  p_phone text default null,
  p_exact_identifier text default null,
  p_numeric_identifier bigint default null,
  p_plate text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 20
    or (nullif(pg_catalog.btrim(p_email), '') is null
      and nullif(pg_catalog.btrim(p_phone), '') is null
      and nullif(pg_catalog.btrim(p_exact_identifier), '') is null
      and p_numeric_identifier is null
      and nullif(pg_catalog.btrim(p_plate), '') is null) then
    raise exception 'invalid_search_contract' using errcode = '22023';
  end if;

  with source_matches as materialized (
    select link.profile_id, link.status,
      'exact_email'::text match_type, 'email'::text match_value_type, 1 match_rank
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    where p_email is not null and booking.email_normalized = p_email
    union all
    select link.profile_id, link.status, 'exact_email', 'email', 1
    from public.customer_source_bookings_okp booking
    join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    where p_email is not null and booking.email_normalized = p_email
    union all
    select link.profile_id, link.status, 'exact_phone', 'phone', 1
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    where p_phone is not null and booking.phone_normalized = p_phone
    union all
    select link.profile_id, link.status, 'exact_phone', 'phone', 1
    from public.customer_source_bookings_okp booking
    join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    where p_phone is not null and booking.phone_normalized = p_phone
    union all
    select link.profile_id, link.status, 'exact_plate', 'plate', 1
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    where p_plate is not null and booking.plate_normalized = p_plate
    union all
    select link.profile_id, link.status, 'exact_plate', 'plate', 1
    from public.customer_source_bookings_okp booking
    join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    where p_plate is not null and booking.plate_normalized = p_plate
    union all
    select link.profile_id, link.status, 'exact_booking', 'booking_code', 2
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    where p_exact_identifier is not null and booking.source_booking_code = p_exact_identifier
    union all
    select link.profile_id, link.status, 'exact_booking', 'booking_code', 2
    from public.customer_source_bookings_okp booking
    join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    where p_exact_identifier is not null and booking.source_booking_code = p_exact_identifier
    union all
    select link.profile_id, link.status, 'exact_source_row', 'source_row_id', 2
    from public.customer_booking_profile_links link
    where p_numeric_identifier is not null and link.source = 'MCP_EAP'
      and link.source_row_id = p_numeric_identifier
    union all
    select link.profile_id, link.status, 'exact_source_row', 'source_row_id', 2
    from public.customer_booking_profile_links link
    where p_numeric_identifier is not null and link.source = 'OKP'
      and link.source_row_id = p_numeric_identifier
    union all
    select link.profile_id, link.status, 'exact_source_customer', 'source_customer_id', 2
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    where p_numeric_identifier is not null and booking.source_customer_id = p_numeric_identifier
  ), identity_candidates as materialized (
    select identity.profile_id, identity.identity_type
    from public.customer_identity_links identity
    where p_email is not null and identity.identity_type = 'email'
      and identity.identity_value_normalized = p_email
      and identity.status in ('active', 'candidate', 'conflict')
    union all
    select identity.profile_id, identity.identity_type
    from public.customer_identity_links identity
    where p_phone is not null and identity.identity_type = 'phone'
      and identity.identity_value_normalized = p_phone
      and identity.status in ('active', 'candidate', 'conflict')
    union all
    select identity.profile_id, identity.identity_type
    from public.customer_identity_links identity
    where p_plate is not null and identity.identity_type = 'plate'
      and identity.identity_value_normalized = p_plate
      and identity.status in ('active', 'candidate', 'conflict')
    union all
    select identity.profile_id, identity.identity_type
    from public.customer_identity_links identity
    where p_numeric_identifier is not null and identity.identity_type = 'source_customer_id'
      and identity.identity_value_normalized = p_numeric_identifier::text
      and identity.status in ('active', 'candidate', 'conflict')
  ), identity_matches as materialized (
    select identity.profile_id,
      case
        when exists (select 1 from public.customer_booking_profile_links active_link
          where active_link.profile_id = identity.profile_id and active_link.status = 'active') then 'active'::text
        when exists (select 1 from public.customer_booking_profile_links conflict_link
          where conflict_link.profile_id = identity.profile_id and conflict_link.status = 'conflict') then 'conflict'::text
        when exists (select 1 from public.customer_booking_profile_links candidate_link
          where candidate_link.profile_id = identity.profile_id and candidate_link.status = 'candidate') then 'candidate'::text
        else 'unlinked'::text end status,
      case identity.identity_type when 'email' then 'exact_email' when 'phone' then 'exact_phone'
        when 'plate' then 'exact_plate' else 'exact_source_customer' end match_type,
      case identity.identity_type when 'source_customer_id' then 'source_customer_id'
        else identity.identity_type end match_value_type,
      case identity.identity_type when 'source_customer_id' then 2 else 1 end match_rank
    from identity_candidates identity
  ), all_matches as materialized (
    select * from source_matches
    union all
    select * from identity_matches
  ), classified as materialized (
    select matched.*,
      case when matched.status = 'active' then 'confirmed_customer'::text else 'global_review'::text end representation_type,
      row_number() over (partition by matched.profile_id
        order by matched.match_rank, matched.match_type) match_order
    from all_matches matched
    join public.customer_profiles profile on profile.id = matched.profile_id
      and profile.status = 'active' and profile.merged_into_profile_id is null
    where matched.status = 'active'
      or (matched.status in ('candidate', 'conflict') and profile.needs_review is true
        and not exists (select 1 from public.customer_booking_profile_links active_link
          where active_link.profile_id = matched.profile_id and active_link.status = 'active'))
  ), selected as materialized (
    select * from classified where match_order = 1
    order by match_rank, profile_id limit p_limit
  ), history as materialized (
    select selected.profile_id, selected.representation_type, booking.source_created_at,
      booking.email_normalized, booking.phone_normalized
    from selected
    join public.customer_booking_profile_links link on link.profile_id = selected.profile_id
      and ((selected.representation_type = 'confirmed_customer' and link.status = 'active')
        or (selected.representation_type = 'global_review' and link.status in ('candidate', 'conflict')))
    join public.customer_source_bookings_mcp_eap booking
      on link.source = 'MCP_EAP' and booking.source = link.source and booking.source_row_id = link.source_row_id
    where booking.booking_status in (1, 8)
    union all
    select selected.profile_id, selected.representation_type, booking.source_created_at,
      booking.email_normalized, booking.phone_normalized
    from selected
    join public.customer_booking_profile_links link on link.profile_id = selected.profile_id
      and ((selected.representation_type = 'confirmed_customer' and link.status = 'active')
        or (selected.representation_type = 'global_review' and link.status in ('candidate', 'conflict')))
    join public.customer_source_bookings_okp booking
      on link.source = 'OKP' and booking.source = link.source and booking.source_row_id = link.source_row_id
    where ((booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
      or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true))
  ), history_metrics as materialized (
    select profile_id, count(*)::bigint total_reservations,
      min(source_created_at) first_purchase_at, max(source_created_at) last_purchase_at,
      count(distinct email_normalized) filter (where email_normalized is not null)::bigint email_count,
      count(distinct phone_normalized) filter (where phone_normalized is not null)::bigint phone_count,
      max(email_normalized) filter (where email_normalized is not null) display_email,
      max(phone_normalized) filter (where phone_normalized is not null) display_phone
    from history group by profile_id
  )
  select pg_catalog.jsonb_build_object(
    'items', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'authoritySnapshotId', null,
      'representationType', selected.representation_type,
      'representationId', selected.profile_id,
      'representationKey', selected.representation_type || ':' || selected.profile_id::text,
      'customerId', case when selected.representation_type = 'confirmed_customer' then selected.profile_id end,
      'reviewProfileId', case when selected.representation_type = 'global_review' then selected.profile_id end,
      'relatedGroupId', null,
      'matchType', selected.match_type,
      'matchValueType', selected.match_value_type,
      'matchSemantics', case
        when selected.match_type in ('exact_booking', 'exact_source_row') then 'booking'
        when selected.match_type = 'exact_source_customer' then 'source_customer'
        when selected.representation_type = 'confirmed_customer' then 'direct'
        else 'observed_in_review_profile' end,
      'totalReservations', metrics.total_reservations,
      'firstPurchaseAt', metrics.first_purchase_at,
      'lastPurchaseAt', metrics.last_purchase_at,
      'displayEmail', metrics.display_email,
      'displayPhone', metrics.display_phone,
      'metricScope', case selected.representation_type
        when 'confirmed_customer' then 'all_confirmed_sources' else 'global_review_profile' end,
      'contactSummary', pg_catalog.jsonb_build_object(
        'semantics', case selected.representation_type when 'confirmed_customer' then 'direct' else 'observed' end,
        'emailCount', metrics.email_count, 'phoneCount', metrics.phone_count,
        'singleEmail', case when metrics.email_count = 1 then metrics.display_email end,
        'singlePhone', case when metrics.phone_count = 1 then metrics.display_phone end),
      'reservationsInPeriod', 0, 'lastBookingAtInPeriod', null
    ) order by selected.match_rank, metrics.last_purchase_at desc, selected.profile_id), '[]'::jsonb),
    'total', (select count(distinct classified.profile_id)::bigint from classified),
    'limit', p_limit
  ) into v_result
  from selected join history_metrics metrics using (profile_id);

  return v_result;
end;
$function$;

revoke all on function public.customer_window_global_review_v1_invalid(text) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_global_review_v1_resolve_locator(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_360_v1_get_global_review_overview(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_360_v1_list_global_review_bookings(jsonb,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_360_v1_list_global_review_contacts(jsonb,text,integer,integer) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_360_v1_get_global_review_analytics(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_360_v1_get_global_review_identity(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_v2_search_global_v1(text,text,text,bigint,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer) to service_role;
grant execute on function public.customer_window_360_v1_get_global_review_overview(jsonb) to service_role;
grant execute on function public.customer_window_360_v1_list_global_review_bookings(jsonb,integer,integer) to service_role;
grant execute on function public.customer_window_360_v1_list_global_review_contacts(jsonb,text,integer,integer) to service_role;
grant execute on function public.customer_window_360_v1_get_global_review_analytics(jsonb) to service_role;
grant execute on function public.customer_window_360_v1_get_global_review_identity(jsonb) to service_role;
grant execute on function public.customer_window_v2_search_global_v1(text,text,text,bigint,text,integer) to service_role;

comment on function public.customer_window_global_review_v1_resolve_locator(jsonb) is
  'Resolves a stable review-profile locator. It never merges identities or depends on the MCP/EAP snapshot lifecycle.';
comment on function public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer) is
  'Lists source-scoped confirmed and global-review representations. One booking link maps to exactly one visible representation.';
comment on function public.customer_window_v2_search_global_v1(text,text,text,bigint,text,integer) is
  'Exact cross-source search. Active links resolve confirmed customers; candidate/conflict links resolve stable global-review profiles.';

do $harness$
declare
  v_missing_functions text[];
  v_unexpected_relation_count bigint;
  v_service_execute_ok boolean;
  v_anon_execute_count bigint;
  v_authenticated_execute_count bigint;
begin
  select pg_catalog.array_agg(expected.signature order by expected.signature)
  into v_missing_functions
  from (values
    ('public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer)'),
    ('public.customer_window_v2_search_global_v1(text,text,text,bigint,text,integer)'),
    ('public.customer_window_360_v1_get_global_review_overview(jsonb)'),
    ('public.customer_window_360_v1_list_global_review_bookings(jsonb,integer,integer)'),
    ('public.customer_window_360_v1_list_global_review_contacts(jsonb,text,integer,integer)'),
    ('public.customer_window_360_v1_get_global_review_analytics(jsonb)'),
    ('public.customer_window_360_v1_get_global_review_identity(jsonb)')
  ) expected(signature)
  where pg_catalog.to_regprocedure(expected.signature) is null;
  if v_missing_functions is not null then
    raise exception 'missing_global_review_functions:%', v_missing_functions;
  end if;

  select count(*) into v_unexpected_relation_count
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname like 'customer%global%review%'
    and relation.relkind in ('r', 'm', 'i');
  if v_unexpected_relation_count <> 0 then
    raise exception 'unexpected_global_review_storage_objects:%', v_unexpected_relation_count;
  end if;

  select bool_and(pg_catalog.has_function_privilege('service_role', expected.signature, 'EXECUTE')),
    count(*) filter (where pg_catalog.has_function_privilege('anon', expected.signature, 'EXECUTE')),
    count(*) filter (where pg_catalog.has_function_privilege('authenticated', expected.signature, 'EXECUTE'))
  into v_service_execute_ok, v_anon_execute_count, v_authenticated_execute_count
  from (values
    ('public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer)'),
    ('public.customer_window_v2_search_global_v1(text,text,text,bigint,text,integer)'),
    ('public.customer_window_360_v1_get_global_review_overview(jsonb)'),
    ('public.customer_window_360_v1_list_global_review_bookings(jsonb,integer,integer)'),
    ('public.customer_window_360_v1_list_global_review_contacts(jsonb,text,integer,integer)'),
    ('public.customer_window_360_v1_get_global_review_analytics(jsonb)'),
    ('public.customer_window_360_v1_get_global_review_identity(jsonb)')
  ) expected(signature);
  if not v_service_execute_ok or v_anon_execute_count <> 0 or v_authenticated_execute_count <> 0 then
    raise exception 'global_review_acl_failed';
  end if;
end;
$harness$;

with valid_okp as materialized (
  select booking.source, booking.source_row_id
  from public.customer_source_bookings_okp booking
  where booking.source_created_at >= timestamp '2026-09-29 00:00:00'
    and booking.source_created_at < timestamp '2026-09-30 00:00:00'
    and ((booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
      or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true))
), represented as materialized (
  select valid.source, valid.source_row_id, link.profile_id, link.status,
    case link.status when 'active' then 'confirmed_customer' else 'global_review' end representation_type
  from valid_okp valid
  join public.customer_booking_profile_links link
    on link.source = valid.source and link.source_row_id = valid.source_row_id
  join public.customer_profiles profile on profile.id = link.profile_id
    and profile.status = 'active' and profile.merged_into_profile_id is null
  where link.status = 'active'
    or (link.status in ('candidate', 'conflict') and profile.needs_review is true
      and not exists (select 1 from public.customer_booking_profile_links active_link
        where active_link.profile_id = link.profile_id and active_link.status = 'active'))
), reconciliation as (
  select (select count(*) from valid_okp) valid_okp,
    count(*) filter (where representation_type = 'confirmed_customer') confirmed,
    count(*) filter (where representation_type = 'global_review') global_review,
    count(*) total_represented,
    count(*) - count(distinct (source, source_row_id)) duplicate_source_rows
  from represented
)
select *, valid_okp - total_represented unrepresented
from reconciliation;

do $harness$
declare
  v_valid bigint;
  v_confirmed bigint;
  v_review bigint;
  v_unrepresented bigint;
  v_duplicates bigint;
  v_payload jsonb;
begin
  with valid_okp as materialized (
    select booking.source, booking.source_row_id
    from public.customer_source_bookings_okp booking
    where booking.source_created_at >= timestamp '2026-09-29 00:00:00'
      and booking.source_created_at < timestamp '2026-09-30 00:00:00'
      and ((booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
        or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true))
  ), represented as materialized (
    select valid.source, valid.source_row_id,
      case link.status when 'active' then 'confirmed_customer' else 'global_review' end representation_type
    from valid_okp valid
    join public.customer_booking_profile_links link
      on link.source = valid.source and link.source_row_id = valid.source_row_id
    join public.customer_profiles profile on profile.id = link.profile_id
      and profile.status = 'active' and profile.merged_into_profile_id is null
    where link.status = 'active'
      or (link.status in ('candidate', 'conflict') and profile.needs_review is true
        and not exists (select 1 from public.customer_booking_profile_links active_link
          where active_link.profile_id = link.profile_id and active_link.status = 'active'))
  )
  select (select count(*) from valid_okp),
    count(*) filter (where representation_type = 'confirmed_customer'),
    count(*) filter (where representation_type = 'global_review'),
    (select count(*) from valid_okp) - count(*),
    count(*) - count(distinct (source, source_row_id))
  into v_valid, v_confirmed, v_review, v_unrepresented, v_duplicates
  from represented;

  if v_valid <> 28 or v_confirmed <> 22 or v_review <> 6
    or v_unrepresented <> 0 or v_duplicates <> 0 then
    raise exception 'okp_control_reconciliation_failed valid=% confirmed=% review=% unrepresented=% duplicates=%',
      v_valid, v_confirmed, v_review, v_unrepresented, v_duplicates;
  end if;
  v_payload := public.customer_window_v2_list_operational_global_v1(
    date '2026-09-29', date '2026-09-29', 'OKP', 1, 25
  );
  if (v_payload ->> 'validReservations')::bigint <> 28
    or (v_payload ->> 'stableReservations')::bigint <> 28
    or (v_payload ->> 'representedConfirmedReservations')::bigint <> 22
    or (v_payload ->> 'representedReviewReservations')::bigint <> 6
    or (v_payload ->> 'hotPendingReservations')::bigint <> 0
    or (v_payload ->> 'unrepresentedStableReservations')::bigint <> 0 then
    raise exception 'okp_operational_metadata_failed:%', v_payload;
  end if;
end;
$harness$;

do $harness$
declare
  v_valid bigint;
  v_stable bigint;
  v_hot bigint;
  v_hot_without_link bigint;
  v_hot_with_recent_link bigint;
  v_hot_other bigint;
  v_confirmed bigint;
  v_review bigint;
  v_unrepresented_stable bigint;
  v_duplicates bigint;
  v_payload jsonb;
begin
  with active_snapshot as materialized (
    select (pg_catalog.array_agg(snapshot_id))[1] snapshot_id,
      (pg_catalog.array_agg(captured_at))[1] captured_at
    from public.customer_related_review_snapshots
    where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active'
    having count(*) = 1
  ), valid_mcp_eap as materialized (
    select booking.source, booking.source_row_id, link.id as booking_link_id,
      greatest(booking.created_at, booking.updated_at, booking.source_synced_at,
        link.created_at, link.updated_at) <= snapshot.captured_at - interval '30 minutes' is_stable,
      greatest(link.created_at, link.updated_at)
        > snapshot.captured_at - interval '30 minutes' as has_recent_link
    from public.customer_source_bookings_mcp_eap booking
    cross join active_snapshot snapshot
    left join public.customer_booking_profile_links link
      on link.source = booking.source and link.source_row_id = booking.source_row_id
    where booking.source_created_at >= timestamp '2026-09-29 00:00:00'
      and booking.source_created_at < timestamp '2026-09-30 00:00:00'
      and booking.booking_status in (1, 8)
  ), represented as materialized (
    select valid.source, valid.source_row_id,
      case link.status when 'active' then 'confirmed_customer' else 'global_review' end representation_type
    from valid_mcp_eap valid
    join public.customer_booking_profile_links link
      on link.source = valid.source and link.source_row_id = valid.source_row_id
    join public.customer_profiles profile on profile.id = link.profile_id
      and profile.status = 'active' and profile.merged_into_profile_id is null
    where valid.is_stable and (link.status = 'active'
      or (link.status in ('candidate', 'conflict') and profile.needs_review is true
        and not exists (select 1 from public.customer_booking_profile_links active_link
          where active_link.profile_id = link.profile_id and active_link.status = 'active')))
  )
  select (select count(*) from valid_mcp_eap),
    (select count(*) from valid_mcp_eap where is_stable),
    (select count(*) from valid_mcp_eap where not is_stable),
    (select count(*) from valid_mcp_eap where not is_stable and booking_link_id is null),
    (select count(*) from valid_mcp_eap
      where not is_stable and booking_link_id is not null and has_recent_link),
    (select count(*) from valid_mcp_eap
      where not is_stable and booking_link_id is not null and not has_recent_link),
    count(*) filter (where representation_type = 'confirmed_customer'),
    count(*) filter (where representation_type = 'global_review'),
    (select count(*) from valid_mcp_eap where is_stable) - count(*),
    count(*) - count(distinct (source, source_row_id))
  into v_valid, v_stable, v_hot, v_hot_without_link, v_hot_with_recent_link, v_hot_other,
    v_confirmed, v_review, v_unrepresented_stable, v_duplicates
  from represented;
  if v_valid <> v_stable + v_hot
    or v_stable <> v_confirmed + v_review
    or v_hot <> v_hot_without_link + v_hot_with_recent_link + v_hot_other
    or v_unrepresented_stable <> 0 or v_duplicates <> 0 then
    raise exception 'mcp_eap_stable_reconciliation_failed valid=% stable=% hot=% hot_without_link=% hot_with_recent_link=% hot_other=% confirmed=% review=% unrepresented_stable=% duplicates=%',
      v_valid, v_stable, v_hot, v_hot_without_link, v_hot_with_recent_link, v_hot_other,
      v_confirmed, v_review, v_unrepresented_stable, v_duplicates;
  end if;
  v_payload := public.customer_window_v2_list_operational_global_v1(
    date '2026-09-29', date '2026-09-29', 'MCP_EAP', 1, 25
  );
  if (v_payload ->> 'validReservations')::bigint <> v_valid
    or (v_payload ->> 'stableReservations')::bigint <> v_stable
    or (v_payload ->> 'representedConfirmedReservations')::bigint <> v_confirmed
    or (v_payload ->> 'representedReviewReservations')::bigint <> v_review
    or (v_payload ->> 'hotPendingReservations')::bigint <> v_hot
    or (v_payload ->> 'unrepresentedStableReservations')::bigint <> 0 then
    raise exception 'mcp_eap_operational_metadata_failed:%', v_payload;
  end if;
end;
$harness$;

with review_profiles as materialized (
  select profile.id
  from public.customer_profiles profile
  where profile.status = 'active' and profile.merged_into_profile_id is null
    and profile.needs_review is true
    and exists (select 1 from public.customer_booking_profile_links link
      where link.profile_id = profile.id and link.status in ('candidate', 'conflict'))
    and not exists (select 1 from public.customer_booking_profile_links link
      where link.profile_id = profile.id and link.status = 'active')
), source_coverage as (
  select profile.id,
    bool_or(link.source = 'MCP_EAP') has_mcp_eap,
    bool_or(link.source = 'OKP') has_okp,
    count(*) link_count
  from review_profiles profile
  join public.customer_booking_profile_links link on link.profile_id = profile.id
    and link.status in ('candidate', 'conflict')
  group by profile.id
)
select count(*) expected_global_review_representations,
  count(*) filter (where has_mcp_eap and has_okp) cross_source_profiles,
  count(*) filter (where has_mcp_eap and not has_okp) mcp_eap_only_profiles,
  count(*) filter (where has_okp and not has_mcp_eap) okp_only_profiles,
  max(link_count) maximum_links_per_profile,
  0::bigint auxiliary_rows_created,
  0::bigint estimated_storage_bytes
from source_coverage;

select
  pg_catalog.has_function_privilege('service_role',
    'public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer)', 'EXECUTE') service_role_execute,
  not pg_catalog.has_function_privilege('anon',
    'public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer)', 'EXECUTE') anon_denied,
  not pg_catalog.has_function_privilege('authenticated',
    'public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer)', 'EXECUTE') authenticated_denied,
  pg_catalog.to_regprocedure('public.customer_window_v2_list_operational_representations_by_purchase_period(date,date,text,integer,integer)')
    is not null legacy_operational_rpc_preserved,
  pg_catalog.to_regprocedure('public.customer_window_360_v1_get_related_group_analytics(jsonb)')
    is not null related_group_analytics_preserved;
rollback;

do $postcheck$
begin
  if exists (
    select 1 from (values
    ('public.customer_window_global_review_v1_invalid(text)'),
    ('public.customer_window_global_review_v1_resolve_locator(jsonb)'),
    ('public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer)'),
    ('public.customer_window_v2_search_global_v1(text,text,text,bigint,text,integer)'),
    ('public.customer_window_360_v1_get_global_review_overview(jsonb)'),
    ('public.customer_window_360_v1_list_global_review_bookings(jsonb,integer,integer)'),
    ('public.customer_window_360_v1_list_global_review_contacts(jsonb,text,integer,integer)'),
    ('public.customer_window_360_v1_get_global_review_analytics(jsonb)'),
    ('public.customer_window_360_v1_get_global_review_identity(jsonb)')
    ) expected(signature)
    where pg_catalog.to_regprocedure(expected.signature) is not null
  ) then
    raise exception 'global_review_rollback_cleanup_failed';
  end if;
end;
$postcheck$;
