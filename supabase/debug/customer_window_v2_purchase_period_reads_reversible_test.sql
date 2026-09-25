-- Reversible runtime harness for Customer Window v2 period reads.
begin;

set local lock_timeout = '3s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '60s';

-- BEGIN EMBEDDED MIGRATION BODY
create or replace function public.customer_window_v2_list_representations_by_purchase_period(
  p_from date,
  p_to date,
  p_page integer default 1,
  p_page_size integer default 25
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
  v_missing_metrics bigint;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid purchase period' using errcode = '22023';
  end if;
  if p_page is null or p_page < 1
    or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'Invalid pagination' using errcode = '22023';
  end if;

  select authority.active_snapshot_count, authority.snapshot_id
  into v_active_snapshot_count, v_snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority;

  if v_active_snapshot_count <> 1 or v_snapshot_id is null then
    raise exception 'Customer Window v2 requires exactly one active snapshot'
      using errcode = 'P0001';
  end if;

  with period_representations as materialized (
    select
      representation.snapshot_id,
      representation.representation_type,
      representation.representation_id,
      representation.representation_key,
      representation.customer_id,
      representation.related_group_id,
      count(*)::bigint as reservations_in_period,
      max(booking.source_created_at) as last_booking_at_in_period
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = booking.source
     and representation.source_row_id = booking.source_row_id
    where booking.source = 'MCP_EAP'
      and booking.booking_status in (1, 8)
      and booking.source_created_at >= p_from::timestamp without time zone
      and booking.source_created_at < (p_to + 1)::timestamp without time zone
    group by
      representation.snapshot_id,
      representation.representation_type,
      representation.representation_id,
      representation.representation_key,
      representation.customer_id,
      representation.related_group_id
  ),
  enriched as materialized (
    select
      period.representation_type,
      period.representation_id,
      period.representation_key,
      period.customer_id,
      period.related_group_id,
      case period.representation_type
        when 'confirmed_customer' then profile_metrics.total_reservations
        when 'related_review' then related_metrics.total_reservations
      end as total_reservations,
      case period.representation_type
        when 'confirmed_customer' then profile_metrics.first_purchase_at
        when 'related_review' then related_metrics.first_purchase_at
      end as first_purchase_at,
      case period.representation_type
        when 'confirmed_customer' then profile_metrics.last_purchase_at
        when 'related_review' then related_metrics.last_purchase_at
      end as last_purchase_at,
      case period.representation_type
        when 'confirmed_customer' then 'all_confirmed_sources'::text
        when 'related_review' then 'mcp_eap_active_snapshot'::text
      end as metric_scope,
      period.reservations_in_period,
      period.last_booking_at_in_period
    from period_representations period
    left join public.customer_profile_metrics profile_metrics
      on period.representation_type = 'confirmed_customer'
     and profile_metrics.customer_id = period.customer_id
    left join public.customer_related_review_metrics related_metrics
      on period.representation_type = 'related_review'
     and related_metrics.snapshot_id = period.snapshot_id
     and related_metrics.group_id = period.related_group_id
  ),
  paged as (
    select *
    from enriched
    order by last_booking_at_in_period desc, representation_key asc
    limit p_page_size offset (p_page - 1) * p_page_size
  )
  select
    pg_catalog.jsonb_build_object(
      'items', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'representationType', paged.representation_type,
            'representationId', paged.representation_id,
            'representationKey', paged.representation_key,
            'customerId', paged.customer_id,
            'relatedGroupId', paged.related_group_id,
            'totalReservations', paged.total_reservations,
            'firstPurchaseAt', paged.first_purchase_at,
            'lastPurchaseAt', paged.last_purchase_at,
            'metricScope', paged.metric_scope,
            'reservationsInPeriod', paged.reservations_in_period,
            'lastBookingAtInPeriod', paged.last_booking_at_in_period
          ) order by paged.last_booking_at_in_period desc, paged.representation_key asc
        )
        from paged
      ), '[]'::jsonb),
      'total', (select count(*)::bigint from enriched),
      'page', p_page,
      'pageSize', p_page_size
    ),
    count(*) filter (
      where enriched.total_reservations is null
        or enriched.first_purchase_at is null
        or enriched.last_purchase_at is null
        or enriched.metric_scope is null
    )::bigint
  into v_result, v_missing_metrics
  from enriched;

  if v_missing_metrics <> 0 then
    raise exception 'Customer Window v2 representation metrics are incomplete'
      using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

