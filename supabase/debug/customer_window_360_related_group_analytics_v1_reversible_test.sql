begin;

do $harness$
begin
  if pg_catalog.to_regclass('public.customer_related_review_group_analytics') is not null
    or pg_catalog.to_regclass('public.customer_related_review_contact_candidates') is not null
    or pg_catalog.to_regprocedure(
      'public.customer_window_360_v1_get_related_group_analytics(jsonb)'
    ) is not null then
    raise exception 'related_group_analytics_v1_already_installed';
  end if;
end;
$harness$;

create table public.customer_related_review_group_analytics (
  snapshot_id uuid not null,
  group_id text not null,
  total_valid_bookings bigint not null,
  boleta_booking_count bigint not null,
  pack_booking_count bigint not null,
  first_activity_at timestamp without time zone,
  last_activity_at timestamp without time zone,
  bookings_12m bigint not null,
  bookings_24m bigint not null,
  total_economic_days bigint,
  average_economic_days numeric,
  median_economic_days numeric,
  economic_days_sample_size bigint not null,
  average_booking_lead_days numeric,
  median_booking_lead_days numeric,
  booking_lead_sample_size bigint not null,
  weekday_arrival_count bigint not null,
  weekend_arrival_count bigint not null,
  arrival_sample_size bigint not null,
  arrival_month_counts jsonb not null,
  active_arrival_month_count smallint not null,
  brand_counts jsonb not null,
  parking_counts jsonb not null,
  parking_family_counts jsonb not null,
  boleta_economic_sample_size bigint not null,
  boleta_paid_amount numeric(18,2),
  boleta_list_amount numeric(18,2),
  boleta_discount_amount numeric(18,2),
  average_boleta_ticket numeric,
  median_boleta_ticket numeric,
  paid_adr numeric,
  list_adr numeric,
  discounted_boleta_count bigint not null,
  discount_usage_pct numeric,
  weighted_discount_pct numeric,
  missing_paid_amount_count bigint not null,
  missing_duration_count bigint not null,
  missing_lead_time_count bigint not null,
  invalid_lead_time_count bigint not null,
  missing_parking_family_count bigint not null,
  as_of_date date not null,
  calculation_version text not null,
  computed_at timestamptz not null,
  primary key (snapshot_id, group_id),
  foreign key (snapshot_id, group_id)
    references public.customer_related_review_groups(snapshot_id, group_id)
    on delete cascade,
  constraint customer_related_review_group_analytics_counts_check check (
    total_valid_bookings >= 0
    and boleta_booking_count >= 0
    and pack_booking_count >= 0
    and boleta_booking_count + pack_booking_count = total_valid_bookings
    and bookings_12m >= 0 and bookings_12m <= total_valid_bookings
    and bookings_24m >= bookings_12m and bookings_24m <= total_valid_bookings
    and economic_days_sample_size >= 0 and economic_days_sample_size <= boleta_booking_count
    and booking_lead_sample_size >= 0 and booking_lead_sample_size <= boleta_booking_count
    and weekday_arrival_count >= 0 and weekend_arrival_count >= 0
    and arrival_sample_size = weekday_arrival_count + weekend_arrival_count
    and arrival_sample_size <= boleta_booking_count
    and active_arrival_month_count between 0 and 12
    and boleta_economic_sample_size >= 0 and boleta_economic_sample_size <= boleta_booking_count
    and discounted_boleta_count >= 0 and discounted_boleta_count <= boleta_economic_sample_size
    and missing_paid_amount_count >= 0 and missing_duration_count >= 0
    and missing_lead_time_count >= 0 and invalid_lead_time_count >= 0
    and missing_parking_family_count >= 0 and missing_parking_family_count <= total_valid_bookings
  ),
  constraint customer_related_review_group_analytics_null_semantics_check check (
    ((economic_days_sample_size = 0 and total_economic_days is null
      and average_economic_days is null and median_economic_days is null)
      or (economic_days_sample_size > 0 and total_economic_days is not null
        and average_economic_days is not null and median_economic_days is not null))
    and ((booking_lead_sample_size = 0 and average_booking_lead_days is null
      and median_booking_lead_days is null)
      or (booking_lead_sample_size > 0 and average_booking_lead_days is not null
        and median_booking_lead_days is not null))
    and ((boleta_economic_sample_size = 0 and boleta_paid_amount is null
      and boleta_list_amount is null and boleta_discount_amount is null
      and average_boleta_ticket is null and median_boleta_ticket is null
      and paid_adr is null and list_adr is null and discount_usage_pct is null
      and weighted_discount_pct is null)
      or (boleta_economic_sample_size > 0 and boleta_paid_amount is not null
        and boleta_list_amount is not null and boleta_discount_amount is not null
        and average_boleta_ticket is not null and median_boleta_ticket is not null
        and paid_adr is not null and list_adr is not null and discount_usage_pct is not null))
  ),
  constraint customer_related_review_group_analytics_json_check check (
    pg_catalog.jsonb_typeof(arrival_month_counts) = 'array'
    and pg_catalog.jsonb_array_length(arrival_month_counts) = 12
    and pg_catalog.jsonb_typeof(brand_counts) = 'object'
    and pg_catalog.jsonb_typeof(parking_counts) = 'object'
    and pg_catalog.jsonb_typeof(parking_family_counts) = 'object'
  ),
  constraint customer_related_review_group_analytics_version_check check (
    calculation_version = 'CUSTOMER_360_RELATED_GROUP_ANALYTICS_V1'
  )
);

