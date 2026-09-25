begin;

create or replace function public.customer_window_v2_get_representation_summary(
  p_representation_type text,
  p_representation_id text
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
  v_representation_count bigint;
  v_customer_id uuid;
  v_related_group_id text;
  v_result jsonb;
begin
  if p_representation_type is null
    or p_representation_type not in ('confirmed_customer', 'related_review') then
    raise exception 'Invalid representation type' using errcode = '22023';
  end if;
  if p_representation_id is null or pg_catalog.btrim(p_representation_id) = '' then
    raise exception 'Invalid representation ID' using errcode = '22023';
  end if;

  select authority.active_snapshot_count, authority.snapshot_id
  into v_active_snapshot_count, v_snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority;

  if v_active_snapshot_count <> 1 or v_snapshot_id is null then
    raise exception 'Customer Window v2 requires exactly one active snapshot'
      using errcode = 'P0001';
  end if;

  select
    count(*)::bigint,
    (pg_catalog.array_agg(distinct representation.customer_id)
      filter (where representation.customer_id is not null))[1],
    (pg_catalog.array_agg(distinct representation.related_group_id)
      filter (where representation.related_group_id is not null))[1]
  into v_representation_count, v_customer_id, v_related_group_id
  from public.customer_window_mcp_eap_representations_v2 representation
  where representation.snapshot_id = v_snapshot_id
    and representation.representation_type = p_representation_type
    and representation.representation_id = p_representation_id;

  if v_representation_count = 0 then
    raise exception 'Representation is not part of the active snapshot'
      using errcode = 'P0001';
  end if;

  if p_representation_type = 'confirmed_customer' then
    if v_customer_id is null or v_related_group_id is not null
      or v_customer_id::text <> p_representation_id then
      raise exception 'Confirmed representation contract is invalid'
        using errcode = 'P0001';
    end if;

    select pg_catalog.jsonb_build_object(
      'representationType', 'confirmed_customer',
      'representationId', p_representation_id,
      'representationKey', 'confirmed_customer:' || p_representation_id,
      'identityStatus', 'confirmed',
      'customerId', v_customer_id,
      'relatedGroupId', null,
      'totalReservations', metrics.total_reservations,
      'firstPurchaseAt', metrics.first_purchase_at,
      'lastPurchaseAt', metrics.last_purchase_at,
      'metricScope', 'all_confirmed_sources',
      'contactability', 'direct',
      'group', null
    )
    into v_result
    from public.customer_profile_metrics metrics
    where metrics.customer_id = v_customer_id;
  else
    if v_customer_id is not null or v_related_group_id is null
      or v_related_group_id <> p_representation_id then
      raise exception 'Related-review representation contract is invalid'
        using errcode = 'P0001';
    end if;

    select pg_catalog.jsonb_build_object(
      'representationType', 'related_review',
      'representationId', p_representation_id,
      'representationKey', 'related_review:' || p_representation_id,
      'identityStatus', 'related_review',
      'customerId', null,
      'relatedGroupId', related_group.group_id,
      'totalReservations', metrics.total_reservations,
      'firstPurchaseAt', metrics.first_purchase_at,
      'lastPurchaseAt', metrics.last_purchase_at,
      'metricScope', 'mcp_eap_active_snapshot',
      'contactability', 'review_required',
      'group', pg_catalog.jsonb_build_object(
        'bookingCount', related_group.booking_count,
        'profileCount', related_group.profile_count,
        'emailCount', related_group.email_count,
        'phoneCount', related_group.phone_count,
        'sourceCustomerCount', related_group.source_customer_count,
        'conflictCount', related_group.conflict_count,
        'candidateCount', related_group.candidate_count,
        'v1BookingCount', related_group.v1_booking_count,
        'v2BookingCount', related_group.v2_booking_count,
        'hasExactEmailPhoneCorroboration', related_group.has_exact_email_phone_corroboration,
        'hasSourceCustomerEmailCorroboration', related_group.has_source_customer_email_corroboration
      )
    )
    into v_result
    from public.customer_related_review_groups related_group
    join public.customer_related_review_metrics metrics
      on metrics.snapshot_id = related_group.snapshot_id
     and metrics.group_id = related_group.group_id
     and metrics.total_reservations = related_group.booking_count
    where related_group.snapshot_id = v_snapshot_id
      and related_group.group_id = v_related_group_id
      and related_group.v1_booking_count + related_group.v2_booking_count
        = related_group.booking_count;
  end if;

  if v_result is null then
    raise exception 'Representation summary metrics are incomplete'
      using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

create or replace function public.customer_window_v2_list_representation_bookings(
  p_representation_type text,
  p_representation_id text,
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
  v_representation_count bigint;
  v_expected_related_total bigint;
  v_total bigint;
  v_result jsonb;
begin
  if p_representation_type is null
    or p_representation_type not in ('confirmed_customer', 'related_review') then
    raise exception 'Invalid representation type' using errcode = '22023';
  end if;
  if p_representation_id is null or pg_catalog.btrim(p_representation_id) = '' then
    raise exception 'Invalid representation ID' using errcode = '22023';
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

  select count(*)::bigint
  into v_representation_count
  from public.customer_window_mcp_eap_representations_v2 representation
  where representation.snapshot_id = v_snapshot_id
    and representation.representation_type = p_representation_type
    and representation.representation_id = p_representation_id
    and (
      (p_representation_type = 'confirmed_customer'
        and representation.customer_id::text = p_representation_id
        and representation.related_group_id is null)
      or (p_representation_type = 'related_review'
        and representation.customer_id is null
        and representation.related_group_id = p_representation_id)
    );

  if v_representation_count = 0 then
    raise exception 'Representation is not part of the active snapshot'
      using errcode = 'P0001';
  end if;

  if p_representation_type = 'related_review' then
    select metrics.total_reservations
    into v_expected_related_total
    from public.customer_related_review_groups related_group
    join public.customer_related_review_metrics metrics
      on metrics.snapshot_id = related_group.snapshot_id
     and metrics.group_id = related_group.group_id
     and metrics.total_reservations = related_group.booking_count
    where related_group.snapshot_id = v_snapshot_id
      and related_group.group_id = p_representation_id
      and related_group.v1_booking_count + related_group.v2_booking_count
        = related_group.booking_count;

    if v_expected_related_total is null then
      raise exception 'Related-review booking metrics are incomplete'
        using errcode = 'P0001';
    end if;
  end if;

  with scoped as materialized (
    select
      representation.source,
      representation.source_row_id,
      representation.booking_link_id,
      booking.source_created_at,
      booking.planned_arrival_at,
      booking.planned_departure_at,
      booking.booking_status,
      booking.website_source,
      booking.brand_normalized,
      booking.parking_normalized,
      booking.booking_paid,
      booking.duration_days,
      booking.is_pack,
      booking.promotion_code
    from public.customer_window_mcp_eap_representations_v2 representation
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = representation.source
     and booking.source_row_id = representation.source_row_id
    where representation.snapshot_id = v_snapshot_id
      and representation.representation_type = p_representation_type
      and representation.representation_id = p_representation_id
      and booking.source = 'MCP_EAP'
      and booking.booking_status in (1, 8)
  ),
  paged as (
    select scoped.*
    from scoped
    order by scoped.source_created_at desc, scoped.source_row_id desc
    limit p_page_size
    offset (p_page::bigint - 1) * p_page_size
  )
  select
    pg_catalog.jsonb_build_object(
      'items', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'source', paged.source,
            'sourceRowId', paged.source_row_id,
            'bookingLinkId', paged.booking_link_id,
            'sourceCreatedAt', paged.source_created_at,
            'plannedArrivalAt', paged.planned_arrival_at,
            'plannedDepartureAt', paged.planned_departure_at,
            'bookingStatus', paged.booking_status,
            'websiteSource', paged.website_source,
            'brand', paged.brand_normalized,
            'parking', paged.parking_normalized,
            'paidAmount', paged.booking_paid,
            'durationDays', paged.duration_days,
            'isPack', paged.is_pack,
            'promotionCode', paged.promotion_code
          ) order by paged.source_created_at desc, paged.source_row_id desc
        )
        from paged
      ), '[]'::jsonb),
      'total', (select count(*)::bigint from scoped),
      'page', p_page,
      'pageSize', p_page_size
    ),
    (select count(*)::bigint from scoped)
  into v_result, v_total;

  if v_total = 0 then
    raise exception 'Representation has no valid active-snapshot bookings'
      using errcode = 'P0001';
  end if;
  if v_total <> v_representation_count then
    raise exception 'Representation booking assignments are incomplete'
      using errcode = 'P0001';
  end if;
  if p_representation_type = 'related_review'
    and v_total <> v_expected_related_total then
    raise exception 'Related-review booking total does not match active-snapshot metrics'
      using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

