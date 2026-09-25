\set ON_ERROR_STOP on

-- Run after installing only base migration 140000 in a disposable PostgreSQL database.
-- The incremental 150000 body and every fixture below are rolled back together.
select pg_catalog.pg_get_functiondef(
  'public.customer_window_360_v1_get_overview(jsonb)'::regprocedure
) as rr_customer360_baseline_overview_definition
\gset

begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.customer_window_360_v1_resolve_locator(jsonb)') is null
    or pg_catalog.to_regprocedure('public.customer_window_360_v1_get_overview(jsonb)') is null
    or pg_catalog.to_regprocedure('public.customer_window_360_v1_list_bookings(jsonb,integer,integer)') is null
    or pg_catalog.to_regprocedure('public.customer_window_360_v1_list_observed_contacts(jsonb,text,integer,integer)') is not null then
    raise exception 'Install only base migration 140000 in the disposable database before running this harness';
  end if;
end;
$$;

-- BEGIN EMBEDDED 150000 BODY
create or replace function public.customer_window_360_v1_get_overview(
  p_locator jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resolved jsonb;
  v_locator jsonb;
  v_representation_type text;
  v_customer_id uuid;
  v_group_id text;
  v_snapshot_id uuid;
  v_result jsonb;
begin
  v_resolved := public.customer_window_360_v1_resolve_locator(p_locator);
  v_locator := v_resolved -> 'locator';
  v_representation_type := v_locator ->> 'representationType';

  if v_representation_type = 'confirmed_customer' then
    v_customer_id := (v_resolved ->> 'customerId')::uuid;

    with contact_values as materialized (
      select distinct identity.identity_type, identity.identity_value_normalized as display_value
      from public.customer_identity_links identity
      where identity.profile_id = v_customer_id
        and identity.status = 'active'
        and identity.identity_type in ('email', 'phone')
    ),
    contacts as (
      select
        count(*) filter (where identity_type = 'email')::bigint as email_count,
        count(*) filter (where identity_type = 'phone')::bigint as phone_count,
        case when count(*) filter (where identity_type = 'email') = 1
          then max(display_value) filter (where identity_type = 'email') end as single_email,
        case when count(*) filter (where identity_type = 'phone') = 1
          then max(display_value) filter (where identity_type = 'phone') end as single_phone
      from contact_values
    ),
    coverage as (
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('source', source, 'bookingCount', booking_count)
        order by source
      ), '[]'::jsonb) as value
      from (
        select 'MCP_EAP'::text as source, (metrics.mcp_count + metrics.eap_count)::bigint as booking_count
        from public.customer_profile_metrics metrics
        where metrics.customer_id = v_customer_id
          and metrics.mcp_count + metrics.eap_count > 0
        union all
        select 'OKP'::text, metrics.okp_count::bigint
        from public.customer_profile_metrics metrics
        where metrics.customer_id = v_customer_id
          and metrics.okp_count > 0
      ) source_counts
    )
    select pg_catalog.jsonb_build_object(
      'ok', true,
      'contractVersion', 'CUSTOMER_360_V1',
      'locator', v_locator,
      'representation', pg_catalog.jsonb_build_object(
        'readOnly', false,
        'authorityStatus', 'global'
      ),
      'identity', pg_catalog.jsonb_build_object(
        'status', 'confirmed',
        'customerId', v_customer_id,
        'relatedGroupId', null,
        'contactability', 'direct',
        'contacts', pg_catalog.jsonb_build_object(
          'semantics', 'direct',
          'emailCount', contacts.email_count,
          'phoneCount', contacts.phone_count,
          'singleEmail', contacts.single_email,
          'singlePhone', contacts.single_phone
        ),
        'relatedReviewSummary', null
      ),
      'summary', pg_catalog.jsonb_build_object(
        'totalBookings', metrics.total_reservations,
        'firstBookingAt', metrics.first_purchase_at,
        'lastBookingAt', metrics.last_purchase_at
      ),
      'sourceCoverage', coverage.value,
      'moduleAvailability', pg_catalog.jsonb_build_object(
        'bookings', pg_catalog.jsonb_build_object('status', 'available'),
        'commercialEvents', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_linked_v1'),
        'communications', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'read_contract_pending'),
        'advancedMetrics', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_in_v1'),
        'attribution', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_in_v1')
      )
    ) into v_result
    from public.customer_profile_metrics metrics
    cross join contacts
    cross join coverage
    where metrics.customer_id = v_customer_id
      and metrics.total_reservations = metrics.mcp_count + metrics.eap_count + metrics.okp_count;
  else
    v_group_id := v_resolved ->> 'relatedGroupId';
    v_snapshot_id := (v_resolved ->> 'snapshotId')::uuid;

    with observations as materialized (
      select
        observed.identity_type,
        observed.normalized_value,
        observed.display_value,
        observed.source_created_at,
        observed.source_row_id
      from public.customer_analytical_booking_assignments assignment
      cross join lateral (
        select source_booking.*
        from public.customer_source_bookings_mcp_eap source_booking
        where source_booking.source = assignment.source
          and source_booking.source_row_id = assignment.source_row_id
        limit 1
      ) booking
      cross join lateral (
        values
          ('email'::text, nullif(booking.email_normalized, ''),
            coalesce(nullif(pg_catalog.btrim(booking.email_raw), ''), nullif(booking.email_normalized, '')),
            booking.source_created_at, booking.source_row_id),
          ('phone'::text, nullif(booking.phone_normalized, ''),
            coalesce(nullif(pg_catalog.btrim(booking.phone_raw), ''), nullif(booking.phone_normalized, '')),
            booking.source_created_at, booking.source_row_id)
      ) observed(identity_type, normalized_value, display_value, source_created_at, source_row_id)
      where assignment.snapshot_id = v_snapshot_id
        and assignment.representation_type = 'related_review'
        and assignment.related_group_id = v_group_id
        and observed.normalized_value is not null
    ),
    contact_values as materialized (
      select distinct on (identity_type, normalized_value)
        identity_type, normalized_value, display_value
      from observations
      order by identity_type, normalized_value, source_created_at desc, source_row_id desc
    ),
    ranked_contact_values as (
      select contact_values.*,
        row_number() over (partition by identity_type order by normalized_value) as contact_rank
      from contact_values
    ),
    contacts as (
      select
        count(*) filter (where identity_type = 'email')::bigint as email_count,
        count(*) filter (where identity_type = 'phone')::bigint as phone_count,
        case when count(*) filter (where identity_type = 'email') = 1
          then max(display_value) filter (where identity_type = 'email') end as single_email,
        case when count(*) filter (where identity_type = 'phone') = 1
          then max(display_value) filter (where identity_type = 'phone') end as single_phone,
        coalesce(pg_catalog.jsonb_agg(display_value order by normalized_value)
          filter (where identity_type = 'email' and contact_rank <= 5), '[]'::jsonb) as email_preview,
        coalesce(pg_catalog.jsonb_agg(display_value order by normalized_value)
          filter (where identity_type = 'phone' and contact_rank <= 5), '[]'::jsonb) as phone_preview
      from ranked_contact_values
    )
    select pg_catalog.jsonb_build_object(
      'ok', true,
      'contractVersion', 'CUSTOMER_360_V1',
      'locator', v_locator,
      'representation', pg_catalog.jsonb_build_object(
        'readOnly', true,
        'authorityStatus', 'active_snapshot'
      ),
      'identity', pg_catalog.jsonb_build_object(
        'status', 'related_review',
        'customerId', null,
        'relatedGroupId', related_group.group_id,
        'contactability', 'observed_only',
        'contacts', pg_catalog.jsonb_build_object(
          'semantics', 'observed',
          'emailCount', contacts.email_count,
          'phoneCount', contacts.phone_count,
          'singleEmail', contacts.single_email,
          'singlePhone', contacts.single_phone,
          'emailPreview', contacts.email_preview,
          'phonePreview', contacts.phone_preview
        ),
        'relatedReviewSummary', pg_catalog.jsonb_build_object(
          'profileCount', related_group.profile_count,
          'conflictCount', related_group.conflict_count,
          'candidateCount', related_group.candidate_count,
          'v1BookingCount', related_group.v1_booking_count,
          'v2BookingCount', related_group.v2_booking_count
        )
      ),
      'summary', pg_catalog.jsonb_build_object(
        'totalBookings', metrics.total_reservations,
        'firstBookingAt', metrics.first_purchase_at,
        'lastBookingAt', metrics.last_purchase_at
      ),
      'sourceCoverage', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('source', 'MCP_EAP', 'bookingCount', metrics.total_reservations)
      ),
      'moduleAvailability', pg_catalog.jsonb_build_object(
        'bookings', pg_catalog.jsonb_build_object('status', 'available'),
        'commercialEvents', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_linked_v1'),
        'communications', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'read_contract_pending'),
        'advancedMetrics', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_in_v1'),
        'attribution', pg_catalog.jsonb_build_object('status', 'unavailable', 'reason', 'not_in_v1')
      )
    ) into v_result
    from public.customer_related_review_groups related_group
    join public.customer_related_review_metrics metrics
      on metrics.snapshot_id = related_group.snapshot_id
     and metrics.group_id = related_group.group_id
    cross join contacts
    where related_group.snapshot_id = v_snapshot_id
      and related_group.group_id = v_group_id
      and metrics.total_reservations = related_group.booking_count
      and related_group.v1_booking_count + related_group.v2_booking_count = related_group.booking_count;
  end if;

  if v_result is null then
    raise exception 'representation_contract_unavailable' using errcode = '55000';
  end if;
  return v_result;