create table public.customer_related_review_contact_candidates (
  snapshot_id uuid not null,
  group_id text not null,
  type text not null,
  normalized_value text not null,
  display_value text not null,
  relation text not null,
  sources text[] not null,
  source_count integer not null,
  first_seen_at timestamp without time zone not null,
  last_seen_at timestamp without time zone not null,
  booking_count bigint not null,
  profile_count bigint,
  current_group_membership boolean not null,
  conflict_involvement boolean not null,
  contradictory_signals boolean,
  same_phone_history boolean,
  same_email_history boolean,
  quality_flags text[] not null,
  eligibility_status text not null,
  eligibility_reason_codes text[] not null,
  policy_version text not null,
  primary key (snapshot_id, group_id, type, normalized_value),
  foreign key (snapshot_id, group_id)
    references public.customer_related_review_groups(snapshot_id, group_id)
    on delete cascade,
  constraint customer_related_review_contact_candidates_type_check
    check (type in ('email', 'phone')),
  constraint customer_related_review_contact_candidates_relation_check
    check (relation = 'observed_in_group'),
  constraint customer_related_review_contact_candidates_sources_check
    check (sources = array['MCP_EAP']::text[] and source_count = 1),
  constraint customer_related_review_contact_candidates_counts_check check (
    booking_count > 0 and (profile_count is null or profile_count > 0)
    and first_seen_at <= last_seen_at
  ),
  constraint customer_related_review_contact_candidates_membership_check
    check (current_group_membership is true),
  constraint customer_related_review_contact_candidates_eligibility_check check (
    eligibility_status in ('REVIEW', 'BLOCKED')
    and pg_catalog.array_position(
      eligibility_reason_codes,
      'AUTOMATION_NOT_AUTHORIZED_V1'
    ) is not null
  ),
  constraint customer_related_review_contact_candidates_policy_check
    check (policy_version = 'RELATED_CONTACTABILITY_V1')
);

alter table public.customer_related_review_group_analytics enable row level security;
alter table public.customer_related_review_contact_candidates enable row level security;

revoke all on table public.customer_related_review_group_analytics
  from public, anon, authenticated, service_role;
revoke all on table public.customer_related_review_contact_candidates
  from public, anon, authenticated, service_role;

grant select, insert on table
  public.customer_related_review_group_analytics,
  public.customer_related_review_contact_candidates
to customer_related_review_builder;

grant select on table public.customer_window_parking_family_rules
  to customer_related_review_builder;

create policy related_group_analytics_builder_select
  on public.customer_related_review_group_analytics
  for select to customer_related_review_builder
  using (exists (
    select 1
    from public.customer_related_review_snapshots snapshot
    where snapshot.snapshot_id = customer_related_review_group_analytics.snapshot_id
      and snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
  ));

create policy related_group_analytics_builder_insert
  on public.customer_related_review_group_analytics
  for insert to customer_related_review_builder
  with check (exists (
    select 1
    from public.customer_related_review_snapshots snapshot
    where snapshot.snapshot_id = customer_related_review_group_analytics.snapshot_id
      and snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
      and snapshot.status = 'building'
  ));