revoke all on function public.customer_window_v2_get_representation_summary(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_v2_list_representation_bookings(
  text, text, integer, integer
) from public, anon, authenticated, service_role;

grant execute on function public.customer_window_v2_get_representation_summary(text, text)
  to service_role;
grant execute on function public.customer_window_v2_list_representation_bookings(
  text, text, integer, integer
) to service_role;

comment on function public.customer_window_v2_get_representation_summary(text, text) is
  'Returns a fail-closed, non-PII summary for one confirmed-customer or related-review representation in the single active MCP/EAP snapshot.';
comment on function public.customer_window_v2_list_representation_bookings(
  text, text, integer, integer
) is 'Lists non-PII MCP/EAP booking facts for one active-snapshot analytical representation without promoting related-review groups to customers.';


-- Catalog contract
do $$
declare
  v_name text;
  v_oid oid;
  v_proc pg_catalog.pg_proc%rowtype;
  v_public_execute boolean;
begin
  foreach v_name in array array[
    'public.customer_window_v2_get_representation_summary(text,text)',
    'public.customer_window_v2_list_representation_bookings(text,text,integer,integer)'
  ] loop
    v_oid := pg_catalog.to_regprocedure(v_name);
    if v_oid is null then
      raise exception 'Missing Customer Window v2 representation RPC: %', v_name;
    end if;

    select procedure.* into v_proc
    from pg_catalog.pg_proc procedure
    where procedure.oid = v_oid;

    select exists (
      select 1
      from pg_catalog.aclexplode(coalesce(
        v_proc.proacl,
        pg_catalog.acldefault('f', v_proc.proowner)
      )) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) into v_public_execute;

    if v_proc.prorettype <> 'jsonb'::pg_catalog.regtype
      or v_proc.prolang <> (select language.oid from pg_catalog.pg_language language where language.lanname = 'plpgsql')
      or v_proc.provolatile <> 's'
      or v_proc.prosecdef is not true
      or v_proc.proconfig is null
      or not exists (
        select 1 from pg_catalog.unnest(v_proc.proconfig) setting
        where setting in ('search_path=', 'search_path=""')
      )
      or exists (
        select 1 from pg_catalog.unnest(v_proc.proconfig) setting
        where setting like 'search_path=%'
          and setting not in ('search_path=', 'search_path=""')
      )
      or v_public_execute
      or pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
      or not pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE')
      or (v_name like '%get_representation_summary%' and v_proc.pronargdefaults <> 0)
      or (v_name like '%list_representation_bookings%' and v_proc.pronargdefaults <> 2) then
      raise exception 'Customer Window v2 representation RPC catalog contract failed: %', v_name;
    end if;
  end loop;
end;
$$;

select
  pg_catalog.to_regprocedure(
    'public.customer_window_v2_get_representation_summary(text,text)'
  ) is not null as summary_rpc_exists,
  pg_catalog.to_regprocedure(
    'public.customer_window_v2_list_representation_bookings(text,text,integer,integer)'
  ) is not null as bookings_rpc_exists;

-- Runtime parity against one dynamic confirmed and one dynamic related representation.
do $$
declare
  v_confirmed_id text;
  v_related_id text;
  v_confirmed_summary jsonb;
  v_related_summary jsonb;
  v_confirmed_bookings jsonb;
  v_related_bookings jsonb;
  v_confirmed_total bigint;
  v_related_total bigint;
  v_confirmed_metrics_total bigint;
  v_related_metrics_total bigint;
  v_confirmed_latest_source_row bigint;
  v_related_latest_source_row bigint;
  v_wrong_type_rejected boolean := false;
begin
  select representation.representation_id
  into v_confirmed_id
  from public.customer_window_mcp_eap_representations_v2 representation
  join public.customer_profile_metrics metrics
    on metrics.customer_id = representation.customer_id
  where representation.representation_type = 'confirmed_customer'
  group by representation.representation_id
  order by count(*), representation.representation_id
  limit 1;

  select representation.representation_id
  into v_related_id
  from public.customer_window_mcp_eap_representations_v2 representation
  join public.customer_related_review_groups related_group
    on related_group.snapshot_id = representation.snapshot_id
   and related_group.group_id = representation.related_group_id
  join public.customer_related_review_metrics metrics
    on metrics.snapshot_id = related_group.snapshot_id
   and metrics.group_id = related_group.group_id
  where representation.representation_type = 'related_review'
    and metrics.total_reservations = related_group.booking_count
  group by representation.representation_id
  order by count(*), representation.representation_id
  limit 1;

  if v_confirmed_id is null or v_related_id is null then
    raise exception 'Dynamic confirmed and related samples are required';
  end if;

  v_confirmed_summary := public.customer_window_v2_get_representation_summary(
    'confirmed_customer', v_confirmed_id
  );
  v_related_summary := public.customer_window_v2_get_representation_summary(
    'related_review', v_related_id
  );
  v_confirmed_bookings := public.customer_window_v2_list_representation_bookings(
    'confirmed_customer', v_confirmed_id, 1, 100
  );
  v_related_bookings := public.customer_window_v2_list_representation_bookings(
    'related_review', v_related_id, 1, 100
  );

  select count(*)::bigint,
    (pg_catalog.array_agg(representation.source_row_id order by booking.source_created_at desc, representation.source_row_id desc))[1]
  into v_confirmed_total, v_confirmed_latest_source_row
  from public.customer_window_mcp_eap_representations_v2 representation
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = representation.source
   and booking.source_row_id = representation.source_row_id
  where representation.representation_type = 'confirmed_customer'
    and representation.representation_id = v_confirmed_id;

  select metrics.total_reservations
  into v_confirmed_metrics_total
  from public.customer_profile_metrics metrics
  where metrics.customer_id = v_confirmed_id::uuid;

  select count(*)::bigint,
    (pg_catalog.array_agg(representation.source_row_id order by booking.source_created_at desc, representation.source_row_id desc))[1]
  into v_related_total, v_related_latest_source_row
  from public.customer_window_mcp_eap_representations_v2 representation
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = representation.source
   and booking.source_row_id = representation.source_row_id
  where representation.representation_type = 'related_review'
    and representation.representation_id = v_related_id;

  select metrics.total_reservations
  into v_related_metrics_total
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority
  join public.customer_related_review_metrics metrics
    on metrics.snapshot_id = authority.snapshot_id
  where authority.active_snapshot_count = 1
    and metrics.group_id = v_related_id;

  if v_confirmed_summary ->> 'representationType' <> 'confirmed_customer'
    or v_confirmed_summary ->> 'identityStatus' <> 'confirmed'
    or v_confirmed_summary ->> 'contactability' <> 'direct'
    or v_confirmed_summary ->> 'metricScope' <> 'all_confirmed_sources'
    or (v_confirmed_summary ->> 'totalReservations')::bigint <> v_confirmed_metrics_total
    or v_related_summary ->> 'representationType' <> 'related_review'
    or v_related_summary ->> 'identityStatus' <> 'related_review'
    or v_related_summary ->> 'contactability' <> 'review_required'
    or v_related_summary ->> 'metricScope' <> 'mcp_eap_active_snapshot'
    or (v_related_summary ->> 'totalReservations')::bigint <> v_related_metrics_total
    or (v_confirmed_bookings ->> 'total')::bigint <> v_confirmed_total
    or (v_related_bookings ->> 'total')::bigint <> v_related_total
    or v_related_total <> v_related_metrics_total
    or (v_confirmed_bookings -> 'items' -> 0 ->> 'sourceRowId')::bigint <> v_confirmed_latest_source_row
    or (v_related_bookings -> 'items' -> 0 ->> 'sourceRowId')::bigint <> v_related_latest_source_row then
    raise exception 'Customer Window v2 representation runtime parity failed';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_confirmed_bookings -> 'items') item
    where item ?| array['email', 'phone', 'plate', 'sourceCustomerId', 'sourceBookingCode']
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_related_bookings -> 'items') item
    where item ?| array['email', 'phone', 'plate', 'sourceCustomerId', 'sourceBookingCode']
  ) then
    raise exception 'Customer Window v2 booking payload exposed forbidden identity fields';
  end if;

  begin
    perform public.customer_window_v2_get_representation_summary('related_review', v_confirmed_id);
  exception when sqlstate 'P0001' then
    v_wrong_type_rejected := true;
  end;
  if not v_wrong_type_rejected then
    raise exception 'Cross-type representation lookup was not rejected';
  end if;
end;
$$;

select true as catalog_contract_ok, true as runtime_parity_ok;

rollback;

select
  pg_catalog.to_regprocedure(
    'public.customer_window_v2_get_representation_summary(text,text)'
  ) is null as summary_rpc_absent,
  pg_catalog.to_regprocedure(
    'public.customer_window_v2_list_representation_bookings(text,text,integer,integer)'
  ) is null as bookings_rpc_absent;