end;
$$;

create or replace function public.customer_window_360_v1_list_observed_contacts(
  p_locator jsonb,
  p_contact_type text,
  p_page integer default 1,
  p_page_size integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resolved jsonb;
  v_locator jsonb;
  v_group_id text;
  v_snapshot_id uuid;
  v_items jsonb;
  v_total bigint;
begin
  if p_contact_type is null or p_contact_type not in ('email', 'phone')
    or p_page is null or p_page < 1
    or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid_locator_contract' using errcode = '22023';
  end if;

  v_resolved := public.customer_window_360_v1_resolve_locator(p_locator);
  v_locator := v_resolved -> 'locator';
  if v_locator ->> 'representationType' <> 'related_review' then
    raise exception 'invalid_locator_contract' using errcode = '22023';
  end if;
  v_group_id := v_resolved ->> 'relatedGroupId';
  v_snapshot_id := (v_resolved ->> 'snapshotId')::uuid;

  with observations as materialized (
    select
      nullif(case when p_contact_type = 'email' then booking.email_normalized
        else booking.phone_normalized end, '') as normalized_value,
      case when p_contact_type = 'email'
        then coalesce(nullif(pg_catalog.btrim(booking.email_raw), ''), nullif(booking.email_normalized, ''))
        else coalesce(nullif(pg_catalog.btrim(booking.phone_raw), ''), nullif(booking.phone_normalized, ''))
      end as display_value,
      booking.source_created_at,
      booking.source_row_id
    from public.customer_analytical_booking_assignments assignment
    cross join lateral (
      select source_booking.*
      from public.customer_source_bookings_mcp_eap source_booking
      where source_booking.source = assignment.source
        and source_booking.source_row_id = assignment.source_row_id
      limit 1
    ) booking
    where assignment.snapshot_id = v_snapshot_id
      and assignment.representation_type = 'related_review'
      and assignment.related_group_id = v_group_id
  ),
  contact_values as materialized (
    select distinct on (normalized_value) normalized_value, display_value
    from observations
    where normalized_value is not null
    order by normalized_value, source_created_at desc, source_row_id desc
  ),
  paged as (
    select normalized_value, display_value
    from contact_values
    order by normalized_value
    limit p_page_size
    offset (p_page::bigint - 1) * p_page_size
  )
  select
    coalesce(pg_catalog.jsonb_agg(display_value order by normalized_value), '[]'::jsonb),
    (select count(*)::bigint from contact_values)
  into v_items, v_total
  from paged;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 'CUSTOMER_360_V1',
    'locator', v_locator,
    'semantics', 'observed',
    'contactType', p_contact_type,
    'items', v_items,
    'pagination', pg_catalog.jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'total', v_total,
      'hasNextPage', p_page::bigint * p_page_size < v_total
    )
  );
end;
$$;

