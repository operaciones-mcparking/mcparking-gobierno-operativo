\set ON_ERROR_STOP on

select pg_catalog.md5(procedure.prosrc) as original_definition_md5
from pg_catalog.pg_proc procedure
join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname = 'customer_window_v2_list_representations_by_purchase_period'
  and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
    'p_from date, p_to date, p_page integer, p_page_size integer'
\gset

begin;

set local lock_timeout = '30s';
set local statement_timeout = '10min';
set local idle_in_transaction_session_timeout = '12min';

create temporary table rr_v2_period_original_definition on commit drop as
select
  procedure.oid,
  pg_catalog.pg_get_functiondef(procedure.oid) as definition,
  pg_catalog.md5(procedure.prosrc) as definition_md5
from pg_catalog.pg_proc procedure
join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname = 'customer_window_v2_list_representations_by_purchase_period'
  and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
    'p_from date, p_to date, p_page integer, p_page_size integer';

do $$
begin
  if (select count(*) from rr_v2_period_original_definition) <> 1 then
    raise exception 'Expected exactly one installed period-list RPC';
  end if;
end;
$$;

create temporary table rr_v2_period_context on commit drop as
with active as (
  select authority.snapshot_id
  from public.customer_window_mcp_eap_active_snapshot_authority_v2 authority
  where authority.active_snapshot_count = 1
    and authority.snapshot_id is not null
),
daily as (
  select
    booking.source_created_at::date as period_day,
    count(distinct representation.representation_key) filter (
      where representation.representation_type = 'confirmed_customer'
    ) as confirmed_count,
    count(distinct representation.representation_key) filter (
      where representation.representation_type = 'related_review'
    ) as related_count
  from public.customer_source_bookings_mcp_eap booking
  join public.customer_window_mcp_eap_representations_v2 representation
    on representation.snapshot_id = (select snapshot_id from active)
   and representation.source = booking.source
   and representation.source_row_id = booking.source_row_id
  where booking.source = 'MCP_EAP'
    and booking.booking_status in (1, 8)
  group by booking.source_created_at::date
),
bounds as (
  select
    min(period_day) as min_day,
    max(period_day) as max_day,
    max(period_day) filter (where confirmed_count > 0 and related_count > 0) as mixed_day
  from daily
)
select
  active.snapshot_id,
  bounds.min_day,
  bounds.max_day,
  coalesce(bounds.mixed_day, bounds.max_day) as test_day,
  (bounds.min_day - 2) as empty_day
from active cross join bounds;

do $$
begin
  if (select count(*) from rr_v2_period_context) <> 1
    or (select test_day is null from rr_v2_period_context) then
    raise exception 'A single active snapshot with valid MCP/EAP bookings is required';
  end if;
end;
$$;

create temporary table rr_v2_period_pages on commit drop as
with first_result as (
  select public.customer_window_v2_list_representations_by_purchase_period(
    context.test_day, context.test_day, 1, 25
  ) as payload
  from rr_v2_period_context context
),
page_numbers as (
  select generate_series(
    1,
    greatest(1, ceil((first_result.payload->>'total')::numeric / 25)::integer)
  ) as page
  from first_result
),
payloads as (
  select
    page_numbers.page,
    public.customer_window_v2_list_representations_by_purchase_period(
      context.test_day, context.test_day, page_numbers.page, 25
    ) as payload
  from page_numbers cross join rr_v2_period_context context
)
select
  payloads.page,
  payloads.payload,
  count(*) filter (where item->>'representationType' = 'confirmed_customer') as confirmed_items,
  count(*) filter (where item->>'representationType' = 'related_review') as related_items
from payloads
left join lateral pg_catalog.jsonb_array_elements(payloads.payload->'items') item on true
group by payloads.page, payloads.payload;

do $$
begin
  if (select max(page) from rr_v2_period_pages) < 2 then
    raise exception 'The selected period does not provide a real second page';
  end if;
  if not exists (select 1 from rr_v2_period_pages where confirmed_items > 0) then
    raise exception 'The selected period has no confirmed page';
  end if;
  if not exists (select 1 from rr_v2_period_pages where related_items > 0) then
    raise exception 'The selected period has no related page';
  end if;
  if not exists (
    select 1 from rr_v2_period_pages where confirmed_items > 0 and related_items > 0
  ) then
    raise exception 'The selected period has no mixed page';
  end if;
end;
$$;

create temporary table rr_v2_period_cases (
  case_name text primary key,
  date_from date not null,
  date_to date not null,
  page integer not null,
  page_size integer not null
) on commit drop;