create policy related_contact_candidates_builder_select
  on public.customer_related_review_contact_candidates
  for select to customer_related_review_builder
  using (exists (
    select 1
    from public.customer_related_review_snapshots snapshot
    where snapshot.snapshot_id = customer_related_review_contact_candidates.snapshot_id
      and snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
  ));

create policy related_contact_candidates_builder_insert
  on public.customer_related_review_contact_candidates
  for insert to customer_related_review_builder
  with check (exists (
    select 1
    from public.customer_related_review_snapshots snapshot
    where snapshot.snapshot_id = customer_related_review_contact_candidates.snapshot_id
      and snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
      and snapshot.status = 'building'
  ));

create policy related_group_analytics_builder_parking_rules_select
  on public.customer_window_parking_family_rules
  for select to customer_related_review_builder
  using (source = 'MCP_EAP');

create or replace function public.customer_window_360_v1_get_related_group_analytics(
  p_locator jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_resolved jsonb;
  v_locator jsonb;
  v_snapshot_id uuid;
  v_group_id text;
  v_analytics public.customer_related_review_group_analytics%rowtype;
  v_candidates jsonb;
  v_primary_email jsonb;
  v_primary_phone jsonb;
begin
  v_resolved := public.customer_window_360_v1_resolve_locator(p_locator);
  v_locator := v_resolved -> 'locator';

  if v_locator ->> 'representationType' <> 'related_review' then
    raise exception 'invalid_locator_contract' using errcode = '22023';
  end if;

  v_snapshot_id := (v_resolved ->> 'snapshotId')::uuid;
  v_group_id := v_resolved ->> 'relatedGroupId';

  select analytics.*
  into v_analytics
  from public.customer_related_review_group_analytics analytics
  where analytics.snapshot_id = v_snapshot_id
    and analytics.group_id = v_group_id;

  if not found then
    raise exception 'related_group_analytics_not_materialized' using errcode = 'P0002';
  end if;

  with candidate_rows as materialized (
    select candidate.*,
      pg_catalog.jsonb_build_object(
        'type', candidate.type,
        'normalizedValue', candidate.normalized_value,
        'displayValue', candidate.display_value,
        'relation', candidate.relation,
        'sources', pg_catalog.to_jsonb(candidate.sources),
        'sourceCount', candidate.source_count,
        'firstSeenAt', candidate.first_seen_at,
        'lastSeenAt', candidate.last_seen_at,
        'bookingCount', candidate.booking_count,
        'profileCount', candidate.profile_count,
        'currentGroupMembership', candidate.current_group_membership,
        'conflictInvolvement', candidate.conflict_involvement,
        'contradictorySignals', candidate.contradictory_signals,
        'samePhoneHistory', candidate.same_phone_history,
        'sameEmailHistory', candidate.same_email_history,
        'qualityFlags', pg_catalog.to_jsonb(candidate.quality_flags),
        'eligibility', pg_catalog.jsonb_build_object(
          'status', candidate.eligibility_status,
          'reasonCodes', pg_catalog.to_jsonb(candidate.eligibility_reason_codes)
        ),
        'policyVersion', candidate.policy_version
      ) as payload
    from public.customer_related_review_contact_candidates candidate
    where candidate.snapshot_id = v_snapshot_id
      and candidate.group_id = v_group_id
  ), candidate_summary as (
    select
      coalesce(pg_catalog.jsonb_agg(payload order by type, normalized_value), '[]'::jsonb) as candidates,
      count(*) filter (where type = 'email') as email_count,
      count(*) filter (where type = 'phone') as phone_count,
      (pg_catalog.jsonb_agg(payload order by normalized_value)
        filter (where type = 'email' and eligibility_status = 'REVIEW')) -> 0 as review_email,
      (pg_catalog.jsonb_agg(payload order by normalized_value)
        filter (where type = 'phone' and eligibility_status = 'REVIEW')) -> 0 as review_phone
    from candidate_rows
  )
  select summary.candidates,
    case when summary.email_count = 1 then summary.review_email end,
    case when summary.phone_count = 1 then summary.review_phone end
  into v_candidates, v_primary_email, v_primary_phone
  from candidate_summary summary;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 'CUSTOMER_360_RELATED_GROUP_ANALYTICS_V1',
    'locator', v_locator,
    'scope', pg_catalog.jsonb_build_object(
      'entity', 'related_group',
      'semantics', 'group_observed',
      'customerUniverse', 'MCP_EAP'
    ),
    'activity', pg_catalog.jsonb_build_object(
      'totalValidBookings', v_analytics.total_valid_bookings,
      'boletaBookings', v_analytics.boleta_booking_count,
      'packBookings', v_analytics.pack_booking_count,
      'firstActivityAt', v_analytics.first_activity_at,
      'lastActivityAt', v_analytics.last_activity_at,
      'bookings12m', v_analytics.bookings_12m,
      'bookings24m', v_analytics.bookings_24m
    ),
    'behavior', pg_catalog.jsonb_build_object(
      'scope', 'boleta_observed',
      'economicDays', pg_catalog.jsonb_build_object(
        'total', v_analytics.total_economic_days,
        'average', v_analytics.average_economic_days,
        'median', v_analytics.median_economic_days,
        'sampleSize', v_analytics.economic_days_sample_size
      ),
      'leadTimeDays', pg_catalog.jsonb_build_object(
        'average', v_analytics.average_booking_lead_days,
        'median', v_analytics.median_booking_lead_days,
        'sampleSize', v_analytics.booking_lead_sample_size
      ),
      'arrivals', pg_catalog.jsonb_build_object(
        'weekdayCount', v_analytics.weekday_arrival_count,
        'weekendCount', v_analytics.weekend_arrival_count,
        'sampleSize', v_analytics.arrival_sample_size,
        'monthlyCounts', v_analytics.arrival_month_counts,
        'activeMonths', v_analytics.active_arrival_month_count
      )
    ),
    'origin', pg_catalog.jsonb_build_object(
      'sourceCoverage', 'MCP_EAP',
      'brandCounts', v_analytics.brand_counts,
      'parkingCounts', v_analytics.parking_counts,
      'parkingFamilyCounts', v_analytics.parking_family_counts
    ),
    'boletaEconomics', pg_catalog.jsonb_build_object(
      'label', 'Economía BOLETA observada del grupo',
      'sampleSize', v_analytics.boleta_economic_sample_size,
      'paidAmount', v_analytics.boleta_paid_amount,
      'listAmount', v_analytics.boleta_list_amount,
      'discountAmount', v_analytics.boleta_discount_amount,
      'averageTicket', v_analytics.average_boleta_ticket,
      'medianTicket', v_analytics.median_boleta_ticket,
      'paidAdr', v_analytics.paid_adr,
      'listAdr', v_analytics.list_adr,
      'discountedBookings', v_analytics.discounted_boleta_count,
      'discountUsagePct', v_analytics.discount_usage_pct,
      'weightedDiscountPct', v_analytics.weighted_discount_pct
    ),
    'contactability', pg_catalog.jsonb_build_object(
      'mode', 'read_only_review',
      'automationEnabled', false,
      'policyVersion', 'RELATED_CONTACTABILITY_V1',
      'primaryContactCandidate', pg_catalog.jsonb_build_object(
        'email', v_primary_email,
        'phone', v_primary_phone
      ),
      'candidates', v_candidates,
      'historicalEvidence', pg_catalog.jsonb_build_object(
        'materialized', false,
        'detailSurface', 'identity'
      )
    ),
    'dataQuality', pg_catalog.jsonb_build_object(
      'missingPaidAmountCount', v_analytics.missing_paid_amount_count,
      'missingDurationCount', v_analytics.missing_duration_count,
      'missingLeadTimeCount', v_analytics.missing_lead_time_count,
      'invalidLeadTimeCount', v_analytics.invalid_lead_time_count,
      'missingParkingFamilyCount', v_analytics.missing_parking_family_count,
      'asOfDate', v_analytics.as_of_date,
      'calculationVersion', v_analytics.calculation_version,
      'computedAt', v_analytics.computed_at
    )
  );