revoke all on function public.customer_window_360_v1_get_overview(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_360_v1_list_observed_contacts(jsonb, text, integer, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_window_360_v1_get_overview(jsonb)
  to service_role;
grant execute on function public.customer_window_360_v1_list_observed_contacts(jsonb, text, integer, integer)
  to service_role;

comment on function public.customer_window_360_v1_list_observed_contacts(jsonb, text, integer, integer) is
  'Returns distinct observed related-review contacts with snapshot-scoped pagination; confirmed-customer locators are rejected.';
-- END EMBEDDED 150000 BODY

insert into public.customer_profiles(id, status, resolver_version, needs_review) values
  ('10000000-0000-4000-8000-000000000001', 'active', 'fixture', false),
  ('10000000-0000-4000-8000-000000000002', 'active', 'fixture', true);

insert into public.customer_identity_links(
  profile_id, identity_type, identity_value_normalized, source, confidence, status
) values
  ('10000000-0000-4000-8000-000000000001', 'email', 'confirmed@example.test', 'MCP_EAP', 'HIGH', 'active'),
  ('10000000-0000-4000-8000-000000000001', 'phone', '+56911111111', 'MCP_EAP', 'HIGH', 'active');

insert into public.customer_source_bookings_mcp_eap(
  source_row_id, source_booking_code, source_customer_id,
  email_raw, email_normalized, phone_raw, phone_normalized,
  source_created_at, planned_arrival_at, planned_departure_at,
  booking_status, paying_status, website_source, brand_normalized,
  parking_normalized, booking_paid, duration_days, is_pack, row_hash
) values
  (910001, 'MCP-1', 810001, 'confirmed@example.test', 'confirmed@example.test',
    '+56911111111', '+56911111111', '2026-09-20 10:00', '2026-10-01', '2026-10-03',
    1, 1, 1, 'MCP', 'MCPARKING', 10000, 2, false, repeat('a', 64)),
  (910002, 'REL-1', 810002, 'observed@example.test', 'observed@example.test',
    '+56922222222', '+56922222222', '2026-09-21 11:00', '2026-10-02', '2026-10-04',
    1, 1, 1, 'EAP', 'ESTACIONAMIENTO AEROPUERTO', 20000, 2, false, repeat('b', 64));

insert into public.customer_source_bookings_okp(
  source_row_id, source_booking_code, email_normalized, phone_normalized,
  source_created_at, planned_arrival_at, planned_departure_at, status_raw,
  is_confirmed, is_paid, is_inactive, parking_normalized,
  source_total_amount, is_pack, row_hash
) values (
  920001, null, 'confirmed@example.test', '+56911111111', '2026-09-22 12:00',
  '2026-10-05', '2026-10-06', 'PAGADA', true, true, false,
  'OKP_EXP', 15000, false, repeat('c', 64)
);

insert into public.customer_booking_profile_links(
  id, profile_id, source, source_row_id, confidence, status, resolver_version
) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'MCP_EAP', 910001, 'HIGH', 'active', 'fixture'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'OKP', 920001, 'HIGH', 'active', 'fixture'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'MCP_EAP', 910002, 'SUPPORT', 'candidate', 'fixture');

insert into public.customer_profile_metrics(
  customer_id, first_purchase_at, last_purchase_at, total_reservations,
  reservations_12m, reservations_24m, days_since_last_purchase,
  lifecycle_status, tier, tier_rank, brand_behavior, pack_status,
  mcp_count, eap_count, okp_count, okp_express_count,
  okp_rio_clarillo_count, okp_otros_count, future_booking_count,
  parking_families, last_brand, last_parking, as_of_date
) values (
  '10000000-0000-4000-8000-000000000001', '2026-09-20 10:00', '2026-09-22 12:00', 2,
  2, 2, 3, 'FREQUENT', 'BRONZE', 2, 'ALTERNATING', 'NO_PACK',
  1, 0, 1, 1, 0, 0, 2, array['MCP', 'OKP_EXPRESS'], 'OKP', 'OKP_EXP', '2026-09-25'
);

insert into public.customer_related_review_snapshots(
  snapshot_id, rule_key, key_id, status, captured_at, built_at,
  activated_at, superseded_at, manifest_sha256, valid_source_count,
  confirmed_count, related_count, group_count, anomaly_count,
  active_profiles_without_metrics_count
) values
  ('30000000-0000-4000-8000-000000000001', 'RELATED_REVIEW_MCP_EAP_V1', 'fixture',
    'active', now(), now(), now(), null, repeat('d', 64), 2, 1, 1, 1, 0, 0),
  ('30000000-0000-4000-8000-000000000002', 'RELATED_REVIEW_MCP_EAP_V1', 'fixture',
    'superseded', now(), now(), now() - interval '1 minute', now(), repeat('e', 64), 1, 0, 1, 1, 0, 0);

insert into public.customer_related_review_groups(
  snapshot_id, group_id, key_kind, booking_count, profile_count,
  email_count, phone_count, source_customer_count, conflict_count,
  candidate_count, v1_booking_count, v2_booking_count,
  has_exact_email_phone_corroboration, has_source_customer_email_corroboration
) values
  ('30000000-0000-4000-8000-000000000001', repeat('f', 64), 'EXACT_EMAIL',
    1, 1, 1, 1, 1, 0, 1, 0, 1, true, true),
  ('30000000-0000-4000-8000-000000000002', repeat('9', 64), 'EXACT_EMAIL',
    1, 1, 1, 1, 1, 0, 1, 0, 1, true, true);

insert into public.customer_related_review_members(
  snapshot_id, source, source_row_id, group_id, booking_link_id,
  profile_id, link_status, resolver_version, relationship_type
) values (
  '30000000-0000-4000-8000-000000000001', 'MCP_EAP', 910002, repeat('f', 64),
  '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
  'candidate', 'fixture', 'EXACT_EMAIL'
);

insert into public.customer_analytical_booking_assignments(
  snapshot_id, source, source_row_id, booking_link_id,
  representation_type, customer_id, related_group_id
) values
  ('30000000-0000-4000-8000-000000000001', 'MCP_EAP', 910001,
    '20000000-0000-4000-8000-000000000001', 'confirmed_customer',
    '10000000-0000-4000-8000-000000000001', null),
  ('30000000-0000-4000-8000-000000000001', 'MCP_EAP', 910002,
    '20000000-0000-4000-8000-000000000003', 'related_review', null, repeat('f', 64));

insert into public.customer_related_review_metrics(
  snapshot_id, group_id, total_reservations, first_purchase_at, last_purchase_at
) values (
  '30000000-0000-4000-8000-000000000001', repeat('f', 64), 1,
  '2026-09-21 11:00', '2026-09-21 11:00'
);

do $$
begin
  if exists (
    (select member.source, member.source_row_id
     from public.customer_related_review_members member
     where member.snapshot_id = '30000000-0000-4000-8000-000000000001'
       and member.group_id = repeat('f', 64))
    except
    (select assignment.source, assignment.source_row_id
     from public.customer_analytical_booking_assignments assignment
     where assignment.snapshot_id = '30000000-0000-4000-8000-000000000001'
       and assignment.representation_type = 'related_review'
       and assignment.related_group_id = repeat('f', 64))
  ) or exists (
    (select assignment.source, assignment.source_row_id
     from public.customer_analytical_booking_assignments assignment
     where assignment.snapshot_id = '30000000-0000-4000-8000-000000000001'
       and assignment.representation_type = 'related_review'
       and assignment.related_group_id = repeat('f', 64))
    except
    (select member.source, member.source_row_id
     from public.customer_related_review_members member
     where member.snapshot_id = '30000000-0000-4000-8000-000000000001'
       and member.group_id = repeat('f', 64))
  ) then
    raise exception 'related members and assignments parity failed';
  end if;
end;
$$;

do $$
declare
  v_confirmed_locator jsonb := pg_catalog.jsonb_build_object(
    'representationKey', 'confirmed_customer:10000000-0000-4000-8000-000000000001',
    'representationType', 'confirmed_customer',
    'representationId', '10000000-0000-4000-8000-000000000001',
    'customerUniverse', 'GLOBAL', 'authoritySnapshotId', null
  );
  v_related_locator jsonb := pg_catalog.jsonb_build_object(
    'representationKey', 'related_review:' || repeat('f', 64),
    'representationType', 'related_review', 'representationId', repeat('f', 64),
    'customerUniverse', 'MCP_EAP',
    'authoritySnapshotId', '30000000-0000-4000-8000-000000000001'
  );
  v_overview jsonb;
  v_bookings jsonb;
  v_contacts jsonb;
begin
  v_overview := public.customer_window_360_v1_get_overview(v_confirmed_locator);
  if v_overview #>> '{summary,totalBookings}' <> '2'
    or pg_catalog.jsonb_array_length(v_overview -> 'sourceCoverage') <> 2
    or v_overview #>> '{representation,authorityStatus}' <> 'global'
    or v_overview #>> '{identity,contacts,semantics}' <> 'direct'
    or (v_overview #> '{identity,contacts}') ? 'emailPreview'
    or (v_overview #> '{identity,contacts}') ? 'phonePreview' then
    raise exception 'confirmed overview contract failed';
  end if;

  begin
    perform public.customer_window_360_v1_list_observed_contacts(v_confirmed_locator, 'email', 1, 100);
    raise exception 'confirmed locator was accepted by observed contacts';
  exception when sqlstate '22023' then
    if sqlerrm <> 'invalid_locator_contract' then raise; end if;
  end;

  v_bookings := public.customer_window_360_v1_list_bookings(v_confirmed_locator, 1, 1);
  if v_bookings #>> '{pagination,total}' <> '2'
    or v_bookings #>> '{pagination,hasNextPage}' <> 'true'
    or v_bookings #>> '{items,0,source}' <> 'OKP'
    or v_bookings #>> '{items,0,sourceRowId}' <> '920001'
    or (v_bookings #> '{items,0,bookingId}') <> 'null'::jsonb
    or (v_bookings #> '{items,0,observedEmail}') <> 'null'::jsonb then
    raise exception 'confirmed bookings contract failed';
  end if;

  v_overview := public.customer_window_360_v1_get_overview(v_related_locator);
  if v_overview #>> '{summary,totalBookings}' <> '1'
    or v_overview #>> '{representation,readOnly}' <> 'true'
    or v_overview #>> '{identity,contacts,semantics}' <> 'observed'
    or v_overview #>> '{identity,contacts,emailPreview,0}' <> 'observed@example.test'
    or v_overview #>> '{identity,contacts,phonePreview,0}' <> '+56922222222'
    or v_overview #>> '{sourceCoverage,0,source}' <> 'MCP_EAP'
    or pg_catalog.jsonb_array_length(v_overview -> 'sourceCoverage') <> 1 then
    raise exception 'related overview contract failed';
  end if;

  v_contacts := public.customer_window_360_v1_list_observed_contacts(v_related_locator, 'email', 1, 100);
  if v_contacts #>> '{semantics}' <> 'observed'
    or v_contacts #>> '{contactType}' <> 'email'
    or v_contacts #>> '{pagination,total}' <> '1'
    or v_contacts #>> '{items,0}' <> 'observed@example.test' then
    raise exception 'related observed contacts contract failed';
  end if;

  v_bookings := public.customer_window_360_v1_list_bookings(v_related_locator, 1, 25);
  if v_bookings #>> '{pagination,total}' <> '1'
    or v_bookings #>> '{items,0,source}' <> 'MCP_EAP'
    or v_bookings #>> '{items,0,observedEmail}' <> 'observed@example.test'
    or pg_catalog.jsonb_typeof(v_bookings #> '{items,0,sourceRowId}') <> 'string' then
    raise exception 'related bookings contract failed';
  end if;

  begin
    perform public.customer_window_360_v1_get_overview('{}'::jsonb);
    raise exception 'invalid locator was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'invalid_locator_contract' then raise; end if;
  end;

  begin
    perform public.customer_window_360_v1_get_overview(
      pg_catalog.jsonb_build_object(
        'representationKey', 'confirmed_customer:10000000-0000-4000-8000-000000000099',
        'representationType', 'confirmed_customer',
        'representationId', '10000000-0000-4000-8000-000000000099',
        'customerUniverse', 'GLOBAL', 'authoritySnapshotId', null
      )
    );
    raise exception 'missing confirmed representation was accepted';
  exception when sqlstate 'P0002' then
    if sqlerrm <> 'representation_not_found' then raise; end if;
  end;

  begin
    perform public.customer_window_360_v1_get_overview(
      pg_catalog.jsonb_set(v_related_locator, '{authoritySnapshotId}', '"30000000-0000-4000-8000-000000000099"')
    );
    raise exception 'missing authority was accepted';
  exception when sqlstate 'P0002' then
    if sqlerrm <> 'authority_not_found' then raise; end if;
  end;

  begin
    perform public.customer_window_360_v1_get_overview(
      pg_catalog.jsonb_build_object(
        'representationKey', 'related_review:' || repeat('9', 64),
        'representationType', 'related_review', 'representationId', repeat('9', 64),
        'customerUniverse', 'MCP_EAP',
        'authoritySnapshotId', '30000000-0000-4000-8000-000000000002'
      )
    );
    raise exception 'superseded snapshot was accepted';
  exception when sqlstate '40001' then
    if sqlerrm <> 'stale_representation' then raise; end if;
  end;

  begin
    perform public.customer_window_360_v1_list_observed_contacts(
      pg_catalog.jsonb_build_object(
        'representationKey', 'related_review:' || repeat('9', 64),
        'representationType', 'related_review', 'representationId', repeat('9', 64),
        'customerUniverse', 'MCP_EAP',
        'authoritySnapshotId', '30000000-0000-4000-8000-000000000002'
      ), 'email', 1, 100
    );
    raise exception 'stale locator was accepted by observed contacts';
  exception when sqlstate '40001' then
    if sqlerrm <> 'stale_representation' then raise; end if;
  end;

  begin
    perform public.customer_window_360_v1_get_overview(
      pg_catalog.jsonb_set(v_related_locator, '{representationKey}',
        pg_catalog.to_jsonb('related_review:' || repeat('9', 64)))
        || pg_catalog.jsonb_build_object('representationId', repeat('9', 64))
    );
    raise exception 'group from another snapshot was accepted';
  exception when sqlstate '40001' then
    if sqlerrm <> 'stale_representation' then raise; end if;
  end;

  begin
    perform public.customer_window_360_v1_get_overview(
      pg_catalog.jsonb_set(v_related_locator, '{representationKey}',
        pg_catalog.to_jsonb('related_review:' || repeat('8', 64)))
        || pg_catalog.jsonb_build_object('representationId', repeat('8', 64))
    );
    raise exception 'never-existing group was accepted';
  exception when sqlstate 'P0002' then
    if sqlerrm <> 'representation_not_found' then raise; end if;
  end;

  begin
    perform public.customer_window_360_v1_list_bookings(v_confirmed_locator, 1, 101);
    raise exception 'oversized page was accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

savepoint observed_contact_fixtures;

insert into public.customer_source_bookings_mcp_eap(
  source_row_id, source_booking_code, source_customer_id,
  email_raw, email_normalized, phone_raw, phone_normalized,
  source_created_at, planned_arrival_at, planned_departure_at,
  booking_status, paying_status, website_source, brand_normalized,
  parking_normalized, booking_paid, duration_days, is_pack, row_hash
)
select
  910002 + item, 'REL-CONTACT-' || item, 810002 + item,
  'observed@example.test', 'observed@example.test',
  '+5693000000' || item, '+5693000000' || item,
  timestamp '2026-09-21 11:00' + item * interval '1 minute',
  '2026-10-02', '2026-10-04', 1, 1, 1, 'EAP',
  'ESTACIONAMIENTO AEROPUERTO', 20000, 2, false, repeat(item::text, 64)
from generate_series(1, 6) item;

insert into public.customer_source_bookings_mcp_eap(
  source_row_id, source_booking_code, source_customer_id,
  source_created_at, planned_arrival_at, planned_departure_at,
  booking_status, paying_status, website_source, brand_normalized,
  parking_normalized, booking_paid, duration_days, is_pack, row_hash
) values (
  910009, 'REL-NO-CONTACT', 810009, '2026-09-21 12:00',
  '2026-10-02', '2026-10-04', 1, 1, 1, 'EAP',
  'ESTACIONAMIENTO AEROPUERTO', 20000, 2, false, repeat('8', 64)
);

insert into public.customer_booking_profile_links(
  profile_id, source, source_row_id, confidence, status, resolver_version
)
select '10000000-0000-4000-8000-000000000002', 'MCP_EAP', 910002 + item,
  'SUPPORT', 'candidate', 'fixture'
from generate_series(1, 6) item;

insert into public.customer_booking_profile_links(
  profile_id, source, source_row_id, confidence, status, resolver_version
) values (
  '10000000-0000-4000-8000-000000000002', 'MCP_EAP', 910009,
  'SUPPORT', 'candidate', 'fixture'
);

insert into public.customer_related_review_groups(
  snapshot_id, group_id, key_kind, booking_count, profile_count,
  email_count, phone_count, source_customer_count, conflict_count,
  candidate_count, v1_booking_count, v2_booking_count,
  has_exact_email_phone_corroboration, has_source_customer_email_corroboration
) values (
  '30000000-0000-4000-8000-000000000001', repeat('8', 64), 'NO_EMAIL_SOURCE_ROW',
  1, 1, 0, 0, 1, 0, 1, 0, 1, false, false
);

insert into public.customer_analytical_booking_assignments(
  snapshot_id, source, source_row_id, booking_link_id,
  representation_type, customer_id, related_group_id
)
select '30000000-0000-4000-8000-000000000001', 'MCP_EAP', link.source_row_id,
  link.id, 'related_review', null, repeat('f', 64)
from public.customer_booking_profile_links link
where link.source = 'MCP_EAP' and link.source_row_id between 910003 and 910008;

insert into public.customer_analytical_booking_assignments(
  snapshot_id, source, source_row_id, booking_link_id,
  representation_type, customer_id, related_group_id
)
select '30000000-0000-4000-8000-000000000001', 'MCP_EAP', link.source_row_id,
  link.id, 'related_review', null, repeat('8', 64)
from public.customer_booking_profile_links link
where link.source = 'MCP_EAP' and link.source_row_id = 910009;

update public.customer_related_review_groups
set booking_count = 7, candidate_count = 7, phone_count = 7, v2_booking_count = 7
where snapshot_id = '30000000-0000-4000-8000-000000000001' and group_id = repeat('f', 64);

insert into public.customer_related_review_metrics(
  snapshot_id, group_id, total_reservations, first_purchase_at, last_purchase_at
) values (
  '30000000-0000-4000-8000-000000000001', repeat('8', 64), 1,
  '2026-09-21 12:00', '2026-09-21 12:00'
);

update public.customer_related_review_metrics
set total_reservations = 7, last_purchase_at = '2026-09-21 11:06'
where snapshot_id = '30000000-0000-4000-8000-000000000001' and group_id = repeat('f', 64);

do $$
declare
  v_locator jsonb := pg_catalog.jsonb_build_object(
    'representationKey', 'related_review:' || repeat('f', 64),
    'representationType', 'related_review', 'representationId', repeat('f', 64),
    'customerUniverse', 'MCP_EAP',
    'authoritySnapshotId', '30000000-0000-4000-8000-000000000001'
  );
  v_overview jsonb;
  v_page_one jsonb;
  v_page_two jsonb;
  v_empty_locator jsonb := pg_catalog.jsonb_build_object(
    'representationKey', 'related_review:' || repeat('8', 64),
    'representationType', 'related_review', 'representationId', repeat('8', 64),
    'customerUniverse', 'MCP_EAP',
    'authoritySnapshotId', '30000000-0000-4000-8000-000000000001'
  );
  v_empty_overview jsonb;
  v_empty_contacts jsonb;
begin
  v_overview := public.customer_window_360_v1_get_overview(v_locator);
  v_page_one := public.customer_window_360_v1_list_observed_contacts(v_locator, 'phone', 1, 5);
  v_page_two := public.customer_window_360_v1_list_observed_contacts(v_locator, 'phone', 2, 5);
  v_empty_overview := public.customer_window_360_v1_get_overview(v_empty_locator);
  v_empty_contacts := public.customer_window_360_v1_list_observed_contacts(v_empty_locator, 'email', 1, 5);
  if v_overview #>> '{identity,contacts,emailCount}' <> '1'
    or v_overview #>> '{identity,contacts,phoneCount}' <> '7'
    or pg_catalog.jsonb_array_length(v_overview #> '{identity,contacts,emailPreview}') <> 1
    or pg_catalog.jsonb_array_length(v_overview #> '{identity,contacts,phonePreview}') <> 5
    or v_page_one #>> '{pagination,total}' <> '7'
    or v_page_one #>> '{pagination,hasNextPage}' <> 'true'
    or pg_catalog.jsonb_array_length(v_page_one -> 'items') <> 5
    or v_page_two #>> '{pagination,hasNextPage}' <> 'false'
    or pg_catalog.jsonb_array_length(v_page_two -> 'items') <> 2
    or v_empty_overview #>> '{identity,contacts,emailCount}' <> '0'
    or v_empty_overview #>> '{identity,contacts,phoneCount}' <> '0'
    or pg_catalog.jsonb_array_length(v_empty_overview #> '{identity,contacts,emailPreview}') <> 0
    or pg_catalog.jsonb_array_length(v_empty_overview #> '{identity,contacts,phonePreview}') <> 0
    or v_empty_contacts #>> '{pagination,total}' <> '0'
    or pg_catalog.jsonb_array_length(v_empty_contacts -> 'items') <> 0 then
    raise exception 'observed contact preview/pagination contract failed';
  end if;
end;
$$;

rollback to savepoint observed_contact_fixtures;

savepoint active_authority_fixture;
update public.customer_related_review_snapshots
set status = 'ready', activated_at = null
where snapshot_id = '30000000-0000-4000-8000-000000000001';

do $$
declare
  v_confirmed_locator jsonb := pg_catalog.jsonb_build_object(
    'representationKey', 'confirmed_customer:10000000-0000-4000-8000-000000000001',
    'representationType', 'confirmed_customer',
    'representationId', '10000000-0000-4000-8000-000000000001',
    'customerUniverse', 'GLOBAL', 'authoritySnapshotId', null
  );
begin
  if public.customer_window_360_v1_get_overview(v_confirmed_locator) #>> '{representation,authorityStatus}' <> 'global' then
    raise exception 'confirmed representation depends on MCP/EAP snapshot';
  end if;
  begin
    perform public.customer_window_360_v1_get_overview(
      pg_catalog.jsonb_build_object(
        'representationKey', 'related_review:' || repeat('f', 64),
        'representationType', 'related_review', 'representationId', repeat('f', 64),
        'customerUniverse', 'MCP_EAP',
        'authoritySnapshotId', '30000000-0000-4000-8000-000000000001'
      )
    );
    raise exception 'related representation accepted without active authority';
  exception when sqlstate '55000' then
    if sqlerrm <> 'representation_authority_unavailable' then raise; end if;
  end;
end;
$$;

rollback to savepoint active_authority_fixture;

savepoint stale_confirmed_fixture;
update public.customer_profiles
set status = 'merged', merged_into_profile_id = '10000000-0000-4000-8000-000000000002'
where id = '10000000-0000-4000-8000-000000000001';

do $$
begin
  perform public.customer_window_360_v1_get_overview(
    pg_catalog.jsonb_build_object(
      'representationKey', 'confirmed_customer:10000000-0000-4000-8000-000000000001',
      'representationType', 'confirmed_customer',
      'representationId', '10000000-0000-4000-8000-000000000001',
      'customerUniverse', 'GLOBAL', 'authoritySnapshotId', null
    )
  );
  raise exception 'merged confirmed representation was accepted';
exception when sqlstate '40001' then
  if sqlerrm <> 'stale_representation' then raise; end if;
end;
$$;

rollback to savepoint stale_confirmed_fixture;

do $$
declare
  v_public_execute boolean;
begin
  if pg_catalog.to_regprocedure('public.customer_window_360_v1_resolve_locator(jsonb)') is null
    or pg_catalog.to_regprocedure('public.customer_window_360_v1_get_overview(jsonb)') is null
    or pg_catalog.to_regprocedure('public.customer_window_360_v1_list_observed_contacts(jsonb,text,integer,integer)') is null
    or pg_catalog.to_regprocedure('public.customer_window_360_v1_list_bookings(jsonb,integer,integer)') is null then
    raise exception 'Customer 360 functions missing';
  end if;
  if (
    select count(*)
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_language language on language.oid = procedure.prolang
    where procedure.oid in (
      'public.customer_window_360_v1_resolve_locator(jsonb)'::regprocedure,
      'public.customer_window_360_v1_get_overview(jsonb)'::regprocedure,
      'public.customer_window_360_v1_list_observed_contacts(jsonb,text,integer,integer)'::regprocedure,
      'public.customer_window_360_v1_list_bookings(jsonb,integer,integer)'::regprocedure
    )
      and procedure.prorettype = 'jsonb'::regtype
      and language.lanname = 'plpgsql'
      and procedure.provolatile = 's'
      and procedure.prosecdef
      and pg_catalog.array_length(procedure.proconfig, 1) = 1
      and procedure.proconfig[1] in ('search_path=', 'search_path=""')
  ) <> 4 then
    raise exception 'Customer 360 function catalog contract failed';
  end if;
  select exists (
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.aclexplode(coalesce(
      procedure.proacl, pg_catalog.acldefault('f', procedure.proowner)
    )) acl
    where procedure.oid in (
      'public.customer_window_360_v1_get_overview(jsonb)'::regprocedure,
      'public.customer_window_360_v1_list_observed_contacts(jsonb,text,integer,integer)'::regprocedure,
      'public.customer_window_360_v1_list_bookings(jsonb,integer,integer)'::regprocedure
    )
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute
    or pg_catalog.has_function_privilege('anon', 'public.customer_window_360_v1_get_overview(jsonb)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.customer_window_360_v1_list_observed_contacts(jsonb,text,integer,integer)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.customer_window_360_v1_list_bookings(jsonb,integer,integer)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.customer_window_360_v1_get_overview(jsonb)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.customer_window_360_v1_list_observed_contacts(jsonb,text,integer,integer)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.customer_window_360_v1_list_bookings(jsonb,integer,integer)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.customer_window_360_v1_get_overview(jsonb)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.customer_window_360_v1_list_observed_contacts(jsonb,text,integer,integer)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.customer_window_360_v1_list_bookings(jsonb,integer,integer)', 'EXECUTE')
    or pg_catalog.has_function_privilege('service_role', 'public.customer_window_360_v1_resolve_locator(jsonb)', 'EXECUTE') then
    raise exception 'Customer 360 ACL contract failed';
  end if;
end;
$$;

set local role service_role;
do $$
declare
  v_locator jsonb := pg_catalog.jsonb_build_object(
    'representationKey', 'confirmed_customer:10000000-0000-4000-8000-000000000001',
    'representationType', 'confirmed_customer',
    'representationId', '10000000-0000-4000-8000-000000000001',
    'customerUniverse', 'GLOBAL', 'authoritySnapshotId', null
  );
begin
  if public.customer_window_360_v1_get_overview(v_locator) #>> '{summary,totalBookings}' <> '2'
    or public.customer_window_360_v1_list_bookings(v_locator, 1, 25) #>> '{pagination,total}' <> '2' then
    raise exception 'Customer 360 service_role RLS interaction failed';
  end if;
end;
$$;
reset role;

savepoint performance_fixtures;

insert into public.customer_source_bookings_mcp_eap(
  source_row_id, source_booking_code, source_customer_id, source_created_at,
  booking_status, paying_status, website_source, brand_normalized,
  parking_normalized, booking_paid, duration_days, is_pack, row_hash
)
select
  930000 + item, 'MCP-LARGE-' || item, 820000 + item,
  timestamp '2026-01-01' + item * interval '1 minute',
  1, 1, 1, 'MCP', 'MCPARKING', 10000, 1, false, repeat('1', 64)
from generate_series(1, 5000) item;

insert into public.customer_booking_profile_links(
  profile_id, source, source_row_id, confidence, status, resolver_version
)
select
  '10000000-0000-4000-8000-000000000001', 'MCP_EAP', 930000 + item,
  'HIGH', 'active', 'fixture'
from generate_series(1, 5000) item;

update public.customer_profile_metrics
set total_reservations = 5002, mcp_count = 5001
where customer_id = '10000000-0000-4000-8000-000000000001';

insert into public.customer_source_bookings_mcp_eap(
  source_row_id, source_booking_code, source_customer_id, email_raw,
  email_normalized, source_created_at, booking_status, paying_status,
  website_source, brand_normalized, parking_normalized, booking_paid,
  duration_days, is_pack, row_hash
)
select
  940000 + item, 'REL-LARGE-' || item, 830000 + item,
  'observed@example.test', 'observed@example.test',
  timestamp '2026-02-01' + item * interval '1 minute',
  1, 1, 1, 'EAP', 'ESTACIONAMIENTO AEROPUERTO', 20000, 1, false, repeat('2', 64)
from generate_series(1, 1000) item;

insert into public.customer_booking_profile_links(
  profile_id, source, source_row_id, confidence, status, resolver_version
)
select
  '10000000-0000-4000-8000-000000000002', 'MCP_EAP', 940000 + item,
  'SUPPORT', 'candidate', 'fixture'
from generate_series(1, 1000) item;

insert into public.customer_related_review_members(
  snapshot_id, source, source_row_id, group_id, booking_link_id,
  profile_id, link_status, resolver_version, relationship_type
)
select
  '30000000-0000-4000-8000-000000000001', 'MCP_EAP', link.source_row_id,
  repeat('f', 64), link.id, link.profile_id, 'candidate', 'fixture', 'EXACT_EMAIL'
from public.customer_booking_profile_links link
where link.source = 'MCP_EAP'
  and link.source_row_id between 940001 and 941000;

insert into public.customer_analytical_booking_assignments(
  snapshot_id, source, source_row_id, booking_link_id,
  representation_type, customer_id, related_group_id
)
select
  '30000000-0000-4000-8000-000000000001', 'MCP_EAP', link.source_row_id,
  link.id, 'confirmed_customer', link.profile_id, null
from public.customer_booking_profile_links link
where link.source = 'MCP_EAP'
  and link.source_row_id between 930001 and 935000;

insert into public.customer_analytical_booking_assignments(
  snapshot_id, source, source_row_id, booking_link_id,
  representation_type, customer_id, related_group_id
)
select
  '30000000-0000-4000-8000-000000000001', 'MCP_EAP', link.source_row_id,
  link.id, 'related_review', null, repeat('f', 64)
from public.customer_booking_profile_links link
where link.source = 'MCP_EAP'
  and link.source_row_id between 940001 and 941000;

update public.customer_related_review_groups
set booking_count = 1001, candidate_count = 1001, v2_booking_count = 1001
where snapshot_id = '30000000-0000-4000-8000-000000000001'
  and group_id = repeat('f', 64);

update public.customer_related_review_metrics
set total_reservations = 1001
where snapshot_id = '30000000-0000-4000-8000-000000000001'
  and group_id = repeat('f', 64);

analyze public.customer_booking_profile_links;
analyze public.customer_source_bookings_mcp_eap;
analyze public.customer_analytical_booking_assignments;

explain (analyze, buffers, verbose)
with observations as materialized (
  select observed.identity_type, observed.normalized_value,
    observed.source_created_at, observed.source_row_id
  from public.customer_analytical_booking_assignments assignment
  cross join lateral (
    select source_booking.*
    from public.customer_source_bookings_mcp_eap source_booking
    where source_booking.source = assignment.source
      and source_booking.source_row_id = assignment.source_row_id
    limit 1
  ) booking
  cross join lateral (
    values
      ('email'::text, nullif(booking.email_normalized, ''),
        booking.source_created_at, booking.source_row_id),
      ('phone'::text, nullif(booking.phone_normalized, ''),
        booking.source_created_at, booking.source_row_id)
  ) observed(identity_type, normalized_value, source_created_at, source_row_id)
  where assignment.snapshot_id = '30000000-0000-4000-8000-000000000001'
    and assignment.representation_type = 'related_review'
    and assignment.related_group_id = repeat('f', 64)
    and observed.normalized_value is not null
)
select count(distinct (identity_type, normalized_value))
from observations;

explain (analyze, buffers, verbose)
with mcp_eap_links as materialized (
  select link.source_row_id
  from public.customer_booking_profile_links link
  where link.profile_id = '10000000-0000-4000-8000-000000000001'
    and link.source = 'MCP_EAP'
    and link.status = 'active'
),
okp_links as materialized (
  select link.source_row_id
  from public.customer_booking_profile_links link
  where link.profile_id = '10000000-0000-4000-8000-000000000001'
    and link.source = 'OKP'
    and link.status = 'active'
),
scoped as (
  select 'MCP_EAP'::text as source, booking.source_row_id,
    booking.source_created_at as purchase_created_at
  from mcp_eap_links link
  cross join lateral (
    select source_booking.source_row_id, source_booking.source_created_at
    from public.customer_source_bookings_mcp_eap source_booking
    where source_booking.source = 'MCP_EAP'
      and source_booking.source_row_id = link.source_row_id
      and source_booking.booking_status in (1, 8)
    limit 1
  ) booking
  union all
  select 'OKP'::text, booking.source_row_id, booking.source_created_at
  from okp_links link
  cross join lateral (
    select source_booking.source_row_id, source_booking.source_created_at
    from public.customer_source_bookings_okp source_booking
    where source_booking.source = 'OKP'
      and source_booking.source_row_id = link.source_row_id
      and (
        (source_booking.status_raw = 'PAGADA'
          and source_booking.is_confirmed is true
          and source_booking.is_paid is true)
        or (source_booking.status_raw = 'REEMPLAZADA'
          and source_booking.is_confirmed is true)
      )
    limit 1
  ) booking
)
select scoped.*
from scoped
order by scoped.purchase_created_at desc nulls last,
  scoped.source desc, scoped.source_row_id desc
limit 25;

explain (analyze, buffers, verbose)
select booking.source_row_id, booking.source_created_at
from public.customer_analytical_booking_assignments assignment
join public.customer_source_bookings_mcp_eap booking
  on booking.source = assignment.source
 and booking.source_row_id = assignment.source_row_id
where assignment.snapshot_id = '30000000-0000-4000-8000-000000000001'
  and assignment.representation_type = 'related_review'
  and assignment.related_group_id = repeat('f', 64)
order by booking.source_created_at desc nulls last,
  booking.source desc, booking.source_row_id desc
limit 25;

explain (analyze, buffers, verbose)
select public.customer_window_360_v1_list_bookings(
  pg_catalog.jsonb_build_object(
    'representationKey', 'confirmed_customer:10000000-0000-4000-8000-000000000001',
    'representationType', 'confirmed_customer',
    'representationId', '10000000-0000-4000-8000-000000000001',
    'customerUniverse', 'GLOBAL', 'authoritySnapshotId', null
  ), 1, 25
);

explain (analyze, buffers, verbose)
select public.customer_window_360_v1_get_overview(
  pg_catalog.jsonb_build_object(
    'representationKey', 'related_review:' || repeat('f', 64),
    'representationType', 'related_review', 'representationId', repeat('f', 64),
    'customerUniverse', 'MCP_EAP',
    'authoritySnapshotId', '30000000-0000-4000-8000-000000000001'
  )
);

explain (analyze, buffers, verbose)
select public.customer_window_360_v1_list_bookings(
  pg_catalog.jsonb_build_object(
    'representationKey', 'related_review:' || repeat('f', 64),
    'representationType', 'related_review', 'representationId', repeat('f', 64),
    'customerUniverse', 'MCP_EAP',
    'authoritySnapshotId', '30000000-0000-4000-8000-000000000001'
  ), 1, 25
);

rollback to savepoint performance_fixtures;

select
  true as confirmed_ok,
  true as related_ok,
  true as stale_cases_ok,
  true as pagination_ok,
  true as acl_ok,
  true as reversible_test_ok;

rollback;

select
  not exists (
    select 1 from public.customer_profiles
    where id in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002'
    )
  ) as fixtures_absent_after_rollback,
  pg_catalog.to_regprocedure('public.customer_window_360_v1_resolve_locator(jsonb)') is not null
    and pg_catalog.to_regprocedure('public.customer_window_360_v1_get_overview(jsonb)') is not null
    and pg_catalog.pg_get_functiondef(
      'public.customer_window_360_v1_get_overview(jsonb)'::regprocedure
    ) = :'rr_customer360_baseline_overview_definition'
    and pg_catalog.to_regprocedure('public.customer_window_360_v1_list_observed_contacts(jsonb,text,integer,integer)') is null
    and pg_catalog.to_regprocedure('public.customer_window_360_v1_list_bookings(jsonb,integer,integer)') is not null
    as baseline_functions_restored_after_rollback;
