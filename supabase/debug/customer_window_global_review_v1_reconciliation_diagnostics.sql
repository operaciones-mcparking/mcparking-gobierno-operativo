with active_snapshot as materialized (
  select
    (pg_catalog.array_agg(snapshot_id))[1] as snapshot_id,
    (pg_catalog.array_agg(captured_at))[1] as captured_at
  from public.customer_related_review_snapshots
  where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active'
  having count(*) = 1
), valid as materialized (
  select booking.source, booking.source_row_id
  from public.customer_source_bookings_mcp_eap booking
  where booking.source_created_at >= timestamp '2026-09-29 00:00:00'
    and booking.source_created_at < timestamp '2026-09-30 00:00:00'
    and booking.booking_status in (1, 8)
), classified as materialized (
  select
    valid.source,
    valid.source_row_id,
    link.profile_id,
    link.status as link_status,
    profile.status as profile_status,
    profile.needs_review,
    profile.merged_into_profile_id,
    exists (
      select 1
      from public.customer_booking_profile_links active_link
      where active_link.profile_id = link.profile_id
        and active_link.status = 'active'
    ) as profile_has_active_link,
    case
      when link.id is null then 'NO_BOOKING_LINK'
      when profile.id is null then 'NO_PROFILE'
      when profile.status <> 'active' then 'PROFILE_NOT_ACTIVE'
      when profile.merged_into_profile_id is not null then 'PROFILE_MERGED'
      when link.status = 'active' then 'CONFIRMED'
      when link.status in ('candidate', 'conflict')
        and profile.needs_review is true
        and not exists (
          select 1
          from public.customer_booking_profile_links active_link
          where active_link.profile_id = link.profile_id
            and active_link.status = 'active'
        ) then 'GLOBAL_REVIEW'
      when link.status in ('candidate', 'conflict')
        and profile.needs_review is not true then 'REVIEW_PROFILE_FLAG_FALSE'
      when link.status in ('candidate', 'conflict') then 'REVIEW_PROFILE_HAS_ACTIVE_LINK'
      else 'OTHER'
    end as classification
  from valid
  left join public.customer_booking_profile_links link
    on link.source = valid.source
    and link.source_row_id = valid.source_row_id
  left join public.customer_profiles profile
    on profile.id = link.profile_id
), classification_counts as (
  select
    classification,
    link_status,
    profile_status,
    needs_review,
    profile_has_active_link,
    count(*)::bigint as booking_count,
    count(distinct profile_id)::bigint as profile_count
  from classified
  group by classification, link_status, profile_status, needs_review, profile_has_active_link
), missing_timing_counts as (
  select
    case
      when greatest(booking.created_at, booking.updated_at, booking.source_synced_at)
        <= snapshot.captured_at - interval '30 minutes' then 'STABLE_AT_SNAPSHOT_CUTOFF'
      else 'HOT_AT_SNAPSHOT_CUTOFF'
    end as stability_classification,
    count(*)::bigint as booking_count,
    min(greatest(booking.created_at, booking.updated_at, booking.source_synced_at)) as min_activity_at,
    max(greatest(booking.created_at, booking.updated_at, booking.source_synced_at)) as max_activity_at
  from classified
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = classified.source
    and booking.source_row_id = classified.source_row_id
  cross join active_snapshot snapshot
  where classified.classification = 'NO_BOOKING_LINK'
  group by 1
), snapshot_mapping_counts as (
  select
    coalesce(assignment.representation_type, 'UNASSIGNED') as representation_type,
    count(*)::bigint as booking_count,
    count(distinct classified.profile_id)::bigint as profile_count,
    count(distinct assignment.related_group_id)::bigint as related_group_count
  from classified
  cross join active_snapshot snapshot
  left join public.customer_analytical_booking_assignments assignment
    on assignment.snapshot_id = snapshot.snapshot_id
    and assignment.source = classified.source
    and assignment.source_row_id = classified.source_row_id
  where classified.classification not in ('CONFIRMED', 'GLOBAL_REVIEW')
  group by coalesce(assignment.representation_type, 'UNASSIGNED')
)
select pg_catalog.jsonb_build_object(
  'periodFrom', '2026-09-29',
  'periodTo', '2026-09-29',
  'activeSnapshotId', (select snapshot_id from active_snapshot),
  'activeSnapshotCapturedAt', (select captured_at from active_snapshot),
  'validBookingCount', (select count(*)::bigint from valid),
  'classification', coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(item)
      order by item.booking_count desc, item.classification
    )
    from classification_counts item
  ), '[]'::jsonb),
  'missingBookingLinkTiming', coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(item)
      order by item.booking_count desc, item.stability_classification
    )
    from missing_timing_counts item
  ), '[]'::jsonb),
  'notRepresentedSnapshotMapping', coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(item)
      order by item.booking_count desc, item.representation_type
    )
    from snapshot_mapping_counts item
  ), '[]'::jsonb)
) as reconciliation_diagnostic;