end;
$function$;

revoke all on function public.customer_window_360_v1_get_related_group_analytics(jsonb)
  from public, anon, authenticated;
grant execute on function public.customer_window_360_v1_get_related_group_analytics(jsonb)
  to service_role;

comment on table public.customer_related_review_group_analytics is
  'Snapshot-scoped aggregate analytics for related review groups. MCP/EAP assignments only; no OKP activity is copied.';
comment on table public.customer_related_review_contact_candidates is
  'Snapshot-scoped observed contact evidence for review. V1 never authorizes automatic campaign contact.';
comment on function public.customer_window_360_v1_get_related_group_analytics(jsonb) is
  'Read-only Customer 360 related-group analytics. Exact active snapshot locator required; historical cross-source detail remains lazy in Identity.';

do $harness$
begin
  if (select count(*) from (
    select group_row.group_id
    from public.customer_related_review_groups group_row
    join public.customer_related_review_snapshots snapshot
      on snapshot.snapshot_id = group_row.snapshot_id
    where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
      and snapshot.status = 'active'
    limit 3
  ) fixture) <> 3 then
    raise exception 'three_active_related_groups_required';
  end if;
end;
$harness$;

with fixture as materialized (
  select pg_catalog.row_number() over (order by group_row.group_id)::integer as ordinal,
    group_row.snapshot_id, group_row.group_id, group_row.booking_count, group_row.profile_count
  from public.customer_related_review_groups group_row
  join public.customer_related_review_snapshots snapshot
    on snapshot.snapshot_id = group_row.snapshot_id
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and snapshot.status = 'active'
  order by group_row.group_id
  limit 3
)
insert into public.customer_related_review_group_analytics (
  snapshot_id, group_id, total_valid_bookings, boleta_booking_count, pack_booking_count,
  first_activity_at, last_activity_at, bookings_12m, bookings_24m,
  total_economic_days, average_economic_days, median_economic_days,
  economic_days_sample_size, average_booking_lead_days, median_booking_lead_days,
  booking_lead_sample_size, weekday_arrival_count, weekend_arrival_count,
  arrival_sample_size, arrival_month_counts, active_arrival_month_count,
  brand_counts, parking_counts, parking_family_counts, boleta_economic_sample_size,
  boleta_paid_amount, boleta_list_amount, boleta_discount_amount, average_boleta_ticket,
  median_boleta_ticket, paid_adr, list_adr, discounted_boleta_count, discount_usage_pct,
  weighted_discount_pct, missing_paid_amount_count, missing_duration_count,
  missing_lead_time_count, invalid_lead_time_count, missing_parking_family_count,
  as_of_date, calculation_version, computed_at
)
select fixture.snapshot_id, fixture.group_id, fixture.booking_count,
  fixture.booking_count - case when fixture.ordinal = 3 then 1 else 0 end,
  case when fixture.ordinal = 3 then 1 else 0 end,
  timestamp '2026-09-01 12:00:00', timestamp '2026-09-20 12:00:00',
  0, 0, null, null, null, 0, null, null, 0, 0, 0, 0,
  '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb, 0,
  pg_catalog.jsonb_build_object('MCP', fixture.booking_count),
  pg_catalog.jsonb_build_object('FIXTURE', fixture.booking_count),
  pg_catalog.jsonb_build_object('UNMAPPED', fixture.booking_count),
  0, null, null, null, null, null, null, null, 0, null, null,
  0, 0, 0, 0, fixture.booking_count, date '2026-09-29',
  'CUSTOMER_360_RELATED_GROUP_ANALYTICS_V1', statement_timestamp()
