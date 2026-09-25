-- READ-ONLY contract audit for the active MCP/EAP representation read model.
with authority as (
  select active_snapshot_count, snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2
),
active_snapshot as (
  select
    authority.active_snapshot_count,
    snapshot.snapshot_id,
    snapshot.valid_source_count,
    snapshot.confirmed_count,
    snapshot.related_count
  from authority
  left join public.customer_related_review_snapshots snapshot
    on authority.active_snapshot_count = 1
   and snapshot.snapshot_id = authority.snapshot_id
   and snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
   and snapshot.status = 'active'
),
assignment_counts as (
  select
    count(*)::bigint as total,
    count(*) filter (
      where assignment.representation_type = 'confirmed_customer'
    )::bigint as confirmed,
    count(*) filter (
      where assignment.representation_type = 'related_review'
    )::bigint as related
  from active_snapshot snapshot
  join public.customer_analytical_booking_assignments assignment
    on assignment.snapshot_id = snapshot.snapshot_id
),
view_counts as (
  select
    count(*)::bigint as total,
    count(*) filter (
      where representation.representation_type = 'confirmed_customer'
    )::bigint as confirmed,
    count(*) filter (
      where representation.representation_type = 'related_review'
    )::bigint as related,
    count(*) filter (
      where representation.representation_type not in ('confirmed_customer', 'related_review')
    )::bigint as unexpected_types,
    count(*) filter (where representation.representation_id is null)::bigint as null_ids,
    count(*) filter (where representation.representation_key is null)::bigint as null_keys,
    count(*) filter (
      where representation.representation_type = 'confirmed_customer'
        and (representation.customer_id is null or representation.related_group_id is not null)
    )::bigint as invalid_confirmed_xor,
    count(*) filter (
      where representation.representation_type = 'related_review'
        and (representation.customer_id is not null or representation.related_group_id is null)
    )::bigint as invalid_related_xor
  from public.customer_window_mcp_eap_representations_v2 representation
),
duplicate_source_rows as (
  select count(*)::bigint as duplicate_groups
  from (
    select representation.snapshot_id, representation.source, representation.source_row_id
    from public.customer_window_mcp_eap_representations_v2 representation
    group by representation.snapshot_id, representation.source, representation.source_row_id
    having count(*) <> 1
  ) duplicate
),
mapping_mismatches as (
  select
    count(*) filter (
      where assignment.booking_link_id is null
        or assignment.representation_type <> representation.representation_type
        or assignment.customer_id is distinct from representation.customer_id
        or assignment.related_group_id is distinct from representation.related_group_id
    )::bigint as assignment_mismatches,
    count(*) filter (
      where representation.representation_type = 'related_review'
        and related_group.group_id is null
    )::bigint as unscoped_related_groups
  from public.customer_window_mcp_eap_representations_v2 representation
  left join public.customer_analytical_booking_assignments assignment
    on assignment.snapshot_id = representation.snapshot_id
   and assignment.source = representation.source
   and assignment.source_row_id = representation.source_row_id
   and assignment.booking_link_id = representation.booking_link_id
  left join public.customer_related_review_groups related_group
    on related_group.snapshot_id = representation.snapshot_id
   and related_group.group_id = representation.related_group_id
)
select
  snapshot.active_snapshot_count,
  snapshot.snapshot_id,
  assignment.total as active_assignment_count,
  view_count.total as view_total,
  view_count.confirmed as view_confirmed,
  view_count.related as view_related,
  snapshot.valid_source_count,
  snapshot.confirmed_count,
  snapshot.related_count,
  view_count.unexpected_types,
  view_count.null_ids,
  view_count.null_keys,
  view_count.invalid_confirmed_xor,
  view_count.invalid_related_xor,
  duplicate_source_rows.duplicate_groups,
  mapping.assignment_mismatches,
  mapping.unscoped_related_groups,
  (
    snapshot.active_snapshot_count = 1
    and assignment.total = view_count.total
    and view_count.total = view_count.confirmed + view_count.related
    and view_count.total = snapshot.valid_source_count
    and view_count.confirmed = snapshot.confirmed_count
    and view_count.related = snapshot.related_count
    and view_count.unexpected_types = 0
    and view_count.null_ids = 0
    and view_count.null_keys = 0
    and view_count.invalid_confirmed_xor = 0
    and view_count.invalid_related_xor = 0
    and duplicate_source_rows.duplicate_groups = 0
    and mapping.assignment_mismatches = 0
    and mapping.unscoped_related_groups = 0
  ) as parity_ok
from active_snapshot snapshot
cross join assignment_counts assignment
cross join view_counts view_count
cross join duplicate_source_rows
cross join mapping_mismatches mapping;
