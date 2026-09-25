begin;

create or replace function public.customer_window_v2_search_representations_mcp_eap(
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
as $$
declare
  v_active_snapshot_count integer;
  v_snapshot_id uuid;
  v_missing_metrics bigint;
  v_result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'Invalid search limit' using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(p_email), '') is null
    and nullif(pg_catalog.btrim(p_phone), '') is null
    and nullif(pg_catalog.btrim(p_exact_identifier), '') is null
    and p_numeric_identifier is null
    and nullif(pg_catalog.btrim(p_plate), '') is null then
    raise exception 'At least one search term is required' using errcode = '22023';
  end if;

  select authority.active_snapshot_count, authority.snapshot_id
  into v_active_snapshot_count, v_snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority;

  if v_active_snapshot_count <> 1 or v_snapshot_id is null then
    raise exception 'Customer Window v2 requires exactly one active snapshot'
      using errcode = 'P0001';
  end if;

  with source_matches as materialized (
    select representation.*, 'exact_email'::text as match_type,
      'email'::text as match_value_type,
      case representation.representation_type when 'confirmed_customer' then 'direct' else 'observed_in_group' end::text as match_semantics,
      1::integer as match_rank
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = booking.source
     and representation.source_row_id = booking.source_row_id
    where p_email is not null and booking.email_normalized = p_email
    union all
    select representation.*, 'exact_phone', 'phone',
      case representation.representation_type when 'confirmed_customer' then 'direct' else 'observed_in_group' end,
      1
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = booking.source
     and representation.source_row_id = booking.source_row_id
    where p_phone is not null and booking.phone_normalized = p_phone
    union all
    select representation.*, 'exact_booking', 'booking_code', 'booking', 2
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = booking.source
     and representation.source_row_id = booking.source_row_id
    where p_exact_identifier is not null and booking.source_booking_code = p_exact_identifier
    union all
    select representation.*, 'exact_source_row', 'source_row_id', 'booking', 2
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = booking.source
     and representation.source_row_id = booking.source_row_id
    where p_numeric_identifier is not null and booking.source_row_id = p_numeric_identifier
    union all
    select representation.*, 'exact_source_customer', 'source_customer_id', 'source_customer', 2
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = booking.source
     and representation.source_row_id = booking.source_row_id
    where p_numeric_identifier is not null and booking.source_customer_id = p_numeric_identifier
    union all
    select representation.*, 'exact_plate', 'plate',
      case representation.representation_type when 'confirmed_customer' then 'direct' else 'observed_in_group' end,
      1
    from public.customer_source_bookings_mcp_eap booking
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = booking.source
     and representation.source_row_id = booking.source_row_id
    where p_plate is not null and booking.plate_normalized = p_plate
  ), identity_matches as materialized (
    select distinct
      representation.*,
      case identity.identity_type when 'email' then 'exact_email' when 'phone' then 'exact_phone'
        when 'plate' then 'exact_plate' else 'exact_source_customer' end::text as match_type,
      identity.identity_type::text as match_value_type,
      case identity.identity_type when 'source_customer_id' then 'source_customer' else 'direct' end::text as match_semantics,
      case identity.identity_type when 'source_customer_id' then 2 else 1 end::integer as match_rank
    from public.customer_identity_links identity
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.representation_type = 'confirmed_customer'
     and representation.customer_id = identity.profile_id
    where identity.status = 'active'
      and identity.source = 'MCP_EAP'
      and ((identity.identity_type = 'email' and p_email is not null and identity.identity_value_normalized = p_email)
        or (identity.identity_type = 'phone' and p_phone is not null and identity.identity_value_normalized = p_phone)
        or (identity.identity_type = 'plate' and p_plate is not null and identity.identity_value_normalized = p_plate)
        or (identity.identity_type = 'source_customer_id' and p_numeric_identifier is not null
          and identity.identity_value_normalized = p_numeric_identifier::text))
  ), historical_email_matches as materialized (
    select distinct representation.*, 'historical_email'::text as match_type,
      'email'::text as match_value_type, 'historically_related'::text as match_semantics,
      3::integer as match_rank
    from public.customer_source_bookings_mcp_eap historical
    join public.customer_source_bookings_mcp_eap observed
      on p_email is not null
     and historical.email_normalized = p_email
     and historical.phone_normalized is not null
     and observed.phone_normalized = historical.phone_normalized
     and observed.source = 'MCP_EAP'
     and observed.booking_status in (1, 8)
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = observed.source
     and representation.source_row_id = observed.source_row_id
     and representation.representation_type = 'related_review'
    where historical.source = 'MCP_EAP'
      and historical.booking_status in (1, 8)
      and exists (
        select 1
        from public.customer_related_review_members member
        join public.customer_identity_resolution_events event
          on event.source = member.source
         and event.source_row_id = member.source_row_id
         and event.source = 'MCP_EAP'
         and event.event_type in ('candidate', 'conflict')
        where member.snapshot_id = v_snapshot_id
          and member.group_id = representation.related_group_id
          and event.reason_code = 'contradictory_phone_email'
          and pg_catalog.jsonb_typeof(event.evidence -> 'contradictorySignals') = 'boolean'
          and (event.evidence ->> 'contradictorySignals')::boolean
          and pg_catalog.jsonb_typeof(event.evidence -> 'emailsForPhone') = 'number'
          and (event.evidence ->> 'emailsForPhone')::integer > 1
      )
  ), historical_phone_matches as materialized (
    select distinct representation.*, 'historical_phone'::text as match_type,
      'phone'::text as match_value_type, 'historically_related'::text as match_semantics,
      3::integer as match_rank
    from public.customer_source_bookings_mcp_eap historical
    join public.customer_source_bookings_mcp_eap observed
      on p_phone is not null
     and historical.phone_normalized = p_phone
     and historical.email_normalized is not null
     and observed.email_normalized = historical.email_normalized
     and observed.source = 'MCP_EAP'
     and observed.booking_status in (1, 8)
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = v_snapshot_id
     and representation.source = observed.source
     and representation.source_row_id = observed.source_row_id
     and representation.representation_type = 'related_review'
    where historical.source = 'MCP_EAP'
      and historical.booking_status in (1, 8)
      and exists (
        select 1
        from public.customer_related_review_members member
        join public.customer_identity_resolution_events event
          on event.source = member.source
         and event.source_row_id = member.source_row_id
         and event.source = 'MCP_EAP'
         and event.event_type in ('candidate', 'conflict')
        where member.snapshot_id = v_snapshot_id
          and member.group_id = representation.related_group_id
          and event.reason_code = 'contradictory_phone_email'
          and pg_catalog.jsonb_typeof(event.evidence -> 'contradictorySignals') = 'boolean'
          and (event.evidence ->> 'contradictorySignals')::boolean
          and pg_catalog.jsonb_typeof(event.evidence -> 'phonesForEmail') = 'number'
          and (event.evidence ->> 'phonesForEmail')::integer > 1
      )
  ), all_matches as materialized (
    select * from source_matches
    union all select * from identity_matches
    union all select * from historical_email_matches
    union all select * from historical_phone_matches
  ), ranked_matches as materialized (
    select matched.*,
      row_number() over (partition by matched.representation_key
        order by matched.match_rank, matched.match_type) as match_order
    from all_matches matched
  ), selected as materialized (
    select ranked.*
    from ranked_matches ranked
    where ranked.match_order = 1
    order by ranked.match_rank, ranked.representation_key
    limit p_limit
  ), enriched as materialized (
    select selected.*,
      case selected.representation_type when 'confirmed_customer' then profile_metrics.total_reservations
        else related_metrics.total_reservations end as total_reservations,
      case selected.representation_type when 'confirmed_customer' then profile_metrics.first_purchase_at
        else related_metrics.first_purchase_at end as first_purchase_at,
      case selected.representation_type when 'confirmed_customer' then profile_metrics.last_purchase_at
        else related_metrics.last_purchase_at end as last_purchase_at,
      case selected.representation_type when 'confirmed_customer' then 'all_confirmed_sources'::text
        else 'mcp_eap_active_snapshot'::text end as metric_scope
    from selected
    left join public.customer_profile_metrics profile_metrics
      on selected.representation_type = 'confirmed_customer'
     and profile_metrics.customer_id = selected.customer_id
    left join public.customer_related_review_metrics related_metrics
      on selected.representation_type = 'related_review'
     and related_metrics.snapshot_id = selected.snapshot_id
     and related_metrics.group_id = selected.related_group_id
  ), contacts as materialized (
    select enriched.representation_key,
      count(distinct booking.email_normalized) filter (where booking.email_normalized is not null)::bigint as email_count,
      count(distinct booking.phone_normalized) filter (where booking.phone_normalized is not null)::bigint as phone_count,
      (pg_catalog.array_agg(nullif(pg_catalog.btrim(booking.email_raw), '')
        order by booking.source_created_at desc, booking.source_row_id desc)
        filter (where nullif(pg_catalog.btrim(booking.email_raw), '') is not null))[1] as display_email,
      (pg_catalog.array_agg(nullif(pg_catalog.btrim(booking.phone_raw), '')
        order by booking.source_created_at desc, booking.source_row_id desc)
        filter (where nullif(pg_catalog.btrim(booking.phone_raw), '') is not null))[1] as display_phone
    from enriched
    join public.customer_window_mcp_eap_representations_v2 representation
      on representation.snapshot_id = enriched.snapshot_id
     and representation.representation_key = enriched.representation_key
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = representation.source
     and booking.source_row_id = representation.source_row_id
    group by enriched.representation_key
  )
  select pg_catalog.jsonb_build_object(
    'items', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'representationType', enriched.representation_type,
      'representationId', enriched.representation_id,
      'representationKey', enriched.representation_key,
      'customerId', enriched.customer_id,
      'relatedGroupId', enriched.related_group_id,
      'matchType', enriched.match_type,
      'matchValueType', enriched.match_value_type,
      'matchSemantics', enriched.match_semantics,
      'totalReservations', enriched.total_reservations,
      'firstPurchaseAt', enriched.first_purchase_at,
      'lastPurchaseAt', enriched.last_purchase_at,
      'displayEmail', contacts.display_email,
      'displayPhone', contacts.display_phone,
      'metricScope', enriched.metric_scope,
      'contactSummary', pg_catalog.jsonb_build_object(
        'semantics', case enriched.representation_type when 'confirmed_customer' then 'direct' else 'observed' end,
        'emailCount', coalesce(contacts.email_count, 0),
        'phoneCount', coalesce(contacts.phone_count, 0),
        'singleEmail', case when contacts.email_count = 1 then contacts.display_email end,
        'singlePhone', case when contacts.phone_count = 1 then contacts.display_phone end
      ),
      'reservationsInPeriod', 0,
      'lastBookingAtInPeriod', null
    ) order by enriched.match_rank, enriched.last_purchase_at desc, enriched.representation_key), '[]'::jsonb),
    'total', (select count(distinct match_item.representation_key)::bigint from all_matches match_item),
    'limit', p_limit
  ), count(*) filter (where enriched.total_reservations is null
      or enriched.first_purchase_at is null or enriched.last_purchase_at is null)::bigint
  into v_result, v_missing_metrics
  from enriched
  left join contacts using (representation_key);

  if v_missing_metrics <> 0 then
    raise exception 'Customer Window v2 search metrics are incomplete' using errcode = 'P0001';
  end if;
  return v_result;