from fixture;

with fixture as materialized (
  select pg_catalog.row_number() over (order by analytics.group_id)::integer as ordinal,
    analytics.snapshot_id, analytics.group_id, group_row.profile_count
  from public.customer_related_review_group_analytics analytics
  join public.customer_related_review_groups group_row
    on group_row.snapshot_id = analytics.snapshot_id and group_row.group_id = analytics.group_id
  order by analytics.group_id
)
insert into public.customer_related_review_contact_candidates (
  snapshot_id, group_id, type, normalized_value, display_value, relation, sources,
  source_count, first_seen_at, last_seen_at, booking_count, profile_count,
  current_group_membership, conflict_involvement, contradictory_signals,
  same_phone_history, same_email_history, quality_flags, eligibility_status,
  eligibility_reason_codes, policy_version
)
select fixture.snapshot_id, fixture.group_id, 'email', 'fixture@example.invalid',
  'fixture@example.invalid', 'observed_in_group', array['MCP_EAP']::text[], 1,
  timestamp '2026-09-01 12:00:00', timestamp '2026-09-20 12:00:00', 1,
  fixture.profile_count, true, false, null::boolean, null::boolean, null::boolean,
  array['NORMALIZED_SOURCE_VALUE']::text[], 'REVIEW',
  array['AUTOMATION_NOT_AUTHORIZED_V1']::text[], 'RELATED_CONTACTABILITY_V1'