create or replace function public.customer_window_v2_get_purchase_period_facets(
  p_from date,
  p_to date
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
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid purchase period' using errcode = '22023';
  end if;

  select authority.active_snapshot_count, authority.snapshot_id
  into v_active_snapshot_count, v_snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority;

  if v_active_snapshot_count <> 1 or v_snapshot_id is null then
    raise exception 'Customer Window v2 requires exactly one active snapshot'
      using errcode = 'P0001';
  end if;

  with period_representations as materialized (
    select
      representation.representation_key,
      representation.representation_type,
      count(*)::bigint as bookings_in_period
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = booking.source
     and representation.source_row_id = booking.source_row_id
    where booking.source = 'MCP_EAP'
      and booking.booking_status in (1, 8)
      and booking.source_created_at >= p_from::timestamp without time zone
      and booking.source_created_at < (p_to + 1)::timestamp without time zone
    group by representation.representation_key, representation.representation_type
  )
  select pg_catalog.jsonb_build_object(
    'totalRepresentations', count(*)::bigint,
    'confirmedRepresentations', count(*) filter (
      where representation_type = 'confirmed_customer'
    )::bigint,
    'relatedReviewRepresentations', count(*) filter (
      where representation_type = 'related_review'
    )::bigint,
    'totalBookingsInPeriod', coalesce(sum(bookings_in_period), 0)::bigint,
    'confirmedBookingsInPeriod', coalesce(sum(bookings_in_period) filter (
      where representation_type = 'confirmed_customer'
    ), 0)::bigint,
    'relatedReviewBookingsInPeriod', coalesce(sum(bookings_in_period) filter (
      where representation_type = 'related_review'
    ), 0)::bigint
  )
  into v_result
  from period_representations;

  return v_result;
end;
$$;

revoke all on function public.customer_window_v2_list_representations_by_purchase_period(
  date, date, integer, integer
) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_v2_get_purchase_period_facets(date, date)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_window_v2_list_representations_by_purchase_period(
  date, date, integer, integer
) to service_role;
grant execute on function public.customer_window_v2_get_purchase_period_facets(date, date)
  to service_role;

comment on function public.customer_window_v2_list_representations_by_purchase_period(
  date, date, integer, integer
) is 'Lists active-snapshot MCP/EAP analytical representations by inclusive purchase date without treating related-review groups as confirmed customers.';
comment on function public.customer_window_v2_get_purchase_period_facets(date, date) is
  'Returns minimal active-snapshot MCP/EAP representation and booking counts for an inclusive purchase date period.';
-- END EMBEDDED MIGRATION BODY

create temporary table rr_v2_period_catalog_diagnostic
on commit drop
as
with expected as (
  select *
  from (values
    (
      'list'::text,
      'public.customer_window_v2_list_representations_by_purchase_period(date,date,integer,integer)'::text,
      'p_from date, p_to date, p_page integer, p_page_size integer'::text,
      4::integer,
      2::integer
    ),
    (
      'facets'::text,
      'public.customer_window_v2_get_purchase_period_facets(date,date)'::text,
      'p_from date, p_to date'::text,
      2::integer,
      0::integer
    )
  ) definition(function_key, signature, identity_arguments, argument_count, default_count)
)
select
  expected.function_key,
  procedure.oid,
  namespace.nspname as schema_name,
  procedure.proname,
  pg_catalog.pg_get_function_identity_arguments(procedure.oid) as actual_identity_arguments,
  pg_catalog.pg_get_function_arguments(procedure.oid) as actual_arguments_with_defaults,
  procedure.prorettype as actual_return_type_oid,
  pg_catalog.format_type(procedure.prorettype, null) as actual_return_type,
  procedure.prolang as actual_language_oid,
  language.lanname as actual_language,
  procedure.provolatile as actual_volatility,
  procedure.prosecdef as actual_security_definer,
  procedure.proconfig as actual_proconfig,
  (
    select config
    from pg_catalog.unnest(procedure.proconfig) config
    where config like 'search_path=%'
    limit 1
  ) as actual_search_path_setting,
  procedure.proacl as actual_proacl,
  procedure.pronargs as actual_argument_count,
  procedure.pronargdefaults as actual_default_argument_count,
  procedure.proargtypes::oid[] as actual_argument_type_oids,
  owner.rolname as owner_name,
  effective_public_acl.public_execute,
  pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
    as authenticated_execute,
  pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')
    as service_role_execute,
  procedure.oid is not null as exists_ok,
  procedure.oid = pg_catalog.to_regprocedure(expected.signature)
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = expected.identity_arguments
    and procedure.pronargs = expected.argument_count as signature_ok,
  pg_catalog.format_type(procedure.prorettype, null) = 'jsonb' as return_type_ok,
  language.lanname = 'plpgsql' as language_ok,
  procedure.provolatile = 's' as stable_ok,
  procedure.prosecdef is true as security_definer_ok,
  (
    procedure.proconfig is not null
    and search_path_contract.setting_count = 1
    and search_path_contract.only_setting_is_empty
  ) as search_path_ok,
  procedure.pronargdefaults = expected.default_count as defaults_ok,
  (
    pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')
    and not effective_public_acl.public_execute
    and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
  ) as acl_ok
from expected
left join pg_catalog.pg_proc procedure
  on procedure.oid = pg_catalog.to_regprocedure(expected.signature)
left join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
left join pg_catalog.pg_language language on language.oid = procedure.prolang
left join pg_catalog.pg_roles owner on owner.oid = procedure.proowner
left join lateral (
  select
    count(*)::integer as setting_count,
    coalesce(
      pg_catalog.bool_and(
        pg_catalog.substr(
          config,
          pg_catalog.length('search_path=') + 1
        ) in ('', '""')
      ),
      false
    ) as only_setting_is_empty
  from pg_catalog.unnest(procedure.proconfig) config
  where config like 'search_path=%'
) search_path_contract on procedure.oid is not null
left join lateral (
  select coalesce(
    pg_catalog.bool_or(
      acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
    ),
    false
  ) as public_execute
  from pg_catalog.aclexplode(
    coalesce(
      procedure.proacl,
      pg_catalog.acldefault('f', procedure.proowner)
    )
  ) acl
) effective_public_acl on procedure.oid is not null;

select *
from pg_temp.rr_v2_period_catalog_diagnostic
order by function_key;

create temporary table rr_v2_period_catalog_summary
on commit drop
as
select
  pg_catalog.bool_and(exists_ok) filter (where function_key = 'list') as list_exists_ok,
  pg_catalog.bool_and(signature_ok) filter (where function_key = 'list') as list_signature_ok,
  pg_catalog.bool_and(return_type_ok) filter (where function_key = 'list') as list_return_type_ok,
  pg_catalog.bool_and(language_ok) filter (where function_key = 'list') as list_language_ok,
  pg_catalog.bool_and(stable_ok) filter (where function_key = 'list') as list_stable_ok,
  pg_catalog.bool_and(security_definer_ok) filter (where function_key = 'list')
    as list_security_definer_ok,
  pg_catalog.bool_and(search_path_ok) filter (where function_key = 'list')
    as list_search_path_ok,
  pg_catalog.bool_and(defaults_ok) filter (where function_key = 'list') as list_defaults_ok,
  pg_catalog.bool_and(acl_ok) filter (where function_key = 'list') as list_acl_ok,
  pg_catalog.bool_and(exists_ok) filter (where function_key = 'facets') as facets_exists_ok,
  pg_catalog.bool_and(signature_ok) filter (where function_key = 'facets') as facets_signature_ok,
  pg_catalog.bool_and(return_type_ok) filter (where function_key = 'facets')
    as facets_return_type_ok,
  pg_catalog.bool_and(language_ok) filter (where function_key = 'facets') as facets_language_ok,
  pg_catalog.bool_and(stable_ok) filter (where function_key = 'facets') as facets_stable_ok,
  pg_catalog.bool_and(security_definer_ok) filter (where function_key = 'facets')
    as facets_security_definer_ok,
  pg_catalog.bool_and(search_path_ok) filter (where function_key = 'facets')
    as facets_search_path_ok,
  pg_catalog.bool_and(defaults_ok) filter (where function_key = 'facets')
    as facets_defaults_ok,
  pg_catalog.bool_and(acl_ok) filter (where function_key = 'facets') as facets_acl_ok
from pg_temp.rr_v2_period_catalog_diagnostic;

select *
from pg_temp.rr_v2_period_catalog_summary;

do $catalog_checks$
declare
  v_diagnostic record;
  v_summary jsonb;
begin
  for v_diagnostic in
    select * from pg_temp.rr_v2_period_catalog_diagnostic order by function_key
  loop
    raise notice 'CUSTOMER_WINDOW_V2_CATALOG_DIAGNOSTIC %',
      pg_catalog.jsonb_strip_nulls(pg_catalog.to_jsonb(v_diagnostic));
  end loop;

  select pg_catalog.to_jsonb(summary)
  into v_summary
  from pg_temp.rr_v2_period_catalog_summary summary;
  raise notice 'CUSTOMER_WINDOW_V2_CATALOG_SUMMARY %', v_summary;

  if exists (
    select 1
    from pg_temp.rr_v2_period_catalog_diagnostic diagnostic
    where not coalesce(diagnostic.exists_ok, false)
      or not coalesce(diagnostic.signature_ok, false)
      or not coalesce(diagnostic.return_type_ok, false)
      or not coalesce(diagnostic.language_ok, false)
      or not coalesce(diagnostic.stable_ok, false)
      or not coalesce(diagnostic.security_definer_ok, false)
      or not coalesce(diagnostic.search_path_ok, false)
      or not coalesce(diagnostic.defaults_ok, false)
      or not coalesce(diagnostic.acl_ok, false)
  ) then
    raise exception 'Customer Window v2 period RPC catalog contract failed';
  end if;
end;
$catalog_checks$;

create temporary table rr_v2_period_bounds (
  from_date date not null,
  to_date date not null
) on commit drop;

insert into rr_v2_period_bounds(from_date, to_date)
select booking.source_created_at::date, booking.source_created_at::date
from public.customer_window_mcp_eap_representations_v2 representation
join public.customer_source_bookings_mcp_eap booking
  on booking.source = representation.source
 and booking.source_row_id = representation.source_row_id
group by booking.source_created_at::date
having count(*) filter (where representation.representation_type = 'confirmed_customer') > 0
  and count(*) filter (where representation.representation_type = 'related_review') > 0
order by booking.source_created_at::date desc
limit 1;

do $bounds_check$
begin
  if not exists (
    select 1 from pg_temp.rr_v2_period_bounds
    where from_date is not null and to_date is not null and from_date <= to_date
  ) then
    raise exception 'Customer Window v2 runtime period bounds are empty';
  end if;
end;
$bounds_check$;

create temporary table rr_v2_period_rpc_results (
  list_result jsonb not null,
  facet_result jsonb not null
) on commit drop;

insert into rr_v2_period_rpc_results(list_result, facet_result)
select
  public.customer_window_v2_list_representations_by_purchase_period(
    bounds.from_date, bounds.to_date, 1, 25
  ),
  public.customer_window_v2_get_purchase_period_facets(bounds.from_date, bounds.to_date)
from pg_temp.rr_v2_period_bounds bounds;

create temporary table rr_v2_period_direct_parity
on commit drop
as
with period_representations as materialized (
  select
    representation.representation_key,
    representation.representation_type,
    count(*)::bigint as bookings_in_period
  from pg_temp.rr_v2_period_bounds bounds
  cross join public.customer_source_bookings_mcp_eap booking
  join public.customer_window_mcp_eap_representations_v2 representation
    on representation.source = booking.source
   and representation.source_row_id = booking.source_row_id
  where booking.source = 'MCP_EAP'
    and booking.booking_status in (1, 8)
    and booking.source_created_at >= bounds.from_date::timestamp without time zone
    and booking.source_created_at < (bounds.to_date + 1)::timestamp without time zone
  group by representation.representation_key, representation.representation_type
),
direct as (
  select
    count(*)::bigint as total_representations,
    count(*) filter (where representation_type = 'confirmed_customer')::bigint
      as confirmed_representations,
    count(*) filter (where representation_type = 'related_review')::bigint
      as related_representations,
    sum(bookings_in_period)::bigint as total_bookings,
    sum(bookings_in_period) filter (where representation_type = 'confirmed_customer')::bigint
      as confirmed_bookings,
    sum(bookings_in_period) filter (where representation_type = 'related_review')::bigint
      as related_bookings
  from period_representations
),
rpc as (
  select list_result, facet_result
  from pg_temp.rr_v2_period_rpc_results
)
select
  direct.*,
  pg_catalog.jsonb_array_length(rpc.list_result -> 'items')::integer as listed_page_rows,
  (rpc.list_result ->> 'total')::bigint as listed_total,
  (
    (rpc.list_result ->> 'total')::bigint = direct.total_representations
    and pg_catalog.jsonb_array_length(rpc.list_result -> 'items') between 1 and 25
    and (rpc.facet_result ->> 'totalRepresentations')::bigint = direct.total_representations
    and (rpc.facet_result ->> 'confirmedRepresentations')::bigint = direct.confirmed_representations
    and (rpc.facet_result ->> 'relatedReviewRepresentations')::bigint = direct.related_representations
    and (rpc.facet_result ->> 'totalBookingsInPeriod')::bigint = direct.total_bookings
    and (rpc.facet_result ->> 'confirmedBookingsInPeriod')::bigint = direct.confirmed_bookings
    and (rpc.facet_result ->> 'relatedReviewBookingsInPeriod')::bigint = direct.related_bookings
    and direct.total_representations = direct.confirmed_representations + direct.related_representations
    and direct.total_bookings = direct.confirmed_bookings + direct.related_bookings
    and direct.confirmed_representations > 0
    and direct.related_representations > 0
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(rpc.list_result -> 'items') item(value)
      where item.value ->> 'representationKey'
        <> (item.value ->> 'representationType') || ':' || (item.value ->> 'representationId')
        or (item.value ->> 'representationType') = 'confirmed_customer'
          and (
            item.value ->> 'customerId' is null
            or item.value ->> 'relatedGroupId' is not null
            or item.value ->> 'metricScope' <> 'all_confirmed_sources'
          )
        or (item.value ->> 'representationType') = 'related_review'
          and (
            item.value ->> 'customerId' is not null
            or item.value ->> 'relatedGroupId' is null
            or item.value ->> 'metricScope' <> 'mcp_eap_active_snapshot'
          )
    )
  ) as runtime_parity_ok
from direct
cross join rpc;

do $runtime_checks$
begin
  if not exists (
    select 1 from pg_temp.rr_v2_period_direct_parity
    where runtime_parity_ok is true
  ) then
    raise exception 'Customer Window v2 period runtime parity failed';
  end if;
end;
$runtime_checks$;

select * from pg_temp.rr_v2_period_direct_parity;

rollback;