end;
$$;

revoke all on function public.customer_window_v2_search_representations_mcp_eap(
  text, text, text, bigint, text, integer
) from public, anon, authenticated;
grant execute on function public.customer_window_v2_search_representations_mcp_eap(
  text, text, text, bigint, text, integer
) to service_role;

comment on function public.customer_window_v2_search_representations_mcp_eap(
  text, text, text, bigint, text, integer
) is 'Exact read-only MCP/EAP representation search over the active snapshot. Historical related matches are evidence-gated one-hop associations and never confirmed identities.';

do $$
declare
  v_oid oid;
begin
  v_oid := pg_catalog.to_regprocedure(
    'public.customer_window_v2_search_representations_mcp_eap(text,text,text,bigint,text,integer)');
  if v_oid is null then raise exception 'search RPC missing'; end if;
  if not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_language language on language.oid = procedure.prolang
    where procedure.oid = v_oid
      and procedure.prorettype = 'jsonb'::regtype
      and language.lanname = 'plpgsql'
      and procedure.provolatile = 's'
      and procedure.prosecdef
      and procedure.proconfig is not null
      and exists (
        select 1 from pg_catalog.unnest(procedure.proconfig) setting(value)
        where setting.value in ('search_path=', 'search_path=""')
      )
  ) then raise exception 'search RPC catalog contract failed'; end if;
  if pg_catalog.has_function_privilege('anon', v_oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_oid, 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'search RPC ACL contract failed';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.aclexplode(coalesce(
      procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) acl
    where procedure.oid = v_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then raise exception 'search RPC PUBLIC execute is not revoked'; end if;
end;
$$;

create temp table search_cases on commit drop as
with authority as (
  select snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2
  where active_snapshot_count = 1 and snapshot_id is not null
), representations as materialized (
  select representation.*
  from authority
  join public.customer_window_mcp_eap_representations_v2 representation using (snapshot_id)
), confirmed_email as (
  select representation.representation_key, identity.identity_value_normalized as value
  from representations representation
  join public.customer_identity_links identity
    on representation.representation_type = 'confirmed_customer'
   and identity.profile_id = representation.customer_id
   and identity.source = 'MCP_EAP'
   and identity.status = 'active'
   and identity.identity_type = 'email'
  order by representation.representation_key limit 1
), confirmed_phone as (
  select representation.representation_key, identity.identity_value_normalized as value
  from representations representation
  join public.customer_identity_links identity
    on representation.representation_type = 'confirmed_customer'
   and identity.profile_id = representation.customer_id
   and identity.source = 'MCP_EAP'
   and identity.status = 'active'
   and identity.identity_type = 'phone'
  order by representation.representation_key limit 1
), related_observed as materialized (
  select representation.representation_key, booking.*
  from representations representation
  join public.customer_source_bookings_mcp_eap booking
    on representation.representation_type = 'related_review'
   and booking.source = representation.source
   and booking.source_row_id = representation.source_row_id
), related_email as (
  select representation_key, email_normalized as value
  from related_observed where email_normalized is not null
  order by representation_key limit 1
), related_phone as (
  select representation_key, phone_normalized as value
  from related_observed where phone_normalized is not null
  order by representation_key limit 1
), booking_case as (
  select representation.representation_key, booking.source_booking_code as value
  from representations representation
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = representation.source and booking.source_row_id = representation.source_row_id
  order by representation.representation_key limit 1
), source_customer_case as (
  select representation.representation_key, booking.source_customer_id::text as value
  from representations representation
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = representation.source and booking.source_row_id = representation.source_row_id
  order by representation.representation_key limit 1
), source_row_case as (
  select representation.representation_key, booking.source_row_id::text as value
  from representations representation
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = representation.source and booking.source_row_id = representation.source_row_id
  order by representation.representation_key limit 1
), plate_case as (
  select representation.representation_key, booking.plate_normalized as value
  from representations representation
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = representation.source and booking.source_row_id = representation.source_row_id
  where booking.plate_normalized is not null
  order by representation.representation_key limit 1
), large_group_case as (
  select representation.representation_key, booking.source_booking_code as value
  from representations representation
  join public.customer_related_review_groups related_group
    on representation.representation_type = 'related_review'
   and related_group.snapshot_id = representation.snapshot_id
   and related_group.group_id = representation.related_group_id
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = representation.source and booking.source_row_id = representation.source_row_id
  order by related_group.booking_count desc, representation.representation_key limit 1
)
select * from (
  select 'confirmed_email'::text as case_name, representation_key, value from confirmed_email
  union all select 'confirmed_phone', representation_key, value from confirmed_phone
  union all select 'related_email', representation_key, value from related_email
  union all select 'related_phone', representation_key, value from related_phone
  union all select 'booking', representation_key, value from booking_case
  union all select 'source_customer', representation_key, value from source_customer_case
  union all select 'source_row', representation_key, value from source_row_case
  union all select 'plate', representation_key, value from plate_case
  union all select 'large_group', representation_key, value from large_group_case
) cases;

with evaluated as (
  select search_case.*,
    case search_case.case_name
      when 'confirmed_email' then public.customer_window_v2_search_representations_mcp_eap(
        search_case.value, null, search_case.value, null, null, 20)
      when 'confirmed_phone' then public.customer_window_v2_search_representations_mcp_eap(
        null, search_case.value, search_case.value, search_case.value::bigint, null, 20)
      when 'related_email' then public.customer_window_v2_search_representations_mcp_eap(
        search_case.value, null, search_case.value, null, null, 20)
      when 'related_phone' then public.customer_window_v2_search_representations_mcp_eap(
        null, search_case.value, search_case.value, search_case.value::bigint, null, 20)
      when 'source_customer' then public.customer_window_v2_search_representations_mcp_eap(
        null, null, search_case.value, search_case.value::bigint, null, 20)
      when 'source_row' then public.customer_window_v2_search_representations_mcp_eap(
        null, null, search_case.value, search_case.value::bigint, null, 20)
      when 'plate' then public.customer_window_v2_search_representations_mcp_eap(
        null, null, search_case.value, null, search_case.value, 20)
      else public.customer_window_v2_search_representations_mcp_eap(
        null, null, search_case.value, null, null, 20)
    end as payload
  from search_cases search_case
), case_results as (
  select evaluated.case_name, evaluated.representation_key,
    exists (
      select 1 from pg_catalog.jsonb_array_elements(evaluated.payload -> 'items') item(value)
      where item.value ->> 'representationKey' = evaluated.representation_key
    ) as expected_found,
    not exists (
      select 1 from pg_catalog.jsonb_array_elements(evaluated.payload -> 'items') item(value)
      where item.value ->> 'representationType' not in ('confirmed_customer', 'related_review')
        or item.value ->> 'representationKey'
          <> (item.value ->> 'representationType') || ':' || (item.value ->> 'representationId')
    ) as contract_ok
  from evaluated
), historical_case as (
  select history.email_normalized, parameter.group_id
  from (values ('521edad56afd5fa741a192a4b9ed507b88467aa16ba3361c52497b3e2865f3bb'::text)) parameter(group_id)
  join public.customer_window_mcp_eap_active_snapshot_authority_v2 authority
    on authority.active_snapshot_count = 1
  join public.customer_related_review_members member
    on member.snapshot_id = authority.snapshot_id and member.group_id = parameter.group_id
  join public.customer_source_bookings_mcp_eap observed
    on observed.source = member.source and observed.source_row_id = member.source_row_id
  join public.customer_source_bookings_mcp_eap history
    on history.phone_normalized = observed.phone_normalized
   and history.email_normalized is distinct from observed.email_normalized
   and history.email_normalized is not null
  order by history.source_created_at limit 1
), historical_result as (
  select historical.*,
    public.customer_window_v2_search_representations_mcp_eap(
      historical.email_normalized, null, historical.email_normalized, null, null, 20) as payload
  from historical_case historical
), empty_result as (
  select public.customer_window_v2_search_representations_mcp_eap(
    null, null, 'NO_MATCH_EXPECTED_9d89f573', null, null, 20) as payload
)
select
  count(*) filter (where case_name = 'confirmed_email') <= 1 as confirmed_email_case_bounded,
  count(*) filter (where case_name = 'confirmed_phone') <= 1 as confirmed_phone_case_bounded,
  count(*) filter (where case_name = 'related_email') <= 1 as related_email_case_bounded,
  count(*) filter (where case_name = 'related_phone') <= 1 as related_phone_case_bounded,
  bool_and(expected_found and contract_ok) as available_cases_ok,
  coalesce((select exists (
    select 1 from pg_catalog.jsonb_array_elements(historical_result.payload -> 'items') item(value)
    where item.value ->> 'representationKey' = 'related_review:' || historical_result.group_id
      and item.value ->> 'matchSemantics' = 'historically_related'
  ) from historical_result), true) as historical_one_hop_ok,
  (select pg_catalog.jsonb_array_length(payload -> 'items') = 0 from empty_result) as no_results_ok,
  not exists (
    select 1 from evaluated
    cross join lateral pg_catalog.jsonb_array_elements(evaluated.payload -> 'items') item(value)
    where item.value ->> 'representationKey' is null
  ) as no_cross_group_leakage
from case_results;

rollback;

select pg_catalog.to_regprocedure(
  'public.customer_window_v2_search_representations_mcp_eap(text,text,text,bigint,text,integer)'
) is null as search_rpc_absent_after_rollback;
