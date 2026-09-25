begin;

create or replace view public.customer_window_mcp_eap_active_snapshot_authority_v2
with (security_invoker = true)
as
with active_snapshots as materialized (
  select snapshot.snapshot_id
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and snapshot.status = 'active'
)
select
  count(*)::integer as active_snapshot_count,
  case
    when count(*) = 1
      then (pg_catalog.array_agg(active_snapshots.snapshot_id order by active_snapshots.snapshot_id))[1]
    else null::uuid
  end as snapshot_id
from active_snapshots;

create or replace view public.customer_window_mcp_eap_representations_v2
with (security_invoker = true)
as
select
  assignment.snapshot_id,
  assignment.source,
  assignment.source_row_id,
  assignment.booking_link_id,
  assignment.representation_type,
  case assignment.representation_type
    when 'confirmed_customer' then assignment.customer_id::text
    when 'related_review' then assignment.related_group_id
  end as representation_id,
  case assignment.representation_type
    when 'confirmed_customer'
      then 'confirmed_customer:' || assignment.customer_id::text
    when 'related_review'
      then 'related_review:' || assignment.related_group_id
  end as representation_key,
  assignment.customer_id,
  assignment.related_group_id
from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority
join public.customer_analytical_booking_assignments assignment
  on authority.active_snapshot_count = 1
 and assignment.snapshot_id = authority.snapshot_id
where (
    assignment.representation_type = 'confirmed_customer'
    and assignment.customer_id is not null
    and assignment.related_group_id is null
  ) or (
    assignment.representation_type = 'related_review'
    and assignment.customer_id is null
    and assignment.related_group_id is not null
  );

revoke all on public.customer_window_mcp_eap_active_snapshot_authority_v2
  from public, anon, authenticated, service_role;
revoke all on public.customer_window_mcp_eap_representations_v2
  from public, anon, authenticated, service_role;

comment on view public.customer_window_mcp_eap_active_snapshot_authority_v2 is
  'Private fail-closed authority for the single active RELATED_REVIEW_MCP_EAP_V1 snapshot. A null snapshot_id means active cardinality is not exactly one.';
comment on view public.customer_window_mcp_eap_representations_v2 is
  'Private, non-PII MCP/EAP analytical representation per active-snapshot booking assignment.';

commit;
