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
      'authoritySnapshotId', case enriched.representation_type
        when 'related_review' then enriched.snapshot_id else null end,
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
) is 'Exact read-only MCP/EAP representation search over the active snapshot. Related results carry their authority snapshot; confirmed results remain global. Historical related matches are evidence-gated one-hop associations and never confirmed identities.';

do $$
declare
  v_snapshot_id uuid;
  v_confirmed_key text;
  v_confirmed_source_row_id bigint;
  v_confirmed_payload jsonb;
  v_related_key text;
  v_related_source_row_id bigint;
  v_related_payload jsonb;
begin
  select authority.snapshot_id
  into v_snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority
  where authority.active_snapshot_count = 1;

  if v_snapshot_id is null then
    raise exception 'Search authority snapshot harness requires exactly one active snapshot';
  end if;

  select representation.representation_key, representation.source_row_id
  into v_confirmed_key, v_confirmed_source_row_id
  from public.customer_window_mcp_eap_representations_v2 representation
  where representation.snapshot_id = v_snapshot_id
    and representation.representation_type = 'confirmed_customer'
    and not exists (
      select 1
      from public.customer_source_bookings_mcp_eap source_customer_booking
      where source_customer_booking.source_customer_id = representation.source_row_id
    )
  order by representation.source_row_id
  limit 1;

  select representation.representation_key, representation.source_row_id
  into v_related_key, v_related_source_row_id
  from public.customer_window_mcp_eap_representations_v2 representation
  where representation.snapshot_id = v_snapshot_id
    and representation.representation_type = 'related_review'
    and not exists (
      select 1
      from public.customer_source_bookings_mcp_eap source_customer_booking
      where source_customer_booking.source_customer_id = representation.source_row_id
    )
  order by representation.source_row_id
  limit 1;

  if v_confirmed_key is null or v_related_key is null then
    raise exception 'Search authority snapshot harness requires confirmed and related fixtures';
  end if;

  v_confirmed_payload := public.customer_window_v2_search_representations_mcp_eap(
    null, null, 'NO_BOOKING_CODE_MATCH_EXPECTED', v_confirmed_source_row_id, null, 20
  );
  v_related_payload := public.customer_window_v2_search_representations_mcp_eap(
    null, null, 'NO_BOOKING_CODE_MATCH_EXPECTED', v_related_source_row_id, null, 20
  );

  if not exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_confirmed_payload -> 'items') item(value)
    where item.value ->> 'representationKey' = v_confirmed_key
      and item.value -> 'authoritySnapshotId' = 'null'::jsonb
  ) then
    raise exception 'Confirmed search authority snapshot contract failed';
  end if;

  if not exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_related_payload -> 'items') item(value)
    where item.value ->> 'representationKey' = v_related_key
      and item.value ->> 'authoritySnapshotId' = v_snapshot_id::text
  ) then
    raise exception 'Related search authority snapshot contract failed';
  end if;
end;
$$;

rollback;

select pg_catalog.to_regprocedure(
  'public.customer_window_v2_search_representations_mcp_eap(text,text,text,bigint,text,integer)'
) is not null as base_search_rpc_restored_after_rollback;