from fixture
where fixture.ordinal = 2
union all
select fixture.snapshot_id, fixture.group_id, 'phone', phone.value, phone.value,
  'observed_in_group', array['MCP_EAP']::text[], 1,
  timestamp '2026-09-01 12:00:00', timestamp '2026-09-20 12:00:00', 1,
  fixture.profile_count, true, true, null::boolean, null::boolean, null::boolean,
  array['NORMALIZED_SOURCE_VALUE']::text[], 'BLOCKED',
  array['AUTOMATION_NOT_AUTHORIZED_V1', 'MULTIPLE_PHONES_IN_GROUP']::text[],
  'RELATED_CONTACTABILITY_V1'
from fixture
cross join (values ('56900000001'::text), ('56900000002'::text)) phone(value)
where fixture.ordinal = 3;

do $harness$
declare
  v_group record;
  v_payload jsonb;
  v_stale record;
begin
  for v_group in
    select pg_catalog.row_number() over (order by analytics.group_id)::integer as ordinal,
      analytics.snapshot_id, analytics.group_id
    from public.customer_related_review_group_analytics analytics
    order by analytics.group_id
  loop
    v_payload := public.customer_window_360_v1_get_related_group_analytics(
      pg_catalog.jsonb_build_object(
        'representationKey', 'related_review:' || v_group.group_id,
        'representationType', 'related_review',
        'representationId', v_group.group_id,
        'customerUniverse', 'MCP_EAP',
        'authoritySnapshotId', v_group.snapshot_id
      )
    );

    if v_payload #>> '{contractVersion}' <> 'CUSTOMER_360_RELATED_GROUP_ANALYTICS_V1'
      or v_payload #>> '{scope,entity}' <> 'related_group'
      or v_payload #>> '{scope,semantics}' <> 'group_observed'
      or v_payload #>> '{origin,sourceCoverage}' <> 'MCP_EAP'
      or (v_payload #>> '{contactability,automationEnabled}')::boolean is not false
      or v_payload #>> '{contactability,historicalEvidence,detailSurface}' <> 'identity' then
      raise exception 'rpc_contract_mismatch_for_group_%', v_group.ordinal;
    end if;

    if v_group.ordinal = 1 and pg_catalog.jsonb_array_length(
      v_payload #> '{contactability,candidates}'
    ) <> 0 then
      raise exception 'zero_candidate_case_failed';
    elsif v_group.ordinal = 2 and (
      pg_catalog.jsonb_array_length(v_payload #> '{contactability,candidates}') <> 1
      or v_payload #>> '{contactability,primaryContactCandidate,email,eligibility,status}' <> 'REVIEW'
    ) then
      raise exception 'single_review_candidate_case_failed';
    elsif v_group.ordinal = 3 and (
      pg_catalog.jsonb_array_length(v_payload #> '{contactability,candidates}') <> 2
      or v_payload #> '{contactability,primaryContactCandidate,phone}' <> 'null'::jsonb
      or v_payload #>> '{activity,packBookings}' <> '1'
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_payload #> '{contactability,candidates}') item
        where item #>> '{eligibility,status}' <> 'BLOCKED'
      )
    ) then
      raise exception 'ambiguous_blocked_candidate_case_failed';
    end if;

    if v_payload::text like '%ELIGIBLE%' or v_payload::text like '%OKP%booking%' then
      raise exception 'forbidden_automation_or_okp_activity_contract';
    end if;
  end loop;

  select snapshot.snapshot_id, group_row.group_id
  into v_stale
  from public.customer_related_review_snapshots snapshot
  join public.customer_related_review_groups group_row
    on group_row.snapshot_id = snapshot.snapshot_id
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and snapshot.status = 'superseded'
  order by snapshot.superseded_at desc nulls last, group_row.group_id
  limit 1;

  if not found then
    raise exception 'superseded_related_group_required';
  end if;

  begin
    perform public.customer_window_360_v1_get_related_group_analytics(
      pg_catalog.jsonb_build_object(
        'representationKey', 'related_review:' || v_stale.group_id,
        'representationType', 'related_review',
        'representationId', v_stale.group_id,
        'customerUniverse', 'MCP_EAP',
        'authoritySnapshotId', v_stale.snapshot_id
      )
    );
    raise exception 'stale_locator_was_accepted';
  exception
    when sqlstate '40001' then null;
  end;

  begin
    insert into public.customer_related_review_contact_candidates (
      snapshot_id, group_id, type, normalized_value, display_value, relation, sources,
      source_count, first_seen_at, last_seen_at, booking_count, profile_count,
      current_group_membership, conflict_involvement, quality_flags,
      eligibility_status, eligibility_reason_codes, policy_version
    )
    select snapshot_id, group_id, 'email', 'forbidden@example.invalid',
      'forbidden@example.invalid', 'observed_in_group', array['MCP_EAP']::text[], 1,
      timestamp '2026-09-01 12:00:00', timestamp '2026-09-01 12:00:00', 1,
      profile_count, true, false, array[]::text[], 'ELIGIBLE',
      array['AUTOMATION_NOT_AUTHORIZED_V1']::text[], 'RELATED_CONTACTABILITY_V1'
    from (
      select analytics.snapshot_id, analytics.group_id, group_row.profile_count
      from public.customer_related_review_group_analytics analytics
      join public.customer_related_review_groups group_row
        on group_row.snapshot_id = analytics.snapshot_id
        and group_row.group_id = analytics.group_id
      order by analytics.group_id
      limit 1
    ) fixture;
    raise exception 'eligible_status_was_accepted';
  exception
    when check_violation then null;
  end;
end;
$harness$;

do $harness$
declare
  v_proc oid := 'public.customer_window_360_v1_get_related_group_analytics(jsonb)'::regprocedure;
begin
  if not pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE')
    or exists (
      select 1
      from pg_catalog.aclexplode(coalesce(
        (select procedure.proacl from pg_catalog.pg_proc procedure where procedure.oid = v_proc),
        pg_catalog.acldefault('f', (select procedure.proowner
          from pg_catalog.pg_proc procedure where procedure.oid = v_proc))
      )) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) then
    raise exception 'rpc_acl_mismatch';
  end if;
  if pg_catalog.has_table_privilege('service_role',
      'public.customer_related_review_group_analytics', 'SELECT')
    or pg_catalog.has_table_privilege('service_role',
      'public.customer_related_review_contact_candidates', 'SELECT') then
    raise exception 'service_role_direct_table_access';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc procedure
    where procedure.oid = v_proc and procedure.provolatile = 's'
      and procedure.prosecdef is true
      and pg_catalog.array_length(procedure.proconfig, 1) = 1
      and procedure.proconfig[1] in ('search_path=', 'search_path=""')
  ) then
    raise exception 'rpc_security_contract_mismatch';
  end if;
  if (select count(*) from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid in (
        'public.customer_related_review_group_analytics'::regclass,
        'public.customer_related_review_contact_candidates'::regclass
      ) and constraint_row.contype = 'f' and constraint_row.confdeltype = 'c') <> 2 then
    raise exception 'snapshot_group_cascade_contract_mismatch';
  end if;
end;
$harness$;

select
  (select count(*) from public.customer_related_review_group_analytics) = 3
    as analytics_fixture_count_ok,
  (select count(*) from public.customer_related_review_contact_candidates) = 3
    as candidate_fixture_count_ok,
  true as zero_one_multiple_candidates_ok,
  true as review_blocked_only_ok,
  true as stale_fail_closed_ok,
  true as acl_ok,
  true as cascade_contract_ok,
  true as reversible_test_ok;

rollback;

select
  pg_catalog.to_regclass('public.customer_related_review_group_analytics') is null
    as analytics_table_absent_after_rollback,
  pg_catalog.to_regclass('public.customer_related_review_contact_candidates') is null
    as candidates_table_absent_after_rollback,
  pg_catalog.to_regprocedure(
    'public.customer_window_360_v1_get_related_group_analytics(jsonb)'
  ) is null as rpc_absent_after_rollback;