insert into rr_v2_period_cases(case_name, date_from, date_to, page, page_size)
select 'page_1', test_day, test_day, 1, 25 from rr_v2_period_context
union all
select 'page_2', test_day, test_day, least(2, (select max(page) from rr_v2_period_pages)), 25
from rr_v2_period_context
union all
select 'last_page', test_day, test_day, (select max(page) from rr_v2_period_pages), 25
from rr_v2_period_context
union all
select 'empty_period', empty_day, empty_day, 1, 25 from rr_v2_period_context
union all
select 'long_range', min_day, max_day, 1, 25 from rr_v2_period_context
union all
select 'confirmed_page', test_day, test_day,
  coalesce((select min(page) from rr_v2_period_pages where confirmed_items > 0), 1), 25
from rr_v2_period_context
union all
select 'related_page', test_day, test_day,
  coalesce((select min(page) from rr_v2_period_pages where related_items > 0), 1), 25
from rr_v2_period_context
union all
select 'mixed_page', test_day, test_day,
  coalesce((select min(page) from rr_v2_period_pages where confirmed_items > 0 and related_items > 0), 1), 25
from rr_v2_period_context;

create temporary table rr_v2_period_baseline on commit drop as
select
  cases.*,
  public.customer_window_v2_list_representations_by_purchase_period(
    cases.date_from, cases.date_to, cases.page, cases.page_size
  ) as baseline_payload,
  0::bigint as baseline_missing_metrics
from rr_v2_period_cases cases;

do $install$
declare
  v_definition text;
  v_old text := $old$  related_contact_observations as materialized (
    select
      paged.representation_key,
      observation.identity_type,
      observation.normalized_value,
      observation.raw_value,
      booking.source_created_at,
      booking.source_row_id
    from paged
    join public.customer_window_mcp_eap_representations_v2 representation
      on paged.representation_type = 'related_review'
     and representation.snapshot_id = paged.snapshot_id
     and representation.representation_type = paged.representation_type
     and representation.representation_id = paged.representation_id
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = representation.source
     and booking.source_row_id = representation.source_row_id
     and booking.source = 'MCP_EAP'
     and booking.booking_status in (1, 8)
    cross join lateral (
      values
        ('email'::text, nullif(booking.email_normalized, ''), nullif(pg_catalog.btrim(booking.email_raw), '')),
        ('phone'::text, nullif(booking.phone_normalized, ''), nullif(pg_catalog.btrim(booking.phone_raw), ''))
    ) observation(identity_type, normalized_value, raw_value)
    where observation.normalized_value is not null
  ),$old$;
  v_new text := $new$  related_contact_observations as materialized (
    select
      paged.representation_key,
      observation.identity_type,
      observation.normalized_value,
      observation.raw_value,
      booking.source_created_at,
      booking.source_row_id
    from paged
    join public.customer_analytical_booking_assignments assignment
      on paged.representation_type = 'related_review'
     and assignment.snapshot_id = paged.snapshot_id
     and assignment.representation_type = 'related_review'
     and assignment.related_group_id = paged.related_group_id
     and assignment.customer_id is null
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = assignment.source
     and booking.source_row_id = assignment.source_row_id
     and booking.source = 'MCP_EAP'
     and booking.booking_status in (1, 8)
    cross join lateral (
      values
        ('email'::text, nullif(booking.email_normalized, ''), nullif(pg_catalog.btrim(booking.email_raw), '')),
        ('phone'::text, nullif(booking.phone_normalized, ''), nullif(pg_catalog.btrim(booking.phone_raw), ''))
    ) observation(identity_type, normalized_value, raw_value)
    where observation.normalized_value is not null
  ),$new$;
begin
  select definition into strict v_definition from rr_v2_period_original_definition;
  if pg_catalog.strpos(v_definition, v_old) = 0 then
    raise exception 'Installed RPC does not contain the expected legacy related-contact block';
  end if;
  execute pg_catalog.replace(v_definition, v_old, v_new);
end;
$install$;

create temporary table rr_v2_period_optimized on commit drop as
select
  baseline.*,
  public.customer_window_v2_list_representations_by_purchase_period(
    baseline.date_from, baseline.date_to, baseline.page, baseline.page_size
  ) as optimized_payload,
  0::bigint as optimized_missing_metrics
from rr_v2_period_baseline baseline;

