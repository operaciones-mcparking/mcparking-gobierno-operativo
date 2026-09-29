begin transaction read only;

set local statement_timeout = '2min';
set local lock_timeout = '30s';

-- Operational OKP period classification. Expected: OKP source_created index,
-- source-row unique lookup on booking links, profile PK lookup, early LIMIT.
explain (verbose, costs, buffers false)
with source_rows as materialized (
  select booking.source, booking.source_row_id, booking.source_created_at,
    link.profile_id, link.status
  from public.customer_source_bookings_okp booking
  join public.customer_booking_profile_links link
    on link.source = 'OKP' and link.source_row_id = booking.source_row_id
  where booking.source_created_at >= timestamp '2026-09-29 00:00:00'
    and booking.source_created_at < timestamp '2026-09-30 00:00:00'
    and ((booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
      or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true))
), classified as materialized (
  select source.source_created_at, source.profile_id,
    case source.status when 'active' then 'confirmed_customer' else 'global_review' end representation_type
  from source_rows source
  join public.customer_profiles profile on profile.id = source.profile_id
    and profile.status = 'active' and profile.merged_into_profile_id is null
  where source.status = 'active'
    or (source.status in ('candidate', 'conflict') and profile.needs_review is true
      and not exists (select 1 from public.customer_booking_profile_links active_link
        where active_link.profile_id = source.profile_id and active_link.status = 'active'))
)
select representation_type, profile_id, count(*), max(source_created_at)
from classified
group by representation_type, profile_id
order by max(source_created_at) desc, representation_type, profile_id
limit 25;

-- Operational MCP/EAP stable classification and hot metadata. Expected: period
-- index on source bookings, source-row link lookup, one-row active snapshot, and
-- no scan outside the requested period. Hot rows never enter classified.
explain (verbose, costs, buffers false)
with active_snapshot as materialized (
  select snapshot.snapshot_id, snapshot.captured_at
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and snapshot.status = 'active'
), source_rows as materialized (
  select booking.source, booking.source_row_id, booking.source_created_at,
    link.profile_id, link.status,
    greatest(booking.created_at, booking.updated_at, booking.source_synced_at,
      link.created_at, link.updated_at) <= snapshot.captured_at - interval '30 minutes' is_stable
  from public.customer_source_bookings_mcp_eap booking
  cross join active_snapshot snapshot
  left join public.customer_booking_profile_links link
    on link.source = booking.source and link.source_row_id = booking.source_row_id
  where booking.source_created_at >= timestamp '2026-09-29 00:00:00'
    and booking.source_created_at < timestamp '2026-09-30 00:00:00'
    and booking.booking_status in (1, 8)
), classified as materialized (
  select source.source_created_at, source.profile_id,
    case source.status when 'active' then 'confirmed_customer' else 'global_review' end representation_type
  from source_rows source
  join public.customer_profiles profile on profile.id = source.profile_id
    and profile.status = 'active' and profile.merged_into_profile_id is null
  where source.is_stable and (source.status = 'active'
    or (source.status in ('candidate', 'conflict') and profile.needs_review is true
      and not exists (select 1 from public.customer_booking_profile_links active_link
        where active_link.profile_id = source.profile_id and active_link.status = 'active')))
)
select representation_type, profile_id, count(*), max(source_created_at)
from classified
group by representation_type, profile_id
order by max(source_created_at) desc, representation_type, profile_id
limit 25;

-- Profile-scoped history. Expected: booking_profile_links_profile_idx followed by
-- point lookups on both source-row unique indexes; no full source-table scan.
explain (verbose, costs, buffers false)
with review_links as materialized (
  select link.source, link.source_row_id
  from public.customer_booking_profile_links link
  where link.profile_id = '90404a48-2677-4215-b455-78c70045ba30'::uuid
    and link.status in ('candidate', 'conflict')
), history as (
  select booking.source_created_at, booking.source, booking.source_row_id
  from review_links link
  join public.customer_source_bookings_mcp_eap booking
    on link.source = 'MCP_EAP' and booking.source = link.source
    and booking.source_row_id = link.source_row_id
  where booking.booking_status in (1, 8)
  union all
  select booking.source_created_at, booking.source, booking.source_row_id
  from review_links link
  join public.customer_source_bookings_okp booking
    on link.source = 'OKP' and booking.source = link.source
    and booking.source_row_id = link.source_row_id
  where ((booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
    or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true))
)
select * from history
order by source_created_at desc nulls last, source desc, source_row_id desc
limit 20;

-- Evidence lookup. Expected: phone/email indexes, then active-snapshot assignment
-- lookup. Each branch is separate so no OR prevents index access.
explain (verbose, costs, buffers false)
with active_snapshot as materialized (
  select snapshot_id from public.customer_related_review_snapshots
  where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active'
), profile_contacts as materialized (
  select distinct booking.phone_normalized value
  from public.customer_booking_profile_links link
  join public.customer_source_bookings_okp booking
    on link.source = 'OKP' and booking.source = link.source
    and booking.source_row_id = link.source_row_id
  where link.profile_id = '90404a48-2677-4215-b455-78c70045ba30'::uuid
    and link.status in ('candidate', 'conflict')
    and booking.phone_normalized is not null
)
select distinct assignment.related_group_id
from profile_contacts contact
cross join active_snapshot snapshot
join public.customer_source_bookings_mcp_eap booking
  on booking.phone_normalized = contact.value
join public.customer_analytical_booking_assignments assignment
  on assignment.snapshot_id = snapshot.snapshot_id
  and assignment.source = booking.source
  and assignment.source_row_id = booking.source_row_id
  and assignment.representation_type = 'related_review';

-- Exact global search branch. Expected: source email index, source-row unique link
-- lookup, profile PK, then profile-scoped history only for the bounded result.
explain (verbose, costs, buffers false)
select link.profile_id, link.status
from public.customer_source_bookings_okp booking
join public.customer_booking_profile_links link
  on link.source = booking.source and link.source_row_id = booking.source_row_id
join public.customer_profiles profile on profile.id = link.profile_id
where booking.email_normalized = 'max.al.flores.a@gmail.com'
  and profile.status = 'active' and profile.merged_into_profile_id is null
  and (link.status = 'active'
    or (link.status in ('candidate', 'conflict') and profile.needs_review is true
      and not exists (select 1 from public.customer_booking_profile_links active_link
        where active_link.profile_id = link.profile_id and active_link.status = 'active')))
limit 20;

rollback;
