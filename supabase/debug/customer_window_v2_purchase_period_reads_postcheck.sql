-- READ-ONLY post-installation check for Customer Window v2 period RPCs.
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
),
contracts as (
  select
    expected.function_key,
    expected.signature,
    procedure.oid is not null as function_exists,
    procedure.oid = pg_catalog.to_regprocedure(expected.signature)
      and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
        = expected.identity_arguments
      and procedure.pronargs = expected.argument_count as signature_ok,
    pg_catalog.format_type(procedure.prorettype, null) = 'jsonb' as returns_jsonb,
    language.lanname = 'plpgsql' as language_plpgsql,
    procedure.prosecdef is true as security_definer,
    procedure.provolatile = 's' as stable,
    procedure.pronargdefaults = expected.default_count as defaults_ok,
    (
      procedure.proconfig is not null
      and search_path_contract.setting_count = 1
      and search_path_contract.only_setting_is_empty
    ) as empty_search_path,
    public_acl.public_execute,
    pg_catalog.has_function_privilege('service_role', procedure.oid, 'EXECUTE')
      as service_role_execute,
    not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE') as anon_revoked,
    not pg_catalog.has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
      as authenticated_revoked,
    not public_acl.public_execute as public_revoked
  from expected
  left join pg_catalog.pg_proc procedure
    on procedure.oid = pg_catalog.to_regprocedure(expected.signature)
  left join pg_catalog.pg_language language on language.oid = procedure.prolang
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
  ) public_acl on procedure.oid is not null
)
select
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(contracts) order by signature) as contracts,
  pg_catalog.bool_and(
    function_exists and signature_ok and returns_jsonb and language_plpgsql
    and security_definer and stable and defaults_ok and empty_search_path
    and service_role_execute and anon_revoked
    and authenticated_revoked and public_revoked
  ) as catalog_acl_ok
from contracts;

with bounds as (
  select
    booking.source_created_at::date as from_date,
    booking.source_created_at::date as to_date
  from public.customer_window_mcp_eap_representations_v2 representation
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = representation.source
   and booking.source_row_id = representation.source_row_id
  group by booking.source_created_at::date
  having count(*) filter (where representation.representation_type = 'confirmed_customer') > 0
    and count(*) filter (where representation.representation_type = 'related_review') > 0
  order by booking.source_created_at::date desc
  limit 1
),
period_representations as materialized (
  select
    representation.representation_key,
    representation.representation_type,
    count(*)::bigint as bookings_in_period
  from bounds
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
  select
    public.customer_window_v2_list_representations_by_purchase_period(
      bounds.from_date, bounds.to_date, 1, 25
    ) as list_result,
    public.customer_window_v2_get_purchase_period_facets(
      bounds.from_date, bounds.to_date
    ) as facet_result
  from bounds
)
select
  bounds.from_date,
  bounds.to_date,
  direct.total_representations,
  direct.confirmed_representations,
  direct.related_representations,
  direct.total_bookings,
  direct.confirmed_bookings,
  direct.related_bookings,
  (rpc.list_result ->> 'total')::bigint as rpc_list_total,
  pg_catalog.jsonb_array_length(rpc.list_result -> 'items')::integer as rpc_list_page_rows,
  (rpc.facet_result ->> 'totalRepresentations')::bigint as rpc_facet_total,
  (
    bounds.from_date is not null
    and bounds.to_date is not null
    and (rpc.list_result ->> 'total')::bigint = direct.total_representations
    and (rpc.facet_result ->> 'totalRepresentations')::bigint = direct.total_representations
    and (rpc.facet_result ->> 'confirmedRepresentations')::bigint
      = direct.confirmed_representations
    and (rpc.facet_result ->> 'relatedReviewRepresentations')::bigint
      = direct.related_representations
    and (rpc.facet_result ->> 'totalBookingsInPeriod')::bigint = direct.total_bookings
    and (rpc.facet_result ->> 'confirmedBookingsInPeriod')::bigint = direct.confirmed_bookings
    and (rpc.facet_result ->> 'relatedReviewBookingsInPeriod')::bigint = direct.related_bookings
    and direct.total_representations = direct.confirmed_representations + direct.related_representations
    and direct.total_bookings = direct.confirmed_bookings + direct.related_bookings
  ) as runtime_parity_ok
from bounds
cross join direct
cross join rpc;