create temporary table rr_v2_period_parity on commit drop as
select
  case_name,
  baseline_payload = optimized_payload as json_exact,
  baseline_payload->>'total' = optimized_payload->>'total' as total_exact,
  baseline_payload->'items' = optimized_payload->'items' as items_exact,
  ((
    select pg_catalog.jsonb_agg(item->>'representationKey' order by ordinal)
    from pg_catalog.jsonb_array_elements(baseline_payload->'items') with ordinality values(item, ordinal)
  ) is not distinct from (
    select pg_catalog.jsonb_agg(item->>'representationKey' order by ordinal)
    from pg_catalog.jsonb_array_elements(optimized_payload->'items') with ordinality values(item, ordinal)
  )) as order_exact,
  ((
    select pg_catalog.jsonb_agg(item->'contactSummary' order by ordinal)
    from pg_catalog.jsonb_array_elements(baseline_payload->'items') with ordinality values(item, ordinal)
  ) is not distinct from (
    select pg_catalog.jsonb_agg(item->'contactSummary' order by ordinal)
    from pg_catalog.jsonb_array_elements(optimized_payload->'items') with ordinality values(item, ordinal)
  )) as contacts_exact,
  baseline_missing_metrics = optimized_missing_metrics as missing_metrics_exact
from rr_v2_period_optimized;

do $$
begin
  if exists (
    select 1 from rr_v2_period_parity
    where json_exact is not true
       or total_exact is not true
       or items_exact is not true
       or order_exact is not true
       or contacts_exact is not true
       or missing_metrics_exact is not true
  ) then
    raise exception 'Optimized period-list RPC changed the external result';
  end if;
end;
$$;

create or replace function pg_temp.rr_v2_explain(p_sql text)
returns jsonb
language plpgsql
as $$
declare
  v_plan jsonb;
begin
  execute 'explain (analyze, buffers, verbose, settings, format json) ' || p_sql into v_plan;
  return v_plan;
end;
$$;

create temporary table rr_v2_period_plan on commit drop as
select pg_temp.rr_v2_explain(pg_catalog.format(
  $sql$select assignment.source, assignment.source_row_id
       from public.customer_analytical_booking_assignments assignment
       where assignment.snapshot_id = %L::uuid
         and assignment.representation_type = 'related_review'
         and assignment.related_group_id = %L
         and assignment.customer_id is null$sql$,
  context.snapshot_id,
  (
    select item->>'relatedGroupId'
    from rr_v2_period_optimized optimized
    cross join lateral pg_catalog.jsonb_array_elements(optimized.optimized_payload->'items') item
    where item->>'representationType' = 'related_review'
      and item->>'relatedGroupId' is not null
    limit 1
  )
)) as plan
from rr_v2_period_context context;

do $$
declare
  v_plan jsonb;
begin
  select plan into strict v_plan from rr_v2_period_plan;
  if not pg_catalog.jsonb_path_exists(
    v_plan,
    '$.** ? (@."Index Name" == "customer_analytical_booking_assignments_group_idx")'
  ) then
    raise exception 'Optimized related-group lookup did not use the existing group index';
  end if;
  if (v_plan->0->>'Execution Time')::numeric >= 30000 then
    raise exception 'Optimized related-group lookup exceeded the 30 second harness ceiling';
  end if;
end;
$$;

select
  case_name,
  json_exact,
  total_exact,
  items_exact,
  order_exact,
  contacts_exact,
  missing_metrics_exact
from rr_v2_period_parity
order by case_name;

select
  pg_catalog.jsonb_path_exists(
    plan,
    '$.** ? (@."Index Name" == "customer_analytical_booking_assignments_group_idx")'
  ) as group_index_used,
  (plan->0->>'Planning Time')::numeric as planning_time_ms,
  (plan->0->>'Execution Time')::numeric as execution_time_ms
from rr_v2_period_plan;

rollback;

select
  pg_catalog.md5(procedure.prosrc) = :'original_definition_md5' as definition_restored,
  pg_catalog.md5(procedure.prosrc) as restored_definition_md5,
  :'original_definition_md5' as original_definition_md5,
  pg_catalog.to_regprocedure('pg_temp.rr_v2_explain(text)') is null as temporary_helper_removed,
  (
    select count(*)
    from pg_catalog.pg_proc extra
    join pg_catalog.pg_namespace namespace on namespace.oid = extra.pronamespace
    where namespace.nspname = 'public'
      and extra.proname like 'rr_v2_%'
  ) = 0 as objects_extra_persisted_zero
from pg_catalog.pg_proc procedure
join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname = 'customer_window_v2_list_representations_by_purchase_period'
  and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
    'p_from date, p_to date, p_page integer, p_page_size integer';
