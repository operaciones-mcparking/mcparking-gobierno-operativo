-- Reversible runtime harness for the MCP/EAP representation v2 read model.
-- Run with psql ON_ERROR_STOP enabled. Any error aborts the transaction; disconnecting
-- or issuing ROLLBACK leaves both views absent.
begin;

set local lock_timeout = '3s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '60s';

-- BEGIN EMBEDDED MIGRATION BODY
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
-- END EMBEDDED MIGRATION BODY

do $catalog_checks$
declare
  v_expected_columns text[][] := array[
    array['snapshot_id', 'uuid'],
    array['source', 'text'],
    array['source_row_id', 'bigint'],
    array['booking_link_id', 'uuid'],
    array['representation_type', 'text'],
    array['representation_id', 'text'],
    array['representation_key', 'text'],
    array['customer_id', 'uuid'],
    array['related_group_id', 'text']
  ];
  v_actual_columns text[][];
  v_view_count integer;
  v_invalid_kind_count integer;
  v_invalid_security_count integer;
  v_unexpected_select_acl_count integer;
begin
  select count(*)::integer,
    count(*) filter (where relation.relkind <> 'v')::integer,
    count(*) filter (
      where not coalesce(relation.reloptions @> array['security_invoker=true']::text[], false)
    )::integer
  into v_view_count, v_invalid_kind_count, v_invalid_security_count
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in (
      'customer_window_mcp_eap_active_snapshot_authority_v2',
      'customer_window_mcp_eap_representations_v2'
    );

  if v_view_count <> 2 or v_invalid_kind_count <> 0 or v_invalid_security_count <> 0 then
    raise exception 'Representation v2 catalog contract failed';
  end if;

  select pg_catalog.array_agg(
    array[attribute.attname::text, pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)]
    order by attribute.attnum
  )
  into v_actual_columns
  from pg_catalog.pg_attribute attribute
  join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'customer_window_mcp_eap_representations_v2'
    and attribute.attnum > 0
    and not attribute.attisdropped;

  if v_actual_columns is distinct from v_expected_columns then
    raise exception 'Representation v2 column contract failed';
  end if;

  select count(*)::integer
  into v_unexpected_select_acl_count
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  cross join lateral pg_catalog.aclexplode(
    coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
  ) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where namespace.nspname = 'public'
    and relation.relname in (
      'customer_window_mcp_eap_active_snapshot_authority_v2',
      'customer_window_mcp_eap_representations_v2'
    )
    and acl.privilege_type = 'SELECT'
    and (
      acl.grantee = 0
      or grantee.rolname in ('anon', 'authenticated', 'service_role')
    );

  if v_unexpected_select_acl_count <> 0 then
    raise exception 'Representation v2 unexpected SELECT privilege';
  end if;
end;
$catalog_checks$;

do $authority_checks$
declare
  v_active_snapshot_count integer;
  v_snapshot_id uuid;
begin
  select authority.active_snapshot_count, authority.snapshot_id
  into v_active_snapshot_count, v_snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority;

  if v_active_snapshot_count <> 1 or v_snapshot_id is null then
    raise exception 'Representation v2 active snapshot authority failed';
  end if;
end;
$authority_checks$;

create temporary table rr_representation_v2_parity_result
on commit drop
as
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
  join public.customer_related_review_snapshots snapshot
    on authority.active_snapshot_count = 1
   and snapshot.snapshot_id = authority.snapshot_id
   and snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
   and snapshot.status = 'active'
),
representations as materialized (
  select *
  from public.customer_window_mcp_eap_representations_v2
),
assignment_counts as (
  select count(*)::bigint as total
  from active_snapshot snapshot
  join public.customer_analytical_booking_assignments assignment
    on assignment.snapshot_id = snapshot.snapshot_id
),
view_counts as (
  select
    count(*)::bigint as total,
    count(*) filter (where representation_type = 'confirmed_customer')::bigint as confirmed,
    count(*) filter (where representation_type = 'related_review')::bigint as related,
    count(*) filter (
      where representation_type not in ('confirmed_customer', 'related_review')
    )::bigint as unexpected_representation_type,
    count(*) filter (where representation_id is null)::bigint as null_representation_id,
    count(*) filter (where representation_key is null)::bigint as null_representation_key,
    count(*) filter (
      where representation_type = 'confirmed_customer'
        and (customer_id is null or related_group_id is not null)
    )::bigint
      + count(*) filter (
        where representation_type = 'related_review'
          and (customer_id is not null or related_group_id is null)
      )::bigint as xor_violations,
    count(*) filter (
      where representation_key <> representation_type || ':' || representation_id
    )::bigint as representation_key_mismatch
  from representations
),
duplicate_bookings as (
  select count(*)::bigint as duplicate_booking_representations
  from (
    select snapshot_id, source, source_row_id
    from representations
    group by snapshot_id, source, source_row_id
    having count(*) <> 1
  ) duplicate
),
mapping_checks as (
  select
    count(*) filter (
      where assignment.booking_link_id is null
        or assignment.representation_type <> representation.representation_type
        or assignment.customer_id is distinct from representation.customer_id
        or assignment.related_group_id is distinct from representation.related_group_id
    )::bigint as assignment_mapping_mismatch,
    count(*) filter (
      where representation.representation_type = 'related_review'
        and related_group.group_id is null
    )::bigint as related_group_snapshot_mismatch
  from representations representation
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
  assignment.total as assignments_active,
  view_count.total as view_total,
  view_count.confirmed as view_confirmed,
  view_count.related as view_related,
  snapshot.valid_source_count,
  snapshot.confirmed_count,
  snapshot.related_count,
  view_count.unexpected_representation_type,
  view_count.null_representation_id,
  view_count.null_representation_key,
  view_count.xor_violations,
  duplicate.duplicate_booking_representations,
  mapping.assignment_mapping_mismatch,
  mapping.related_group_snapshot_mismatch,
  view_count.representation_key_mismatch,
  (
    snapshot.active_snapshot_count = 1
    and assignment.total = view_count.total
    and view_count.total = snapshot.valid_source_count
    and view_count.confirmed = snapshot.confirmed_count
    and view_count.related = snapshot.related_count
    and view_count.confirmed + view_count.related = view_count.total
    and view_count.unexpected_representation_type = 0
    and view_count.null_representation_id = 0
    and view_count.null_representation_key = 0
    and view_count.xor_violations = 0
    and duplicate.duplicate_booking_representations = 0
    and mapping.assignment_mapping_mismatch = 0
    and mapping.related_group_snapshot_mismatch = 0
    and view_count.representation_key_mismatch = 0
  ) as parity_ok
from active_snapshot snapshot
cross join assignment_counts assignment
cross join view_counts view_count
cross join duplicate_bookings duplicate
cross join mapping_checks mapping;

do $parity_checks$
begin
  if not exists (
    select 1
    from pg_temp.rr_representation_v2_parity_result parity
    where parity.parity_ok is true
  ) then
    raise exception 'Representation v2 parity contract failed';
  end if;
end;
$parity_checks$;

select *
from pg_temp.rr_representation_v2_parity_result;

rollback;
