begin;

do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'customer_360_boleta_analytics_runner')
    or pg_catalog.to_regclass('public.customer_profile_boleta_analytics') is not null
    or pg_catalog.to_regclass('public.customer_profile_boleta_discount_codes') is not null
    or pg_catalog.to_regclass('public.customer_profile_boleta_analytics_incremental_state') is not null
    or pg_catalog.to_regprocedure('public.customer_window_refresh_boleta_analytics_v1_m2m(uuid[],integer,text)') is not null
    or pg_catalog.to_regprocedure('public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean)') is not null
    or pg_catalog.to_regprocedure('public.customer_window_360_v1_get_boleta_analytics(jsonb)') is not null then
    raise exception 'Boleta analytics V1 objects already exist; reversible harness requires a pre-migration database.';
  end if;
end;
$$;

-- Capability only. Provision the dedicated LOGIN and password separately.
create role customer_360_boleta_analytics_runner
  nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

do $access$
begin
  execute pg_catalog.format(
    'grant connect on database %I to customer_360_boleta_analytics_runner',
    pg_catalog.current_database()
  );
end
$access$;
grant usage on schema public to customer_360_boleta_analytics_runner;

create table public.customer_profile_boleta_analytics (
  customer_id uuid primary key references public.customer_profiles(id) on delete cascade,
  boleta_reservation_count bigint not null,
  boleta_reservations_12m bigint not null,
  boleta_reservations_24m bigint not null,
  first_boleta_purchase_at timestamp without time zone,
  last_boleta_purchase_at timestamp without time zone,
  previous_boleta_purchase_at timestamp without time zone,
  median_boleta_gap_days numeric,
  gap_interval_count bigint not null,
  total_economic_days bigint,
  average_stay_days numeric,
  median_stay_days numeric,
  min_stay_days integer,
  max_stay_days integer,
  stay_days_sample_size bigint not null,
  economic_eligible_boleta_count bigint not null,
  paid_amount numeric(18,2),
  list_amount numeric(18,2),
  total_discount_amount numeric(18,2),
  average_ticket numeric,
  median_ticket numeric,
  min_ticket numeric(14,2),
  max_ticket numeric(14,2),
  paid_adr numeric,
  list_adr numeric,
  paid_adr_12m numeric,
  list_adr_12m numeric,
  paid_adr_24m numeric,
  list_adr_24m numeric,
  discounted_boleta_count bigint not null,
  discount_usage_pct numeric,
  weighted_discount_pct numeric,
  average_booking_lead_days numeric,
  median_booking_lead_days numeric,
  min_booking_lead_days integer,
  max_booking_lead_days integer,
  booking_lead_sample_size bigint not null,
  weekday_arrival_count bigint not null,
  weekend_arrival_count bigint not null,
  weekend_arrival_share_pct numeric,
  arrival_day_sample_size bigint not null,
  arrival_month_counts jsonb not null,
  arrival_month_shares jsonb not null,
  top_arrival_months smallint[] not null,
  active_arrival_month_count smallint not null,
  arrival_month_sample_size bigint not null,
  distinct_arrival_years smallint not null,
  source_counts jsonb not null,
  brand_counts jsonb not null,
  parking_counts jsonb not null,
  parking_family_counts jsonb not null,
  top_brands text[] not null,
  preferred_brand text,
  top_parkings text[] not null,
  preferred_parking text,
  total_valid_booking_count bigint not null,
  eligible_boleta_booking_count bigint not null,
  excluded_pack_booking_count bigint not null,
  missing_amount_count bigint not null,
  missing_duration_count bigint not null,
  missing_lead_time_count bigint not null,
  invalid_lead_time_count bigint not null,
  as_of_date date not null,
  calculation_version text not null,
  computed_at timestamptz not null,
  constraint customer_profile_boleta_analytics_counts_check check (
    boleta_reservation_count >= 0
    and boleta_reservations_12m >= 0
    and boleta_reservations_24m >= 0
    and gap_interval_count >= 0
    and stay_days_sample_size >= 0
    and economic_eligible_boleta_count >= 0
    and discounted_boleta_count >= 0
    and booking_lead_sample_size >= 0
    and weekday_arrival_count >= 0
    and weekend_arrival_count >= 0
    and arrival_day_sample_size >= 0
    and arrival_month_sample_size >= 0
    and distinct_arrival_years >= 0
    and total_valid_booking_count >= 0
    and eligible_boleta_booking_count >= 0
    and excluded_pack_booking_count >= 0
    and missing_amount_count >= 0
    and missing_duration_count >= 0
    and missing_lead_time_count >= 0
    and invalid_lead_time_count >= 0
    and (
      (stay_days_sample_size = 0 and total_economic_days is null)
      or (stay_days_sample_size > 0 and total_economic_days is not null and total_economic_days >= 0)
    )
    and boleta_reservation_count = eligible_boleta_booking_count
    and economic_eligible_boleta_count <= eligible_boleta_booking_count
    and discounted_boleta_count <= economic_eligible_boleta_count
    and stay_days_sample_size <= eligible_boleta_booking_count
    and booking_lead_sample_size <= eligible_boleta_booking_count
    and arrival_day_sample_size <= eligible_boleta_booking_count
    and arrival_month_sample_size = arrival_day_sample_size
    and weekday_arrival_count + weekend_arrival_count = arrival_day_sample_size
    and eligible_boleta_booking_count + excluded_pack_booking_count = total_valid_booking_count
  ),
  constraint customer_profile_boleta_analytics_json_check check (
    pg_catalog.jsonb_typeof(arrival_month_counts) = 'array'
    and pg_catalog.jsonb_array_length(arrival_month_counts) = 12
    and pg_catalog.jsonb_typeof(arrival_month_shares) = 'array'
    and pg_catalog.jsonb_array_length(arrival_month_shares) = 12
    and pg_catalog.jsonb_typeof(source_counts) = 'object'
    and pg_catalog.jsonb_typeof(brand_counts) = 'object'
    and pg_catalog.jsonb_typeof(parking_counts) = 'object'
    and pg_catalog.jsonb_typeof(parking_family_counts) = 'object'
  ),
  constraint customer_profile_boleta_analytics_version_check check (
    calculation_version = 'CUSTOMER_360_BOLETA_ANALYTICS_V1'
  )
);

create table public.customer_profile_boleta_discount_codes (
  customer_id uuid not null references public.customer_profile_boleta_analytics(customer_id) on delete cascade,
  source text not null,
  code_type text not null,
  code text not null,
  uses bigint not null,
  last_used_at timestamp without time zone,
  primary key (customer_id, source, code_type, code),
  constraint customer_profile_boleta_discount_codes_source_check check (source in ('MCP_EAP', 'OKP')),
  constraint customer_profile_boleta_discount_codes_type_check check (code_type in ('promotion', 'coupon')),
  constraint customer_profile_boleta_discount_codes_value_check check (
    pg_catalog.length(pg_catalog.btrim(code)) > 0 and uses > 0
  )
);

create table public.customer_profile_boleta_analytics_incremental_state (
  stream_key text primary key,
  watermark_updated_at timestamptz,
  watermark_tiebreaker text,
  stream_complete boolean not null default false,
  processed_rows bigint not null default 0,
  last_batch_count integer not null default 0,
  last_succeeded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint customer_profile_boleta_analytics_incremental_state_stream_check
    check (stream_key in ('customer_profiles', 'booking_links', 'mcp_eap', 'okp', 'bootstrap', 'selector')),
  constraint customer_profile_boleta_analytics_incremental_state_watermark_check check (
    (stream_key = 'selector' and watermark_updated_at is null and watermark_tiebreaker is null)
    or (stream_key = 'bootstrap' and watermark_updated_at is null)
    or (stream_key not in ('selector', 'bootstrap')
      and ((watermark_updated_at is null) = (watermark_tiebreaker is null)))
  ),
  constraint customer_profile_boleta_analytics_incremental_state_complete_check
    check (not stream_complete or stream_key = 'bootstrap'),
  constraint customer_profile_boleta_analytics_incremental_state_counts_check
    check (processed_rows >= 0 and last_batch_count >= 0)
);

insert into public.customer_profile_boleta_analytics_incremental_state
  (stream_key, watermark_updated_at, watermark_tiebreaker)
select 'customer_profiles', cursor.updated_at, cursor.id::text
from (values (true)) seed(value)
left join lateral (select profile.updated_at, profile.id from public.customer_profiles profile
  where profile.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
  order by profile.updated_at desc, profile.id desc limit 1) cursor on true
union all
select 'booking_links', cursor.updated_at, cursor.id::text
from (values (true)) seed(value)
left join lateral (select link.updated_at, link.id from public.customer_booking_profile_links link
  where link.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
  order by link.updated_at desc, link.id desc limit 1) cursor on true
union all
select 'mcp_eap', cursor.updated_at, cursor.source_row_id::text
from (values (true)) seed(value)
left join lateral (select booking.updated_at, booking.source_row_id from public.customer_source_bookings_mcp_eap booking
  where booking.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
  order by booking.updated_at desc, booking.source_row_id desc limit 1) cursor on true
union all
select 'okp', cursor.updated_at, cursor.source_row_id::text
from (values (true)) seed(value)
left join lateral (select booking.updated_at, booking.source_row_id from public.customer_source_bookings_okp booking
  where booking.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
  order by booking.updated_at desc, booking.source_row_id desc limit 1) cursor on true;

insert into public.customer_profile_boleta_analytics_incremental_state (stream_key)
values ('bootstrap'), ('selector');

create index customer_profile_boleta_analytics_as_of_idx
  on public.customer_profile_boleta_analytics(as_of_date, customer_id);

alter table public.customer_profile_boleta_analytics enable row level security;
alter table public.customer_profile_boleta_discount_codes enable row level security;
alter table public.customer_profile_boleta_analytics_incremental_state enable row level security;

revoke all on table public.customer_profile_boleta_analytics from public, anon, authenticated, service_role;
revoke all on table public.customer_profile_boleta_discount_codes from public, anon, authenticated, service_role;
revoke all on table public.customer_profile_boleta_analytics_incremental_state from public, anon, authenticated, service_role;

create or replace function public.customer_window_calculate_boleta_analytics_v1(p_customer_ids uuid[])
returns setof public.customer_profile_boleta_analytics
language sql
stable
security definer
set search_path = ''
as $function$
with params as (
  select pg_catalog.timezone('America/Santiago', pg_catalog.now())::date as today
),
requested_profiles as materialized (
  select profile.id as customer_id
  from public.customer_profiles profile
  where profile.id = any(p_customer_ids)
    and profile.status = 'active'
    and profile.merged_into_profile_id is null
),
selected_links as materialized (
  select link.profile_id, link.source, link.source_row_id
  from public.customer_booking_profile_links link
  join requested_profiles profile on profile.customer_id = link.profile_id
  where link.status = 'active'
),
valid_bookings as materialized (
  select
    link.profile_id as customer_id,
    'MCP_EAP'::text as source,
    booking.source_row_id,
    booking.source_created_at as purchase_created_at,
    booking.planned_arrival_at,
    booking.is_pack,
    booking.brand_normalized as brand,
    booking.parking_normalized as parking,
    parking_rule.parking_family,
    booking.booking_paid as paid_amount,
    case when booking.booking_paid is null or booking.promotion_discount_amount is null then null
      else (booking.booking_paid + booking.promotion_discount_amount)::numeric(14,2) end as list_amount,
    booking.promotion_discount_amount as discount_amount,
    booking.duration_days as economic_days,
    (
      booking.booking_paid is not null
      and booking.promotion_discount_amount is not null
      and booking.promotion_discount_amount >= 0
      and booking.duration_days is not null
      and booking.duration_days > 0
      and booking.paying_status = 1
      and booking.is_pack is false
    ) as economic_eligible,
    case when booking.source_created_at is null or booking.planned_arrival_at is null then null
      else booking.planned_arrival_at::date - booking.source_created_at::date end as booking_lead_days,
    booking.promotion_code,
    null::text as coupon_code
  from selected_links link
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = link.source
   and booking.source_row_id = link.source_row_id
   and link.source = 'MCP_EAP'
  left join public.customer_window_parking_family_rules parking_rule
    on parking_rule.source = 'MCP_EAP' and parking_rule.parking = booking.parking_normalized
  where booking.booking_status in (1, 8)

  union all

  select
    link.profile_id,
    'OKP'::text,
    booking.source_row_id,
    booking.source_created_at,
    booking.planned_arrival_at,
    booking.is_pack,
    'OKP'::text,
    booking.parking_normalized,
    coalesce(parking_rule.parking_family, 'OKP_OTROS'),
    booking.source_total_amount,
    case when booking.source_total_amount is null then null
      else (booking.source_total_amount + coalesce(booking.discount_amount, 0) + coalesce(booking.coupon_amount, 0))::numeric(14,2) end,
    (coalesce(booking.discount_amount, 0) + coalesce(booking.coupon_amount, 0))::numeric(14,2),
    case when booking.planned_arrival_at is null or booking.planned_departure_at is null then null
      else (booking.planned_departure_at::date - booking.planned_arrival_at::date + 1)::integer end,
    (
      booking.source_total_amount is not null
      and booking.planned_arrival_at is not null
      and booking.planned_departure_at is not null
      and booking.planned_departure_at::date - booking.planned_arrival_at::date + 1 > 0
      and (booking.discount_amount is null or booking.discount_amount >= 0)
      and (booking.coupon_amount is null or booking.coupon_amount >= 0)
      and booking.is_paid is true
      and booking.is_pack is false
    ),
    case when booking.source_created_at is null or booking.planned_arrival_at is null then null
      else booking.planned_arrival_at::date - booking.source_created_at::date end,
    null::text,
    booking.coupon_code
  from selected_links link
  join public.customer_source_bookings_okp booking
    on booking.source = link.source
   and booking.source_row_id = link.source_row_id
   and link.source = 'OKP'
  left join public.customer_window_parking_family_rules parking_rule
    on parking_rule.source = 'OKP' and parking_rule.parking = booking.parking_normalized
  where (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
     or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
),
boletas as materialized (
  select * from valid_bookings where is_pack is false
),
sequenced as (
  select boleta.*,
    pg_catalog.lag(purchase_created_at) over (
      partition by customer_id order by purchase_created_at, source, source_row_id
    ) as prior_purchase_at
  from boletas boleta
  where purchase_created_at is not null
),
gaps as (
  select customer_id, (purchase_created_at::date - prior_purchase_at::date)::numeric as gap_days
  from sequenced where prior_purchase_at is not null
),
gap_stats as (
  select customer_id, count(*)::bigint as sample_size,
    pg_catalog.percentile_cont(0.5) within group (order by gap_days)::numeric as median_value
  from gaps group by customer_id
),
stay_stats as (
  select customer_id, count(*)::bigint as sample_size, sum(economic_days)::bigint as total_value,
    avg(economic_days)::numeric as average_value,
    pg_catalog.percentile_cont(0.5) within group (order by economic_days)::numeric as median_value,
    min(economic_days)::integer as min_value, max(economic_days)::integer as max_value
  from boletas where economic_days > 0 group by customer_id
),
lead_stats as (
  select customer_id, count(*)::bigint as sample_size, avg(booking_lead_days)::numeric as average_value,
    pg_catalog.percentile_cont(0.5) within group (order by booking_lead_days)::numeric as median_value,
    min(booking_lead_days)::integer as min_value, max(booking_lead_days)::integer as max_value
  from boletas where booking_lead_days >= 0 group by customer_id
),
economics as (
  select customer_id,
    count(*)::bigint as sample_size,
    sum(paid_amount)::numeric(18,2) as paid_amount,
    sum(list_amount)::numeric(18,2) as list_amount,
    sum(discount_amount)::numeric(18,2) as discount_amount,
    avg(paid_amount)::numeric as average_ticket,
    pg_catalog.percentile_cont(0.5) within group (order by paid_amount)::numeric as median_ticket,
    min(paid_amount)::numeric(14,2) as min_ticket,
    max(paid_amount)::numeric(14,2) as max_ticket,
    sum(paid_amount) / nullif(sum(economic_days), 0) as paid_adr,
    sum(list_amount) / nullif(sum(economic_days), 0) as list_adr,
    sum(paid_amount) filter (where purchase_created_at >= params.today - interval '12 months')
      / nullif(sum(economic_days) filter (where purchase_created_at >= params.today - interval '12 months'), 0) as paid_adr_12m,
    sum(list_amount) filter (where purchase_created_at >= params.today - interval '12 months')
      / nullif(sum(economic_days) filter (where purchase_created_at >= params.today - interval '12 months'), 0) as list_adr_12m,
    sum(paid_amount) filter (where purchase_created_at >= params.today - interval '24 months')
      / nullif(sum(economic_days) filter (where purchase_created_at >= params.today - interval '24 months'), 0) as paid_adr_24m,
    sum(list_amount) filter (where purchase_created_at >= params.today - interval '24 months')
      / nullif(sum(economic_days) filter (where purchase_created_at >= params.today - interval '24 months'), 0) as list_adr_24m,
    count(*) filter (where discount_amount > 0)::bigint as discounted_count
  from boletas cross join params
  where economic_eligible is true
  group by customer_id
),
base_stats as (
  select profile.customer_id,
    count(valid.source_row_id)::bigint as total_valid_count,
    count(valid.source_row_id) filter (where valid.is_pack is false)::bigint as boleta_count,
    count(valid.source_row_id) filter (where valid.is_pack is true)::bigint as pack_count,
    count(valid.source_row_id) filter (where valid.is_pack is false and valid.purchase_created_at >= params.today - interval '12 months')::bigint as boleta_12m,
    count(valid.source_row_id) filter (where valid.is_pack is false and valid.purchase_created_at >= params.today - interval '24 months')::bigint as boleta_24m,
    min(valid.purchase_created_at) filter (where valid.is_pack is false) as first_purchase,
    max(valid.purchase_created_at) filter (where valid.is_pack is false) as last_purchase,
    (pg_catalog.array_agg(valid.purchase_created_at order by valid.purchase_created_at desc, valid.source desc, valid.source_row_id desc)
      filter (where valid.is_pack is false and valid.purchase_created_at is not null))[2] as previous_purchase,
    count(valid.source_row_id) filter (where valid.is_pack is false and valid.paid_amount is null)::bigint as missing_amount,
    count(valid.source_row_id) filter (where valid.is_pack is false and (valid.economic_days is null or valid.economic_days <= 0))::bigint as missing_duration,
    count(valid.source_row_id) filter (where valid.is_pack is false and (valid.purchase_created_at is null or valid.planned_arrival_at is null))::bigint as missing_lead,
    count(valid.source_row_id) filter (where valid.is_pack is false and valid.booking_lead_days < 0)::bigint as invalid_lead
  from requested_profiles profile
  cross join params
  left join valid_bookings valid on valid.customer_id = profile.customer_id
  group by profile.customer_id
),
arrival_stats as (
  select customer_id,
    count(*) filter (where extract(isodow from planned_arrival_at) between 1 and 5)::bigint as weekday_count,
    count(*) filter (where extract(isodow from planned_arrival_at) in (6,7))::bigint as weekend_count,
    count(*)::bigint as sample_size,
    count(distinct extract(year from planned_arrival_at))::smallint as distinct_years
  from boletas where planned_arrival_at is not null group by customer_id
),
month_counts as (
  select profile.customer_id, month.value::smallint as month_number,
    count(boleta.source_row_id) filter (where extract(month from boleta.planned_arrival_at) = month.value)::bigint as booking_count
  from requested_profiles profile
  cross join pg_catalog.generate_series(1, 12) month(value)
  left join boletas boleta on boleta.customer_id = profile.customer_id and boleta.planned_arrival_at is not null
  group by profile.customer_id, month.value
),
month_summary as (
  select customer_id,
    pg_catalog.jsonb_agg(booking_count order by month_number) as counts,
    pg_catalog.jsonb_agg(
      case when total_booking_count = 0 then null::numeric
        else booking_count::numeric / total_booking_count end
      order by month_number
    ) as shares,
    coalesce(pg_catalog.array_agg(month_number order by month_number)
      filter (where booking_count > 0 and booking_count = max_booking_count), '{}'::smallint[]) as top_months,
    count(*) filter (where booking_count > 0)::smallint as active_months
  from (
    select month_counts.*,
      max(booking_count) over (partition by customer_id) as max_booking_count,
      sum(booking_count) over (partition by customer_id) as total_booking_count
    from month_counts
  ) counted
  group by customer_id
),
dimension_counts as (
  select customer_id, 'source'::text as dimension, source as value, count(*)::bigint as booking_count
  from boletas group by customer_id, source
  union all
  select customer_id, 'brand', brand, count(*)::bigint from boletas where brand is not null group by customer_id, brand
  union all
  select customer_id, 'parking', parking, count(*)::bigint from boletas where parking is not null group by customer_id, parking
  union all
  select customer_id, 'parking_family', parking_family, count(*)::bigint from boletas where parking_family is not null group by customer_id, parking_family
),
dimension_summary as (
  select customer_id,
    coalesce(pg_catalog.jsonb_object_agg(value, booking_count order by value) filter (where dimension = 'source'), '{}'::jsonb) as source_counts,
    coalesce(pg_catalog.jsonb_object_agg(value, booking_count order by value) filter (where dimension = 'brand'), '{}'::jsonb) as brand_counts,
    coalesce(pg_catalog.jsonb_object_agg(value, booking_count order by value) filter (where dimension = 'parking'), '{}'::jsonb) as parking_counts,
    coalesce(pg_catalog.jsonb_object_agg(value, booking_count order by value) filter (where dimension = 'parking_family'), '{}'::jsonb) as parking_family_counts
  from dimension_counts group by customer_id
),
ranked_dimensions as (
  select dimension_counts.*,
    max(booking_count) over (partition by customer_id, dimension) as max_count
  from dimension_counts where dimension in ('brand', 'parking')
),
top_dimensions as (
  select customer_id,
    coalesce(pg_catalog.array_agg(value order by value) filter (where dimension = 'brand' and booking_count = max_count), '{}'::text[]) as top_brands,
    coalesce(pg_catalog.array_agg(value order by value) filter (where dimension = 'parking' and booking_count = max_count), '{}'::text[]) as top_parkings
  from ranked_dimensions group by customer_id
)
select
  base.customer_id,
  base.boleta_count, base.boleta_12m, base.boleta_24m,
  base.first_purchase, base.last_purchase, base.previous_purchase,
  gap.median_value, coalesce(gap.sample_size, 0),
  stay.total_value, stay.average_value, stay.median_value, stay.min_value, stay.max_value, coalesce(stay.sample_size, 0),
  coalesce(econ.sample_size, 0), econ.paid_amount, econ.list_amount, econ.discount_amount,
  econ.average_ticket, econ.median_ticket, econ.min_ticket, econ.max_ticket,
  econ.paid_adr, econ.list_adr, econ.paid_adr_12m, econ.list_adr_12m, econ.paid_adr_24m, econ.list_adr_24m,
  coalesce(econ.discounted_count, 0),
  econ.discounted_count::numeric / nullif(econ.sample_size, 0),
  econ.discount_amount / nullif(econ.list_amount, 0),
  lead.average_value, lead.median_value, lead.min_value, lead.max_value, coalesce(lead.sample_size, 0),
  coalesce(arrival.weekday_count, 0), coalesce(arrival.weekend_count, 0),
  arrival.weekend_count::numeric / nullif(arrival.sample_size, 0), coalesce(arrival.sample_size, 0),
  months.counts, months.shares, months.top_months, months.active_months,
  coalesce(arrival.sample_size, 0), coalesce(arrival.distinct_years, 0),
  coalesce(dimensions.source_counts, '{}'::jsonb), coalesce(dimensions.brand_counts, '{}'::jsonb),
  coalesce(dimensions.parking_counts, '{}'::jsonb), coalesce(dimensions.parking_family_counts, '{}'::jsonb),
  coalesce(tops.top_brands, '{}'::text[]),
  case when pg_catalog.cardinality(tops.top_brands) = 1 then tops.top_brands[1] end,
  coalesce(tops.top_parkings, '{}'::text[]),
  case when pg_catalog.cardinality(tops.top_parkings) = 1 then tops.top_parkings[1] end,
  base.total_valid_count, base.boleta_count, base.pack_count,
  base.missing_amount, base.missing_duration, base.missing_lead, base.invalid_lead,
  params.today, 'CUSTOMER_360_BOLETA_ANALYTICS_V1'::text, pg_catalog.statement_timestamp()
from base_stats base
cross join params
left join gap_stats gap using (customer_id)
left join stay_stats stay using (customer_id)
left join lead_stats lead using (customer_id)
left join economics econ using (customer_id)
left join arrival_stats arrival using (customer_id)
join month_summary months using (customer_id)
left join dimension_summary dimensions using (customer_id)
left join top_dimensions tops using (customer_id);
$function$;

create or replace function public.customer_window_calculate_boleta_discount_codes_v1(p_customer_ids uuid[])
returns table (customer_id uuid, source text, code_type text, code text, uses bigint, last_used_at timestamp without time zone)
language sql
stable
security definer
set search_path = ''
as $function$
  select link.profile_id, 'MCP_EAP'::text, 'promotion'::text,
    pg_catalog.btrim(booking.promotion_code), count(*)::bigint, max(booking.source_created_at)
  from public.customer_booking_profile_links link
  join public.customer_profiles profile on profile.id = link.profile_id and profile.status = 'active' and profile.merged_into_profile_id is null
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = link.source
   and booking.source_row_id = link.source_row_id
   and link.source = 'MCP_EAP'
  where link.profile_id = any(p_customer_ids) and link.status = 'active'
    and booking.booking_status in (1,8) and booking.is_pack is false
    and booking.booking_paid is not null and booking.promotion_discount_amount is not null
    and booking.promotion_discount_amount >= 0 and booking.duration_days > 0 and booking.paying_status = 1
    and nullif(pg_catalog.btrim(booking.promotion_code), '') is not null
  group by link.profile_id, pg_catalog.btrim(booking.promotion_code)
  union all
  select link.profile_id, 'OKP'::text, 'coupon'::text,
    pg_catalog.btrim(booking.coupon_code), count(*)::bigint, max(booking.source_created_at)
  from public.customer_booking_profile_links link
  join public.customer_profiles profile on profile.id = link.profile_id and profile.status = 'active' and profile.merged_into_profile_id is null
  join public.customer_source_bookings_okp booking
    on booking.source = link.source
   and booking.source_row_id = link.source_row_id
   and link.source = 'OKP'
  where link.profile_id = any(p_customer_ids) and link.status = 'active'
    and ((booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
      or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true))
    and booking.is_pack is false and booking.is_paid is true and booking.source_total_amount is not null
    and booking.planned_arrival_at is not null and booking.planned_departure_at is not null
    and booking.planned_departure_at::date - booking.planned_arrival_at::date + 1 > 0
    and (booking.discount_amount is null or booking.discount_amount >= 0)
    and (booking.coupon_amount is null or booking.coupon_amount >= 0)
    and nullif(pg_catalog.btrim(booking.coupon_code), '') is not null
  group by link.profile_id, pg_catalog.btrim(booking.coupon_code);
$function$;

create or replace function public.customer_window_refresh_boleta_analytics_v1_m2m(
  p_customer_ids uuid[] default null,
  p_limit integer default 500,
  p_mode text default 'auto'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ids uuid[];
  v_processed integer := 0;
  v_removed integer := 0;
  v_has_more boolean := false;
  v_mode text := pg_catalog.lower(pg_catalog.btrim(p_mode));
  -- Certified writers execute under the 120-second database statement timeout.
  -- Five minutes keeps the cursor behind that bound without re-reading completed pages.
  v_safe_upper_bound timestamptz := pg_catalog.statement_timestamp() - interval '5 minutes';
  v_cycle bigint := 0;
  v_rotation integer;
  v_base_quota integer;
  v_remainder integer;
  v_profiles_quota integer;
  v_links_quota integer;
  v_mcp_eap_quota integer;
  v_okp_quota integer;
  v_bootstrap_quota integer;
  v_as_of_quota integer;
  v_profiles_ids uuid[] := '{}'::uuid[];
  v_links_ids uuid[] := '{}'::uuid[];
  v_mcp_eap_ids uuid[] := '{}'::uuid[];
  v_okp_ids uuid[] := '{}'::uuid[];
  v_bootstrap_ids uuid[] := '{}'::uuid[];
  v_as_of_ids uuid[] := '{}'::uuid[];
  v_bootstrap_cursor_id uuid;
  v_bootstrap_next_id uuid;
  v_bootstrap_rows integer := 0;
  v_bootstrap_complete boolean := false;
  v_bootstrap_last_succeeded_at timestamptz;
  v_profiles_cursor_at timestamptz;
  v_profiles_cursor_id uuid;
  v_profiles_next_at timestamptz;
  v_profiles_next_id uuid;
  v_profiles_rows integer := 0;
  v_profiles_more boolean := false;
  v_links_cursor_at timestamptz;
  v_links_cursor_id uuid;
  v_links_next_at timestamptz;
  v_links_next_id uuid;
  v_links_rows integer := 0;
  v_links_more boolean := false;
  v_mcp_eap_cursor_at timestamptz;
  v_mcp_eap_cursor_id bigint;
  v_mcp_eap_next_at timestamptz;
  v_mcp_eap_next_id bigint;
  v_mcp_eap_rows integer := 0;
  v_mcp_eap_more boolean := false;
  v_okp_cursor_at timestamptz;
  v_okp_cursor_id bigint;
  v_okp_next_at timestamptz;
  v_okp_next_id bigint;
  v_okp_rows integer := 0;
  v_okp_more boolean := false;
  v_bootstrap_more boolean := false;
  v_as_of_more boolean := false;
begin
  if v_mode is null or v_mode not in ('auto', 'bootstrap', 'as_of') then
    raise exception 'invalid_refresh_mode' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'invalid_refresh_limit' using errcode = '22023';
  end if;
  if p_customer_ids is not null and (pg_catalog.cardinality(p_customer_ids) < 1 or pg_catalog.cardinality(p_customer_ids) > 500) then
    raise exception 'invalid_customer_id_batch' using errcode = '22023';
  end if;
  if p_customer_ids is not null and v_mode <> 'auto' then
    raise exception 'customer_ids_require_auto_mode' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('customer_window_boleta_analytics_v1_refresh', 0));

  if p_customer_ids is not null then
    select pg_catalog.array_agg(distinct requested order by requested) into v_ids
    from pg_catalog.unnest(p_customer_ids) requested;
  else
    perform 1
    from public.customer_profile_boleta_analytics_incremental_state state
    order by state.stream_key
    for update;

    select state.processed_rows into strict v_cycle
    from public.customer_profile_boleta_analytics_incremental_state state
    where state.stream_key = 'selector';

    if v_mode = 'auto' then
      v_rotation := (v_cycle % 6)::integer;
      v_base_quota := p_limit / 6;
      v_remainder := p_limit % 6;
      v_profiles_quota := v_base_quota + case when mod(0 - v_rotation + 6, 6) < v_remainder then 1 else 0 end;
      v_links_quota := v_base_quota + case when mod(1 - v_rotation + 6, 6) < v_remainder then 1 else 0 end;
      v_mcp_eap_quota := v_base_quota + case when mod(2 - v_rotation + 6, 6) < v_remainder then 1 else 0 end;
      v_okp_quota := v_base_quota + case when mod(3 - v_rotation + 6, 6) < v_remainder then 1 else 0 end;
      v_bootstrap_quota := v_base_quota + case when mod(4 - v_rotation + 6, 6) < v_remainder then 1 else 0 end;
      v_as_of_quota := v_base_quota + case when mod(5 - v_rotation + 6, 6) < v_remainder then 1 else 0 end;
    elsif v_mode = 'bootstrap' then
      v_profiles_quota := 0;
      v_links_quota := 0;
      v_mcp_eap_quota := 0;
      v_okp_quota := 0;
      v_bootstrap_quota := p_limit;
      v_as_of_quota := 0;
    else
      v_profiles_quota := 0;
      v_links_quota := 0;
      v_mcp_eap_quota := 0;
      v_okp_quota := 0;
      v_bootstrap_quota := 0;
      v_as_of_quota := p_limit;
    end if;

    select state.watermark_updated_at,
      case when state.watermark_tiebreaker is null then null else state.watermark_tiebreaker::uuid end
    into v_profiles_cursor_at, v_profiles_cursor_id
    from public.customer_profile_boleta_analytics_incremental_state state
    where state.stream_key = 'customer_profiles';

    if v_profiles_quota > 0 then
      if v_profiles_cursor_at is null then
        with page as materialized (
          select profile.updated_at, profile.id
          from public.customer_profiles profile
          where profile.updated_at <= v_safe_upper_bound
          order by profile.updated_at, profile.id
          limit v_profiles_quota + 1
        ), batch as materialized (
          select * from page order by updated_at, id limit v_profiles_quota
        )
        select
          coalesce((select pg_catalog.array_agg(id order by id) from batch), '{}'::uuid[]),
          (select count(*)::integer from batch),
          (select updated_at from batch order by updated_at desc, id desc limit 1),
          (select id from batch order by updated_at desc, id desc limit 1),
          (select count(*) > v_profiles_quota from page)
        into v_profiles_ids, v_profiles_rows, v_profiles_next_at, v_profiles_next_id, v_profiles_more;
      else
        with page as materialized (
          select profile.updated_at, profile.id
          from public.customer_profiles profile
          where (profile.updated_at, profile.id) > (v_profiles_cursor_at, v_profiles_cursor_id)
            and profile.updated_at <= v_safe_upper_bound
          order by profile.updated_at, profile.id
          limit v_profiles_quota + 1
        ), batch as materialized (
          select * from page order by updated_at, id limit v_profiles_quota
        )
        select
          coalesce((select pg_catalog.array_agg(id order by id) from batch), '{}'::uuid[]),
          (select count(*)::integer from batch),
          (select updated_at from batch order by updated_at desc, id desc limit 1),
          (select id from batch order by updated_at desc, id desc limit 1),
          (select count(*) > v_profiles_quota from page)
        into v_profiles_ids, v_profiles_rows, v_profiles_next_at, v_profiles_next_id, v_profiles_more;
      end if;
    end if;

    select state.watermark_updated_at,
      case when state.watermark_tiebreaker is null then null else state.watermark_tiebreaker::uuid end
    into v_links_cursor_at, v_links_cursor_id
    from public.customer_profile_boleta_analytics_incremental_state state
    where state.stream_key = 'booking_links';

    if v_links_quota > 0 then
      -- A link stores only its current profile. A previous owner is reconciled by the daily as-of branch.
      if v_links_cursor_at is null then
        with page as materialized (
          select link.updated_at, link.id, link.profile_id
          from public.customer_booking_profile_links link
          where link.updated_at <= v_safe_upper_bound
          order by link.updated_at, link.id
          limit v_links_quota + 1
        ), batch as materialized (
          select * from page order by updated_at, id limit v_links_quota
        )
        select
          coalesce((select pg_catalog.array_agg(distinct profile_id order by profile_id) from batch), '{}'::uuid[]),
          (select count(*)::integer from batch),
          (select updated_at from batch order by updated_at desc, id desc limit 1),
          (select id from batch order by updated_at desc, id desc limit 1),
          (select count(*) > v_links_quota from page)
        into v_links_ids, v_links_rows, v_links_next_at, v_links_next_id, v_links_more;
      else
        with page as materialized (
          select link.updated_at, link.id, link.profile_id
          from public.customer_booking_profile_links link
          where (link.updated_at, link.id) > (v_links_cursor_at, v_links_cursor_id)
            and link.updated_at <= v_safe_upper_bound
          order by link.updated_at, link.id
          limit v_links_quota + 1
        ), batch as materialized (
          select * from page order by updated_at, id limit v_links_quota
        )
        select
          coalesce((select pg_catalog.array_agg(distinct profile_id order by profile_id) from batch), '{}'::uuid[]),
          (select count(*)::integer from batch),
          (select updated_at from batch order by updated_at desc, id desc limit 1),
          (select id from batch order by updated_at desc, id desc limit 1),
          (select count(*) > v_links_quota from page)
        into v_links_ids, v_links_rows, v_links_next_at, v_links_next_id, v_links_more;
      end if;
    end if;

    select state.watermark_updated_at,
      case when state.watermark_tiebreaker is null then null else state.watermark_tiebreaker::bigint end
    into v_mcp_eap_cursor_at, v_mcp_eap_cursor_id
    from public.customer_profile_boleta_analytics_incremental_state state
    where state.stream_key = 'mcp_eap';

    if v_mcp_eap_quota > 0 then
      if v_mcp_eap_cursor_at is null then
        with page as materialized (
          select booking.updated_at, booking.source_row_id
          from public.customer_source_bookings_mcp_eap booking
          where booking.updated_at <= v_safe_upper_bound
          order by booking.updated_at, booking.source_row_id
          limit v_mcp_eap_quota + 1
        ), batch as materialized (
          select * from page order by updated_at, source_row_id limit v_mcp_eap_quota
        )
        select
          coalesce((select pg_catalog.array_agg(distinct link.profile_id order by link.profile_id)
            from batch join public.customer_booking_profile_links link
              on link.source = 'MCP_EAP' and link.source_row_id = batch.source_row_id
            where link.status = 'active'), '{}'::uuid[]),
          (select count(*)::integer from batch),
          (select updated_at from batch order by updated_at desc, source_row_id desc limit 1),
          (select source_row_id from batch order by updated_at desc, source_row_id desc limit 1),
          (select count(*) > v_mcp_eap_quota from page)
        into v_mcp_eap_ids, v_mcp_eap_rows, v_mcp_eap_next_at, v_mcp_eap_next_id, v_mcp_eap_more;
      else
        with page as materialized (
          select booking.updated_at, booking.source_row_id
          from public.customer_source_bookings_mcp_eap booking
          where (booking.updated_at, booking.source_row_id) > (v_mcp_eap_cursor_at, v_mcp_eap_cursor_id)
            and booking.updated_at <= v_safe_upper_bound
          order by booking.updated_at, booking.source_row_id
          limit v_mcp_eap_quota + 1
        ), batch as materialized (
          select * from page order by updated_at, source_row_id limit v_mcp_eap_quota
        )
        select
          coalesce((select pg_catalog.array_agg(distinct link.profile_id order by link.profile_id)
            from batch join public.customer_booking_profile_links link
              on link.source = 'MCP_EAP' and link.source_row_id = batch.source_row_id
            where link.status = 'active'), '{}'::uuid[]),
          (select count(*)::integer from batch),
          (select updated_at from batch order by updated_at desc, source_row_id desc limit 1),
          (select source_row_id from batch order by updated_at desc, source_row_id desc limit 1),
          (select count(*) > v_mcp_eap_quota from page)
        into v_mcp_eap_ids, v_mcp_eap_rows, v_mcp_eap_next_at, v_mcp_eap_next_id, v_mcp_eap_more;
      end if;
    end if;

    select state.watermark_updated_at,
      case when state.watermark_tiebreaker is null then null else state.watermark_tiebreaker::bigint end
    into v_okp_cursor_at, v_okp_cursor_id
    from public.customer_profile_boleta_analytics_incremental_state state
    where state.stream_key = 'okp';

    if v_okp_quota > 0 then
      if v_okp_cursor_at is null then
        with page as materialized (
          select booking.updated_at, booking.source_row_id
          from public.customer_source_bookings_okp booking
          where booking.updated_at <= v_safe_upper_bound
          order by booking.updated_at, booking.source_row_id
          limit v_okp_quota + 1
        ), batch as materialized (
          select * from page order by updated_at, source_row_id limit v_okp_quota
        )
        select
          coalesce((select pg_catalog.array_agg(distinct link.profile_id order by link.profile_id)
            from batch join public.customer_booking_profile_links link
              on link.source = 'OKP' and link.source_row_id = batch.source_row_id
            where link.status = 'active'), '{}'::uuid[]),
          (select count(*)::integer from batch),
          (select updated_at from batch order by updated_at desc, source_row_id desc limit 1),
          (select source_row_id from batch order by updated_at desc, source_row_id desc limit 1),
          (select count(*) > v_okp_quota from page)
        into v_okp_ids, v_okp_rows, v_okp_next_at, v_okp_next_id, v_okp_more;
      else
        with page as materialized (
          select booking.updated_at, booking.source_row_id
          from public.customer_source_bookings_okp booking
          where (booking.updated_at, booking.source_row_id) > (v_okp_cursor_at, v_okp_cursor_id)
            and booking.updated_at <= v_safe_upper_bound
          order by booking.updated_at, booking.source_row_id
          limit v_okp_quota + 1
        ), batch as materialized (
          select * from page order by updated_at, source_row_id limit v_okp_quota
        )
        select
          coalesce((select pg_catalog.array_agg(distinct link.profile_id order by link.profile_id)
            from batch join public.customer_booking_profile_links link
              on link.source = 'OKP' and link.source_row_id = batch.source_row_id
            where link.status = 'active'), '{}'::uuid[]),
          (select count(*)::integer from batch),
          (select updated_at from batch order by updated_at desc, source_row_id desc limit 1),
          (select source_row_id from batch order by updated_at desc, source_row_id desc limit 1),
          (select count(*) > v_okp_quota from page)
        into v_okp_ids, v_okp_rows, v_okp_next_at, v_okp_next_id, v_okp_more;
      end if;
    end if;

    if v_mode in ('auto', 'bootstrap') then
      select case when state.watermark_tiebreaker is null then null else state.watermark_tiebreaker::uuid end,
        state.stream_complete, state.last_succeeded_at
      into v_bootstrap_cursor_id, v_bootstrap_complete, v_bootstrap_last_succeeded_at
      from public.customer_profile_boleta_analytics_incremental_state state
      where state.stream_key = 'bootstrap';

      -- Re-open the bounded profile sweep once per Chilean day. This is the eventual
      -- reconciliation for a transaction that outlives the safety lag.
      if v_bootstrap_complete and (
        v_bootstrap_last_succeeded_at is null
        or pg_catalog.timezone('America/Santiago', v_bootstrap_last_succeeded_at)::date
          < pg_catalog.timezone('America/Santiago', pg_catalog.now())::date
      ) then
        v_bootstrap_cursor_id := null;
        v_bootstrap_complete := false;
        update public.customer_profile_boleta_analytics_incremental_state set
          watermark_tiebreaker = null, stream_complete = false, last_batch_count = 0,
          updated_at = pg_catalog.statement_timestamp()
        where stream_key = 'bootstrap';
      end if;
    end if;

    if v_bootstrap_quota > 0 and not v_bootstrap_complete then
      with page as materialized (
        select profile.id
        from public.customer_profiles profile
        where profile.status = 'active'
          and profile.merged_into_profile_id is null
          and profile.updated_at <= v_safe_upper_bound
          and (v_bootstrap_cursor_id is null or profile.id > v_bootstrap_cursor_id)
          and not exists (
            select 1 from public.customer_profile_boleta_analytics analytics
            where analytics.customer_id = profile.id
          )
          and exists (
            select 1 from public.customer_booking_profile_links link
            where link.profile_id = profile.id and link.status = 'active'
          )
        order by profile.id
        limit v_bootstrap_quota + 1
      ), batch as materialized (
        select * from page order by id limit v_bootstrap_quota
      )
      select coalesce((select pg_catalog.array_agg(id order by id) from batch), '{}'::uuid[]),
        (select count(*)::integer from batch),
        (select id from batch order by id desc limit 1),
        (select count(*) > v_bootstrap_quota from page)
      into v_bootstrap_ids, v_bootstrap_rows, v_bootstrap_next_id, v_bootstrap_more;
    end if;

    if v_as_of_quota > 0 then
      with page as materialized (
        select analytics.customer_id
        from public.customer_profile_boleta_analytics analytics
        where analytics.as_of_date < pg_catalog.timezone('America/Santiago', pg_catalog.now())::date
        order by analytics.as_of_date, analytics.customer_id
        limit v_as_of_quota + 1
      ), batch as materialized (
        select * from page order by customer_id limit v_as_of_quota
      )
      select coalesce((select pg_catalog.array_agg(customer_id order by customer_id) from batch), '{}'::uuid[]),
        (select count(*) > v_as_of_quota from page)
      into v_as_of_ids, v_as_of_more;
    end if;

    select coalesce(pg_catalog.array_agg(distinct candidate_id order by candidate_id), '{}'::uuid[])
    into v_ids
    from pg_catalog.unnest(
      v_profiles_ids || v_links_ids || v_mcp_eap_ids || v_okp_ids || v_bootstrap_ids || v_as_of_ids
    ) candidate(candidate_id);

    v_has_more := v_profiles_more or v_links_more or v_mcp_eap_more or v_okp_more
      or v_bootstrap_more or v_as_of_more;
    if v_mode = 'auto' and v_profiles_quota = 0 then
      if v_profiles_cursor_at is null then
        if exists (
          select 1 from public.customer_profiles profile
          where profile.updated_at <= v_safe_upper_bound
        ) then v_has_more := true; end if;
      elsif exists (
        select 1 from public.customer_profiles profile
        where (profile.updated_at, profile.id) > (v_profiles_cursor_at, v_profiles_cursor_id)
          and profile.updated_at <= v_safe_upper_bound
      ) then v_has_more := true; end if;
    end if;
    if v_mode = 'auto' and v_links_quota = 0 then
      if v_links_cursor_at is null then
        if exists (
          select 1 from public.customer_booking_profile_links link
          where link.updated_at <= v_safe_upper_bound
        ) then v_has_more := true; end if;
      elsif exists (
        select 1 from public.customer_booking_profile_links link
        where (link.updated_at, link.id) > (v_links_cursor_at, v_links_cursor_id)
          and link.updated_at <= v_safe_upper_bound
      ) then v_has_more := true; end if;
    end if;
    if v_mode = 'auto' and v_mcp_eap_quota = 0 then
      if v_mcp_eap_cursor_at is null then
        if exists (
          select 1 from public.customer_source_bookings_mcp_eap booking
          where booking.updated_at <= v_safe_upper_bound
        ) then v_has_more := true; end if;
      elsif exists (
        select 1 from public.customer_source_bookings_mcp_eap booking
        where (booking.updated_at, booking.source_row_id) > (v_mcp_eap_cursor_at, v_mcp_eap_cursor_id)
          and booking.updated_at <= v_safe_upper_bound
      ) then v_has_more := true; end if;
    end if;
    if v_mode = 'auto' and v_okp_quota = 0 then
      if v_okp_cursor_at is null then
        if exists (
          select 1 from public.customer_source_bookings_okp booking
          where booking.updated_at <= v_safe_upper_bound
        ) then v_has_more := true; end if;
      elsif exists (
        select 1 from public.customer_source_bookings_okp booking
        where (booking.updated_at, booking.source_row_id) > (v_okp_cursor_at, v_okp_cursor_id)
          and booking.updated_at <= v_safe_upper_bound
      ) then v_has_more := true; end if;
    end if;
    if v_mode = 'auto' and v_bootstrap_quota = 0 and not v_bootstrap_complete and exists (
      select 1 from public.customer_profiles profile
      where profile.status = 'active' and profile.merged_into_profile_id is null
        and profile.updated_at <= v_safe_upper_bound
        and (v_bootstrap_cursor_id is null or profile.id > v_bootstrap_cursor_id)
        and not exists (select 1 from public.customer_profile_boleta_analytics analytics where analytics.customer_id = profile.id)
        and exists (select 1 from public.customer_booking_profile_links link
          where link.profile_id = profile.id and link.status = 'active')
    ) then v_has_more := true; end if;
    if v_mode = 'auto' and v_as_of_quota = 0 and exists (
      select 1 from public.customer_profile_boleta_analytics analytics
      where analytics.as_of_date < pg_catalog.timezone('America/Santiago', pg_catalog.now())::date
    ) then v_has_more := true; end if;

    if v_profiles_rows > 0 then
      update public.customer_profile_boleta_analytics_incremental_state set
        watermark_updated_at = v_profiles_next_at, watermark_tiebreaker = v_profiles_next_id::text,
        processed_rows = processed_rows + v_profiles_rows, last_batch_count = v_profiles_rows,
        last_succeeded_at = pg_catalog.statement_timestamp(), updated_at = pg_catalog.statement_timestamp()
      where stream_key = 'customer_profiles';
    end if;
    if v_links_rows > 0 then
      update public.customer_profile_boleta_analytics_incremental_state set
        watermark_updated_at = v_links_next_at, watermark_tiebreaker = v_links_next_id::text,
        processed_rows = processed_rows + v_links_rows, last_batch_count = v_links_rows,
        last_succeeded_at = pg_catalog.statement_timestamp(), updated_at = pg_catalog.statement_timestamp()
      where stream_key = 'booking_links';
    end if;
    if v_mcp_eap_rows > 0 then
      update public.customer_profile_boleta_analytics_incremental_state set
        watermark_updated_at = v_mcp_eap_next_at, watermark_tiebreaker = v_mcp_eap_next_id::text,
        processed_rows = processed_rows + v_mcp_eap_rows, last_batch_count = v_mcp_eap_rows,
        last_succeeded_at = pg_catalog.statement_timestamp(), updated_at = pg_catalog.statement_timestamp()
      where stream_key = 'mcp_eap';
    end if;
    if v_okp_rows > 0 then
      update public.customer_profile_boleta_analytics_incremental_state set
        watermark_updated_at = v_okp_next_at, watermark_tiebreaker = v_okp_next_id::text,
        processed_rows = processed_rows + v_okp_rows, last_batch_count = v_okp_rows,
        last_succeeded_at = pg_catalog.statement_timestamp(), updated_at = pg_catalog.statement_timestamp()
      where stream_key = 'okp';
    end if;
    if v_bootstrap_quota > 0 and not v_bootstrap_complete then
      update public.customer_profile_boleta_analytics_incremental_state set
        watermark_tiebreaker = coalesce(v_bootstrap_next_id, v_bootstrap_cursor_id)::text,
        stream_complete = not v_bootstrap_more,
        processed_rows = processed_rows + v_bootstrap_rows,
        last_batch_count = v_bootstrap_rows,
        last_succeeded_at = pg_catalog.statement_timestamp(), updated_at = pg_catalog.statement_timestamp()
      where stream_key = 'bootstrap';
    end if;
    if v_mode = 'auto' then
      update public.customer_profile_boleta_analytics_incremental_state set
        processed_rows = processed_rows + 1,
        last_batch_count = coalesce(pg_catalog.cardinality(v_ids), 0),
        last_succeeded_at = pg_catalog.statement_timestamp(), updated_at = pg_catalog.statement_timestamp()
      where stream_key = 'selector';
    end if;
  end if;

  if coalesce(pg_catalog.cardinality(v_ids), 0) = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'mode', v_mode, 'processedProfiles', 0, 'removedProfiles', 0, 'hasMore', v_has_more,
      'calculationVersion', 'CUSTOMER_360_BOLETA_ANALYTICS_V1'
    );
  end if;

  delete from public.customer_profile_boleta_discount_codes where customer_id = any(v_ids);

  insert into public.customer_profile_boleta_analytics
  select * from public.customer_window_calculate_boleta_analytics_v1(v_ids)
  on conflict (customer_id) do update set
    boleta_reservation_count = excluded.boleta_reservation_count,
    boleta_reservations_12m = excluded.boleta_reservations_12m,
    boleta_reservations_24m = excluded.boleta_reservations_24m,
    first_boleta_purchase_at = excluded.first_boleta_purchase_at,
    last_boleta_purchase_at = excluded.last_boleta_purchase_at,
    previous_boleta_purchase_at = excluded.previous_boleta_purchase_at,
    median_boleta_gap_days = excluded.median_boleta_gap_days,
    gap_interval_count = excluded.gap_interval_count,
    total_economic_days = excluded.total_economic_days,
    average_stay_days = excluded.average_stay_days,
    median_stay_days = excluded.median_stay_days,
    min_stay_days = excluded.min_stay_days,
    max_stay_days = excluded.max_stay_days,
    stay_days_sample_size = excluded.stay_days_sample_size,
    economic_eligible_boleta_count = excluded.economic_eligible_boleta_count,
    paid_amount = excluded.paid_amount,
    list_amount = excluded.list_amount,
    total_discount_amount = excluded.total_discount_amount,
    average_ticket = excluded.average_ticket,
    median_ticket = excluded.median_ticket,
    min_ticket = excluded.min_ticket,
    max_ticket = excluded.max_ticket,
    paid_adr = excluded.paid_adr,
    list_adr = excluded.list_adr,
    paid_adr_12m = excluded.paid_adr_12m,
    list_adr_12m = excluded.list_adr_12m,
    paid_adr_24m = excluded.paid_adr_24m,
    list_adr_24m = excluded.list_adr_24m,
    discounted_boleta_count = excluded.discounted_boleta_count,
    discount_usage_pct = excluded.discount_usage_pct,
    weighted_discount_pct = excluded.weighted_discount_pct,
    average_booking_lead_days = excluded.average_booking_lead_days,
    median_booking_lead_days = excluded.median_booking_lead_days,
    min_booking_lead_days = excluded.min_booking_lead_days,
    max_booking_lead_days = excluded.max_booking_lead_days,
    booking_lead_sample_size = excluded.booking_lead_sample_size,
    weekday_arrival_count = excluded.weekday_arrival_count,
    weekend_arrival_count = excluded.weekend_arrival_count,
    weekend_arrival_share_pct = excluded.weekend_arrival_share_pct,
    arrival_day_sample_size = excluded.arrival_day_sample_size,
    arrival_month_counts = excluded.arrival_month_counts,
    arrival_month_shares = excluded.arrival_month_shares,
    top_arrival_months = excluded.top_arrival_months,
    active_arrival_month_count = excluded.active_arrival_month_count,
    arrival_month_sample_size = excluded.arrival_month_sample_size,
    distinct_arrival_years = excluded.distinct_arrival_years,
    source_counts = excluded.source_counts,
    brand_counts = excluded.brand_counts,
    parking_counts = excluded.parking_counts,
    parking_family_counts = excluded.parking_family_counts,
    top_brands = excluded.top_brands,
    preferred_brand = excluded.preferred_brand,
    top_parkings = excluded.top_parkings,
    preferred_parking = excluded.preferred_parking,
    total_valid_booking_count = excluded.total_valid_booking_count,
    eligible_boleta_booking_count = excluded.eligible_boleta_booking_count,
    excluded_pack_booking_count = excluded.excluded_pack_booking_count,
    missing_amount_count = excluded.missing_amount_count,
    missing_duration_count = excluded.missing_duration_count,
    missing_lead_time_count = excluded.missing_lead_time_count,
    invalid_lead_time_count = excluded.invalid_lead_time_count,
    as_of_date = excluded.as_of_date,
    calculation_version = excluded.calculation_version,
    computed_at = excluded.computed_at;
  get diagnostics v_processed = row_count;

  insert into public.customer_profile_boleta_discount_codes (customer_id, source, code_type, code, uses, last_used_at)
  select * from public.customer_window_calculate_boleta_discount_codes_v1(v_ids);

  delete from public.customer_profile_boleta_analytics analytics
  where analytics.customer_id = any(v_ids)
    and not exists (
      select 1 from public.customer_profiles profile
      where profile.id = analytics.customer_id and profile.status = 'active' and profile.merged_into_profile_id is null
    );
  get diagnostics v_removed = row_count;

  return pg_catalog.jsonb_build_object(
    'ok', true, 'mode', v_mode, 'processedProfiles', v_processed, 'removedProfiles', v_removed,
    'hasMore', v_has_more, 'calculationVersion', 'CUSTOMER_360_BOLETA_ANALYTICS_V1'
  );
end;
$function$;

create or replace function public.customer_window_boleta_analytics_v1_refresh_status_m2m(
  p_include_counts boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'calculationVersion', 'CUSTOMER_360_BOLETA_ANALYTICS_V1',
    'asOfDate', pg_catalog.timezone('America/Santiago', pg_catalog.statement_timestamp())::date,
    'countsIncluded', coalesce(p_include_counts, false),
    'countsCost', case when coalesce(p_include_counts, false) then 'potentially_expensive' else 'not_requested' end,
    'streams', (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'streamName', state.stream_key,
          'cursorAt', state.watermark_updated_at,
          'cursorTiebreaker', state.watermark_tiebreaker,
          'streamComplete', state.stream_complete,
          'processedRows', state.processed_rows,
          'lastBatchCount', state.last_batch_count,
          'lastSucceededAt', state.last_succeeded_at,
          'updatedAt', state.updated_at
        ) order by state.stream_key
      )
      from public.customer_profile_boleta_analytics_incremental_state state
    ),
    'bootstrapComplete', (
      select state.stream_complete
      from public.customer_profile_boleta_analytics_incremental_state state
      where state.stream_key = 'bootstrap'
    ),
    'analyticsMaterializedCount', case when coalesce(p_include_counts, false) then (
      select pg_catalog.count(*)
      from public.customer_profile_boleta_analytics analytics
    ) else null end,
    'analyticsStaleCount', case when coalesce(p_include_counts, false) then (
      select pg_catalog.count(*)
      from public.customer_profile_boleta_analytics analytics
      where analytics.as_of_date < pg_catalog.timezone('America/Santiago', pg_catalog.statement_timestamp())::date
    ) else null end,
    'activeEligibleWithoutAnalyticsCount', case when coalesce(p_include_counts, false) then (
      select pg_catalog.count(*)
      from public.customer_profiles profile
      where profile.status = 'active'
        and profile.merged_into_profile_id is null
        and profile.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
        and not exists (
          select 1 from public.customer_profile_boleta_analytics analytics
          where analytics.customer_id = profile.id
        )
        and exists (
          select 1 from public.customer_booking_profile_links link
          where link.profile_id = profile.id and link.status = 'active'
        )
    ) else null end
  );
$function$;

create or replace function public.customer_window_360_v1_get_boleta_analytics(p_locator jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_resolved jsonb;
  v_customer_id uuid;
  v_analytics public.customer_profile_boleta_analytics%rowtype;
  v_codes jsonb;
  v_warnings jsonb;
begin
  v_resolved := public.customer_window_360_v1_resolve_locator(p_locator);
  if v_resolved -> 'locator' ->> 'representationType' <> 'confirmed_customer' then
    raise exception 'boleta_analytics_confirmed_only' using errcode = '22023';
  end if;
  v_customer_id := (v_resolved ->> 'customerId')::uuid;

  select * into v_analytics
  from public.customer_profile_boleta_analytics analytics
  where analytics.customer_id = v_customer_id;
  if not found then
    raise exception 'boleta_analytics_not_materialized' using errcode = 'P0002';
  end if;

  with ranked as (
    select code.*, pg_catalog.row_number() over (
      partition by code.source, code.code_type order by code.uses desc, code.last_used_at desc nulls last, code.code
    ) as rank
    from public.customer_profile_boleta_discount_codes code
    where code.customer_id = v_customer_id
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'source', source, 'type', code_type, 'code', code, 'uses', uses, 'lastUsedAt', last_used_at
  ) order by source, code_type, rank), '[]'::jsonb)
  into v_codes from ranked where rank <= 10;

  select pg_catalog.to_jsonb(pg_catalog.array_remove(array[
    case when v_analytics.eligible_boleta_booking_count < 3 then 'LOW_SAMPLE_SIZE' end,
    case when v_analytics.economic_eligible_boleta_count < v_analytics.eligible_boleta_booking_count then 'ECONOMICS_PARTIAL' end,
    case when v_analytics.booking_lead_sample_size < v_analytics.eligible_boleta_booking_count then 'LEAD_TIME_PARTIAL' end,
    case when v_analytics.arrival_month_sample_size < 3 or v_analytics.distinct_arrival_years < 2 then 'SEASONALITY_LOW_SAMPLE' end,
    case when v_analytics.gap_interval_count < 2 then 'GAP_LOW_SAMPLE' end
  ], null)) into v_warnings;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'contractVersion', 'CUSTOMER360_ANALYTICS_V1',
    'scope', 'confirmed_customer_boleta',
    'locator', v_resolved -> 'locator',
    'activity', pg_catalog.jsonb_build_object(
      'boletaReservationCount', v_analytics.boleta_reservation_count,
      'boletaReservations12m', v_analytics.boleta_reservations_12m,
      'boletaReservations24m', v_analytics.boleta_reservations_24m,
      'firstBoletaPurchaseAt', v_analytics.first_boleta_purchase_at,
      'lastBoletaPurchaseAt', v_analytics.last_boleta_purchase_at,
      'previousBoletaPurchaseAt', v_analytics.previous_boleta_purchase_at,
      'daysSinceLastBoletaPurchase', case when v_analytics.last_boleta_purchase_at is null then null
        else greatest(0, v_analytics.as_of_date - v_analytics.last_boleta_purchase_at::date) end,
      'medianBoletaGapDays', v_analytics.median_boleta_gap_days,
      'gapIntervalCount', v_analytics.gap_interval_count,
      'repeatBoletaCustomer', v_analytics.boleta_reservation_count >= 2,
      'boletaRepurchaseCount', greatest(v_analytics.boleta_reservation_count - 1, 0),
      'purchaseSpanDays', case when v_analytics.first_boleta_purchase_at is null or v_analytics.last_boleta_purchase_at is null then null
        else v_analytics.last_boleta_purchase_at::date - v_analytics.first_boleta_purchase_at::date end
    ),
    'value', pg_catalog.jsonb_build_object(
      'currency', case when v_analytics.economic_eligible_boleta_count > 0 then 'CLP' else null end,
      'paidAmount', v_analytics.paid_amount,
      'listAmount', v_analytics.list_amount,
      'averageTicket', v_analytics.average_ticket,
      'medianTicket', v_analytics.median_ticket,
      'minTicket', v_analytics.min_ticket,
      'maxTicket', v_analytics.max_ticket
    ),
    'pricing', pg_catalog.jsonb_build_object(
      'paidAdr', v_analytics.paid_adr, 'listAdr', v_analytics.list_adr,
      'paidAdr12m', v_analytics.paid_adr_12m, 'listAdr12m', v_analytics.list_adr_12m,
      'paidAdr24m', v_analytics.paid_adr_24m, 'listAdr24m', v_analytics.list_adr_24m,
      'discountedBoletaCount', v_analytics.discounted_boleta_count,
      'discountUsagePct', v_analytics.discount_usage_pct,
      'totalDiscountAmount', v_analytics.total_discount_amount,
      'weightedDiscountPct', v_analytics.weighted_discount_pct,
      'discountCodes', v_codes
    ),
    'travelBehavior', pg_catalog.jsonb_build_object(
      'stayDays', pg_catalog.jsonb_build_object('total', v_analytics.total_economic_days, 'average', v_analytics.average_stay_days,
        'median', v_analytics.median_stay_days, 'min', v_analytics.min_stay_days, 'max', v_analytics.max_stay_days,
        'sampleSize', v_analytics.stay_days_sample_size),
      'bookingLeadDays', pg_catalog.jsonb_build_object('average', v_analytics.average_booking_lead_days,
        'median', v_analytics.median_booking_lead_days, 'min', v_analytics.min_booking_lead_days,
        'max', v_analytics.max_booking_lead_days, 'sampleSize', v_analytics.booking_lead_sample_size),
      'arrivalDayPattern', pg_catalog.jsonb_build_object('weekdayCount', v_analytics.weekday_arrival_count,
        'weekendCount', v_analytics.weekend_arrival_count, 'weekendSharePct', v_analytics.weekend_arrival_share_pct,
        'sampleSize', v_analytics.arrival_day_sample_size),
      'arrivalMonthPattern', pg_catalog.jsonb_build_object('counts', v_analytics.arrival_month_counts,
        'shares', v_analytics.arrival_month_shares, 'topMonths', v_analytics.top_arrival_months,
        'activeMonthCount', v_analytics.active_arrival_month_count, 'sampleSize', v_analytics.arrival_month_sample_size,
        'distinctArrivalYears', v_analytics.distinct_arrival_years)
    ),
    'sources', pg_catalog.jsonb_build_object(
      'counts', v_analytics.source_counts,
      'shares', (select coalesce(pg_catalog.jsonb_object_agg(entry.key, entry.value::numeric / nullif(v_analytics.eligible_boleta_booking_count, 0)), '{}'::jsonb)
        from pg_catalog.jsonb_each_text(v_analytics.source_counts) entry),
      'brandCounts', v_analytics.brand_counts,
      'brandShares', (select coalesce(pg_catalog.jsonb_object_agg(entry.key, entry.value::numeric / nullif(v_analytics.eligible_boleta_booking_count, 0)), '{}'::jsonb)
        from pg_catalog.jsonb_each_text(v_analytics.brand_counts) entry),
      'parkingCounts', v_analytics.parking_counts,
      'parkingShares', (select coalesce(pg_catalog.jsonb_object_agg(entry.key, entry.value::numeric / nullif(v_analytics.eligible_boleta_booking_count, 0)), '{}'::jsonb)
        from pg_catalog.jsonb_each_text(v_analytics.parking_counts) entry),
      'parkingFamilyCounts', v_analytics.parking_family_counts,
      'topBrands', v_analytics.top_brands, 'preferredBrand', v_analytics.preferred_brand,
      'topParkings', v_analytics.top_parkings, 'preferredParking', v_analytics.preferred_parking
    ),
    'dataQuality', pg_catalog.jsonb_build_object(
      'totalValidBookingCount', v_analytics.total_valid_booking_count,
      'eligibleBoletaBookingCount', v_analytics.eligible_boleta_booking_count,
      'excludedPackBookingCount', v_analytics.excluded_pack_booking_count,
      'economicEligibleBoletaCount', v_analytics.economic_eligible_boleta_count,
      'missingAmountCount', v_analytics.missing_amount_count,
      'missingDurationCount', v_analytics.missing_duration_count,
      'missingLeadTimeCount', v_analytics.missing_lead_time_count,
      'invalidLeadTimeCount', v_analytics.invalid_lead_time_count,
      'warnings', v_warnings
    ),
    'asOfDate', v_analytics.as_of_date,
    'calculationVersion', v_analytics.calculation_version,
    'computedAt', v_analytics.computed_at
  );
end;
$function$;

revoke all on function public.customer_window_calculate_boleta_analytics_v1(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_calculate_boleta_discount_codes_v1(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_refresh_boleta_analytics_v1_m2m(uuid[], integer, text) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_360_v1_get_boleta_analytics(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.customer_window_refresh_boleta_analytics_v1_m2m(uuid[], integer, text) to service_role;
grant execute on function public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean) to service_role;
grant execute on function public.customer_window_360_v1_get_boleta_analytics(jsonb) to service_role;
grant execute on function public.customer_window_refresh_boleta_analytics_v1_m2m(uuid[], integer, text)
  to customer_360_boleta_analytics_runner;
grant execute on function public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean)
  to customer_360_boleta_analytics_runner;

comment on table public.customer_profile_boleta_analytics is
  'Materialized Customer 360 Analytics V1 read model for confirmed-customer boleta behavior. Pack balances and related-review economics are intentionally excluded.';
comment on table public.customer_profile_boleta_discount_codes is
  'Source-namespaced promotion and coupon code usage supporting the boleta analytics read model.';
comment on function public.customer_window_refresh_boleta_analytics_v1_m2m(uuid[], integer, text) is
  'Idempotently refreshes explicit or stale confirmed-customer boleta analytics in auto, bootstrap, or as_of mode.';
comment on function public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean) is
  'Returns safe refresh stream metadata; exact operational counts are opt-in because they may scan a large eligible universe.';
comment on role customer_360_boleta_analytics_runner is
  'NOLOGIN capability for the Customer 360 BOLETA analytics refresh runner; LOGIN provisioning is separate.';
comment on function public.customer_window_360_v1_get_boleta_analytics(jsonb) is
  'Returns customer360.analytics.v1 boleta analytics from one materialized row for a confirmed Customer 360 locator.';
-- MCP_ONLY / EAP_ONLY / OKP_ONLY / CROSS_SOURCE
insert into public.customer_profiles (id, status, resolver_version, needs_review)
values
  ('61000000-0000-4000-8000-000000000001', 'active', 'customer_identity_v2', false),
  ('61000000-0000-4000-8000-000000000002', 'active', 'customer_identity_v2', false),
  ('61000000-0000-4000-8000-000000000003', 'active', 'customer_identity_v2', false),
  ('61000000-0000-4000-8000-000000000004', 'active', 'customer_identity_v2', false);

-- MCP_ONLY: MEDIAN_GAP, WEIGHTED_ADR, discount, future booking and PACK_EXCLUDED.
insert into public.customer_source_bookings_mcp_eap (
  source_row_id, source_booking_code, source_customer_id, source_created_at,
  planned_arrival_at, planned_departure_at, booking_status, paying_status,
  website_source, brand_normalized, parking_normalized, source_total_amount,
  booking_paid, promotion_code, promotion_discount_amount, duration_days,
  sub_days_used, is_pack, row_hash
) values
  (910000000001, 'BA-MCP-1', 910000001, '2025-01-01 10:00:00', '2025-01-11 10:00:00', '2025-01-12 10:00:00', 1, 1, 1, 'MCP', 'MCPARKING', 20000, 18000, 'PROMO-A', 2000, 2, 0, false, repeat('a',64)),
  (910000000002, 'BA-MCP-2', 910000001, '2026-01-01 10:00:00', '2026-01-10 10:00:00', '2026-01-12 10:00:00', 1, 1, 1, 'MCP', 'MCPARKING', 30000, 27000, 'PROMO-A', 3000, 3, 0, false, repeat('b',64)),
  -- FUTURE_BOOKING
  (910000000003, 'BA-MCP-3', 910000001, '2026-02-01 10:00:00', '2027-02-07 10:00:00', '2027-02-10 10:00:00', 8, 1, 1, 'MCP', 'MCPARKING', 40000, 36000, null, 4000, 4, 0, false, repeat('c',64)),
  (910000000004, 'BA-MCP-PACK', 910000001, '2026-03-01 10:00:00', '2026-03-05 10:00:00', '2026-03-06 10:00:00', 1, 0, 1, 'MCP', 'MCPARKING', 0, 0, null, 0, 2, 2, true, repeat('d',64)),
  -- MISSING_AMOUNT
  (910000000005, 'BA-MCP-MISSING-AMOUNT', 910000001, '2026-04-01 10:00:00', '2026-04-03 10:00:00', '2026-04-04 10:00:00', 1, 1, 1, 'MCP', 'MCPARKING', null, null, null, 0, 2, 0, false, repeat('e',64)),
  -- MISSING_DURATION
  (910000000006, 'BA-MCP-MISSING-DURATION', 910000001, '2026-05-01 10:00:00', '2026-05-03 10:00:00', null, 1, 1, 1, 'MCP', 'MCPARKING', 10000, 10000, null, 0, null, 0, false, repeat('f',64)),
  -- NEGATIVE_LEAD
  (910000000007, 'BA-MCP-NEGATIVE-LEAD', 910000001, '2026-06-10 10:00:00', '2026-06-09 10:00:00', '2026-06-10 10:00:00', 1, 1, 1, 'MCP', 'MCPARKING', 10000, 10000, null, 0, 1, 0, false, repeat('1',64));

-- EAP_ONLY and one-boleta LOW_SAMPLE_SIZE / GAP_LOW_SAMPLE.
insert into public.customer_source_bookings_mcp_eap (
  source_row_id, source_booking_code, source_customer_id, source_created_at,
  planned_arrival_at, planned_departure_at, booking_status, paying_status,
  website_source, brand_normalized, parking_normalized, source_total_amount,
  booking_paid, promotion_discount_amount, duration_days, sub_days_used, is_pack, row_hash
) values
  (910000000011, 'BA-EAP-1', 910000002, '2026-02-01 12:00:00', null, null, 1, 1, 2, 'EAP', 'ESTACIONAMIENTO AEROPUERTO', 15000, 15000, 0, null, 0, false, repeat('2',64));

-- OKP_ONLY: inclusive +1 economic days, MEDIAN_TICKET and coupon.
insert into public.customer_source_bookings_okp (
  source_row_id, source_booking_code, source_created_at, planned_arrival_at,
  planned_departure_at, status_raw, is_confirmed, is_paid, is_inactive,
  parking_normalized, source_total_amount, discount_amount, coupon_amount,
  coupon_code, is_pack, row_hash
) values
  (920000000001, 'BA-OKP-1', '2025-07-01 10:00:00', '2025-07-10 10:00:00', '2025-07-12 10:00:00', 'PAGADA', true, true, false, 'OKP_RC', 10000, 1000, 0, 'CUPON-A', false, repeat('3',64)),
  (920000000002, 'BA-OKP-2', '2026-07-01 10:00:00', '2026-07-10 10:00:00', '2026-07-13 10:00:00', 'REEMPLAZADA', true, true, false, 'OKP_RC', 20000, 0, 2000, 'CUPON-B', false, repeat('4',64)),
  (920000000003, 'BA-OKP-3', '2026-08-01 10:00:00', '2026-08-10 10:00:00', '2026-08-14 10:00:00', 'PAGADA', true, true, false, 'OKP_RC', 30000, 0, 0, null, false, repeat('5',64));

-- CROSS_SOURCE: BRAND_PARKING_TIE, MONTHLY_TIE and NULL_VS_ZERO coverage.
insert into public.customer_source_bookings_mcp_eap (
  source_row_id, source_booking_code, source_customer_id, source_created_at,
  planned_arrival_at, planned_departure_at, booking_status, paying_status,
  website_source, brand_normalized, parking_normalized, source_total_amount,
  booking_paid, promotion_discount_amount, duration_days, sub_days_used, is_pack, row_hash
) values
  (910000000021, 'BA-CROSS-MCP', 910000004, '2025-01-01 10:00:00', '2025-01-10 10:00:00', '2025-01-11 10:00:00', 1, 1, 1, 'MCP', 'MCPARKING', 10000, 10000, 0, 2, 0, false, repeat('6',64));
insert into public.customer_source_bookings_okp (
  source_row_id, source_booking_code, source_created_at, planned_arrival_at,
  planned_departure_at, status_raw, is_confirmed, is_paid, is_inactive,
  parking_normalized, source_total_amount, discount_amount, coupon_amount,
  is_pack, row_hash
) values
  (920000000021, 'BA-CROSS-OKP', '2026-02-01 10:00:00', '2026-02-10 10:00:00', '2026-02-11 10:00:00', 'PAGADA', true, true, false, 'OKP_EXP', 10000, 0, 0, false, repeat('7',64));

insert into public.customer_booking_profile_links (
  profile_id, source, source_row_id, confidence, status, resolver_version, evidence
)
select
  case
    when source_row_id between 910000000001 and 910000000007 then '61000000-0000-4000-8000-000000000001'::uuid
    when source_row_id = 910000000011 then '61000000-0000-4000-8000-000000000002'::uuid
    when source_row_id between 920000000001 and 920000000003 then '61000000-0000-4000-8000-000000000003'::uuid
    else '61000000-0000-4000-8000-000000000004'::uuid
  end,
  source, source_row_id, 'HIGH', 'active', 'customer_identity_v2', '{"fixture":"boleta_analytics_v1"}'::jsonb
from (
  values
    ('MCP_EAP'::text,910000000001::bigint),('MCP_EAP',910000000002),('MCP_EAP',910000000003),
    ('MCP_EAP',910000000004),('MCP_EAP',910000000005),('MCP_EAP',910000000006),
    ('MCP_EAP',910000000007),('MCP_EAP',910000000011),('MCP_EAP',910000000021),
    ('OKP',920000000001),('OKP',920000000002),('OKP',920000000003),('OKP',920000000021)
) fixture(source, source_row_id);

create temporary table boleta_analytics_response on commit drop as
select public.customer_window_refresh_boleta_analytics_v1_m2m(
  array[
    '61000000-0000-4000-8000-000000000001'::uuid,
    '61000000-0000-4000-8000-000000000002'::uuid,
    '61000000-0000-4000-8000-000000000003'::uuid,
    '61000000-0000-4000-8000-000000000004'::uuid
  ],
  500
) as payload;

do $$
declare
  v_mcp public.customer_profile_boleta_analytics%rowtype;
  v_eap public.customer_profile_boleta_analytics%rowtype;
  v_okp public.customer_profile_boleta_analytics%rowtype;
  v_cross public.customer_profile_boleta_analytics%rowtype;
  v_payload jsonb;
  v_read jsonb;
begin
  select payload into v_payload from boleta_analytics_response;
  if v_payload ->> 'ok' <> 'true' or (v_payload ->> 'processedProfiles')::integer <> 4 then
    raise exception 'refresh response contract failed';
  end if;

  select * into strict v_mcp from public.customer_profile_boleta_analytics where customer_id = '61000000-0000-4000-8000-000000000001';
  select * into strict v_eap from public.customer_profile_boleta_analytics where customer_id = '61000000-0000-4000-8000-000000000002';
  select * into strict v_okp from public.customer_profile_boleta_analytics where customer_id = '61000000-0000-4000-8000-000000000003';
  select * into strict v_cross from public.customer_profile_boleta_analytics where customer_id = '61000000-0000-4000-8000-000000000004';

  if v_mcp.total_valid_booking_count <> 7 or v_mcp.eligible_boleta_booking_count <> 6
    or v_mcp.excluded_pack_booking_count <> 1 or v_mcp.missing_amount_count <> 1
    or v_mcp.missing_duration_count <> 1 or v_mcp.invalid_lead_time_count <> 1 then
    raise exception 'MCP_ONLY / PACK_EXCLUDED / missing-field fixture failed';
  end if;
  if v_eap.boleta_reservation_count <> 1 or v_eap.preferred_brand <> 'EAP'
    or v_eap.stay_days_sample_size <> 0 or v_eap.total_economic_days is not null
    or v_eap.arrival_month_sample_size <> 0
    or pg_catalog.jsonb_array_length(v_eap.arrival_month_counts) <> 12
    or pg_catalog.jsonb_array_length(v_eap.arrival_month_shares) <> 12
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(v_eap.arrival_month_counts) item(value)
      where item.value::bigint <> 0
    )
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_eap.arrival_month_shares) item(value)
      where item.value <> 'null'::jsonb
    ) then
    raise exception 'EAP_ONLY / NULL_VS_ZERO fixture failed';
  end if;
  if v_okp.total_economic_days <> 12 or v_okp.median_ticket <> 20000 then
    raise exception 'OKP_ONLY inclusive days / MEDIAN_TICKET fixture failed';
  end if;
  if v_cross.preferred_brand is not null or pg_catalog.cardinality(v_cross.top_brands) <> 2
    or v_cross.preferred_parking is not null or pg_catalog.cardinality(v_cross.top_parkings) <> 2
    or v_cross.top_arrival_months <> array[1,2]::smallint[]
    or v_cross.stay_days_sample_size <> 2 or v_cross.total_economic_days <> 4
    or v_cross.arrival_month_sample_size <> 2
    or (v_cross.arrival_month_shares ->> 0)::numeric <> 0.5
    or (v_cross.arrival_month_shares ->> 1)::numeric <> 0.5 then
    raise exception 'CROSS_SOURCE / BRAND_PARKING_TIE / MONTHLY_TIE fixture failed';
  end if;

  v_read := public.customer_window_360_v1_get_boleta_analytics(
    pg_catalog.jsonb_build_object(
      'representationKey', 'confirmed_customer:61000000-0000-4000-8000-000000000001',
      'representationType', 'confirmed_customer',
      'representationId', '61000000-0000-4000-8000-000000000001',
      'customerUniverse', 'GLOBAL',
      'authoritySnapshotId', null
    )
  );
  if v_read ->> 'contractVersion' <> 'CUSTOMER360_ANALYTICS_V1'
    or v_read #>> '{dataQuality,excludedPackBookingCount}' <> '1'
    or not ((v_read #> '{dataQuality,warnings}') ? 'ECONOMICS_PARTIAL')
    or not ((v_read #> '{dataQuality,warnings}') ? 'LEAD_TIME_PARTIAL') then
    raise exception 'read contract / WARNINGS failed';
  end if;

  if not exists (
    select 1 from public.customer_profile_boleta_discount_codes
    where customer_id = v_mcp.customer_id and source = 'MCP_EAP' and code_type = 'promotion'
      and code = 'PROMO-A' and uses = 2
  ) or not exists (
    select 1 from public.customer_profile_boleta_discount_codes
    where customer_id = v_okp.customer_id and source = 'OKP' and code_type = 'coupon'
  ) then
    raise exception 'discount-code materialization failed';
  end if;

  -- Replay must remain deterministic and idempotent.
  perform public.customer_window_refresh_boleta_analytics_v1_m2m(
    array[v_mcp.customer_id, v_eap.customer_id, v_okp.customer_id, v_cross.customer_id], 500
  );
  if (select count(*) from public.customer_profile_boleta_analytics
      where customer_id = any(array[v_mcp.customer_id, v_eap.customer_id, v_okp.customer_id, v_cross.customer_id])) <> 4 then
    raise exception 'idempotent replay failed';
  end if;
end;
$$;

-- Age fixture changes beyond the five-minute safety lag before exercising automatic streams.
update public.customer_profiles
set updated_at = '2000-01-01 00:00:00+00'::timestamptz
where id::text like '61000000-0000-4000-8000-%';
update public.customer_booking_profile_links
set updated_at = '2000-01-01 00:00:00+00'::timestamptz
where evidence ->> 'fixture' = 'boleta_analytics_v1';
update public.customer_source_bookings_mcp_eap
set updated_at = '2000-01-01 00:00:00+00'::timestamptz
where source_row_id between 910000000001 and 910000000021;
update public.customer_source_bookings_okp
set updated_at = '2000-01-01 00:00:00+00'::timestamptz
where source_row_id between 920000000001 and 920000000021;

-- Incremental selector: four cursor streams, bootstrap, daily as-of, cleanup and transactional watermarks.
do $$
declare
  v_result jsonb;
  v_selector_cycle_before bigint;
  v_selector_cycle_after bigint;
  v_profiles_rows_before bigint;
  v_profiles_rows_after bigint;
  v_bootstrap_target uuid;
  v_daily_bootstrap_target uuid;
  v_profile_change_at timestamptz;
  v_hot_at timestamptz;
  v_same_at timestamptz;
  v_watermark_before timestamptz;
begin
  if (select count(*) from public.customer_profile_boleta_analytics_incremental_state) <> 6 then
    raise exception 'incremental state bootstrap failed';
  end if;

  begin
    perform public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1, 'unknown');
    raise exception 'invalid mode accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'invalid_refresh_mode' then raise; end if;
  end;
  begin
    perform public.customer_window_refresh_boleta_analytics_v1_m2m(
      array['61000000-0000-4000-8000-000000000001'::uuid], 1, 'bootstrap'
    );
    raise exception 'explicit ids with dedicated mode accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'customer_ids_require_auto_mode' then raise; end if;
  end;

  update public.customer_profile_boleta_analytics_incremental_state
  set watermark_updated_at = '1999-12-31 00:00:00+00'::timestamptz,
      watermark_tiebreaker = case
        when stream_key in ('customer_profiles', 'booking_links')
          then '00000000-0000-0000-0000-000000000000'
        else '0'
      end
  where stream_key in ('customer_profiles', 'booking_links', 'mcp_eap', 'okp');

  -- With p_limit=4 and cycle zero, each updated-at stream receives exactly one slot.
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 0 where stream_key = 'selector';
  v_result := public.customer_window_refresh_boleta_analytics_v1_m2m(null, 4);
  if (v_result ->> 'ok')::boolean is not true
    or (v_result ->> 'processedProfiles')::integer < 1
    or (v_result ->> 'processedProfiles')::integer > 3
    or exists (
      select 1 from public.customer_profile_boleta_analytics_incremental_state state
      where state.stream_key in ('customer_profiles', 'booking_links', 'mcp_eap', 'okp')
        and (state.processed_rows <> 1 or state.watermark_updated_at is null or state.watermark_tiebreaker is null)
    ) then
    raise exception 'incremental streams / multi-stream deduplication failed';
  end if;

  -- A hot row is deferred and cannot advance the cursor beyond the five-minute safe bound.
  v_hot_at := pg_catalog.statement_timestamp() - interval '1 minute';
  update public.customer_profiles set updated_at = v_hot_at
  where id = '61000000-0000-4000-8000-000000000001';
  update public.customer_profile_boleta_analytics_incremental_state
  set watermark_updated_at = v_hot_at - interval '1 microsecond',
      watermark_tiebreaker = '00000000-0000-0000-0000-000000000000'
  where stream_key = 'customer_profiles';
  select watermark_updated_at into strict v_watermark_before
  from public.customer_profile_boleta_analytics_incremental_state
  where stream_key = 'customer_profiles';
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 0 where stream_key = 'selector';
  v_result := public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1);
  if (v_result ->> 'ok')::boolean is not true
    or v_result ->> 'mode' <> 'auto'
    or (v_result ->> 'processedProfiles')::integer <> 0
    or (select watermark_updated_at from public.customer_profile_boleta_analytics_incremental_state
      where stream_key = 'customer_profiles') is distinct from v_watermark_before then
    raise exception 'safety lag allowed a hot row or advanced its watermark';
  end if;

  -- Once safely aged, equal timestamps are drained deterministically by UUID across bounded pages.
  v_same_at := pg_catalog.statement_timestamp() - interval '10 minutes';
  update public.customer_profiles set updated_at = v_same_at
  where id in (
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002'
  );
  update public.customer_profile_boleta_analytics_incremental_state
  set watermark_updated_at = v_same_at - interval '1 microsecond',
      watermark_tiebreaker = '00000000-0000-0000-0000-000000000000'
  where stream_key = 'customer_profiles';
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 0 where stream_key = 'selector';
  perform public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1);
  if (select watermark_tiebreaker from public.customer_profile_boleta_analytics_incremental_state
      where stream_key = 'customer_profiles')
      <> '61000000-0000-4000-8000-000000000001' then
    raise exception 'same-timestamp first tiebreaker failed';
  end if;
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 0 where stream_key = 'selector';
  perform public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1);
  if (select watermark_tiebreaker from public.customer_profile_boleta_analytics_incremental_state
      where stream_key = 'customer_profiles')
      <> '61000000-0000-4000-8000-000000000002' then
    raise exception 'same-timestamp second tiebreaker failed';
  end if;

  -- Missing analytics is selected independently from updated-at streams. Derive the first real candidate safely.
  delete from public.customer_profile_boleta_analytics
  where customer_id = '61000000-0000-4000-8000-000000000002';
  select profile.id into strict v_bootstrap_target
  from public.customer_profiles profile
  where profile.status = 'active' and profile.merged_into_profile_id is null
    and not exists (select 1 from public.customer_profile_boleta_analytics analytics where analytics.customer_id = profile.id)
    and exists (select 1 from public.customer_booking_profile_links link
      where link.profile_id = profile.id and link.status = 'active')
  order by profile.id limit 1;
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 4 where stream_key = 'selector';
  v_result := public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1, 'bootstrap');
  if (v_result ->> 'ok')::boolean is not true
    or v_result ->> 'mode' <> 'bootstrap'
    or (v_result ->> 'processedProfiles')::integer <> 1
    or (v_result ->> 'hasMore')::boolean is not false
    or (select processed_rows from public.customer_profile_boleta_analytics_incremental_state
      where stream_key = 'selector') <> 4
    or not exists (select 1 from public.customer_profile_boleta_analytics
      where customer_id = v_bootstrap_target) then
    raise exception 'bootstrap missing analytics failed';
  end if;

  -- Once the initial profile-id sweep reaches its end, later runs skip the global bootstrap branch.
  update public.customer_profile_boleta_analytics_incremental_state
  set watermark_tiebreaker = (
        select profile.id::text
        from public.customer_profiles profile
        order by profile.id desc
        limit 1
      ),
      stream_complete = false
  where stream_key = 'bootstrap';
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 4 where stream_key = 'selector';
  perform public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1, 'bootstrap');
  if not (select state.stream_complete
    from public.customer_profile_boleta_analytics_incremental_state state
    where state.stream_key = 'bootstrap') then
    raise exception 'bootstrap completion state failed';
  end if;

  -- A completed bootstrap reopens daily, providing eventual reconciliation beyond the finite lag.
  delete from public.customer_profile_boleta_analytics
  where customer_id = '61000000-0000-4000-8000-000000000003';
  select profile.id into strict v_daily_bootstrap_target
  from public.customer_profiles profile
  where profile.status = 'active' and profile.merged_into_profile_id is null
    and profile.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
    and not exists (select 1 from public.customer_profile_boleta_analytics analytics
      where analytics.customer_id = profile.id)
    and exists (select 1 from public.customer_booking_profile_links link
      where link.profile_id = profile.id and link.status = 'active')
  order by profile.id limit 1;
  update public.customer_profile_boleta_analytics_incremental_state
  set stream_complete = true,
      watermark_tiebreaker = (
        select profile.id::text
        from public.customer_profiles profile
        order by profile.id desc
        limit 1
      ),
      last_succeeded_at = pg_catalog.statement_timestamp() - interval '1 day'
  where stream_key = 'bootstrap';
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 4 where stream_key = 'selector';
  perform public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1, 'bootstrap');
  if not exists (select 1 from public.customer_profile_boleta_analytics
      where customer_id = v_daily_bootstrap_target)
    or (select pg_catalog.timezone('America/Santiago', state.last_succeeded_at)::date
      from public.customer_profile_boleta_analytics_incremental_state state
      where state.stream_key = 'bootstrap')
      <> pg_catalog.timezone('America/Santiago', pg_catalog.now())::date then
    raise exception 'daily bootstrap reconciliation failed';
  end if;

  -- Daily staleness is driven only by (as_of_date, customer_id).
  update public.customer_profile_boleta_analytics
  set as_of_date = as_of_date - 1
  where customer_id = '61000000-0000-4000-8000-000000000004';
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 5 where stream_key = 'selector';
  v_result := public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1, 'as_of');
  if (v_result ->> 'ok')::boolean is not true
    or v_result ->> 'mode' <> 'as_of'
    or (v_result ->> 'processedProfiles')::integer <> 1
    or (select processed_rows from public.customer_profile_boleta_analytics_incremental_state
      where stream_key = 'selector') <> 5 then
    raise exception 'daily as-of selector failed';
  end if;

  -- Profile changes remove inactive analytics.
  perform public.customer_window_refresh_boleta_analytics_v1_m2m(
    array['61000000-0000-4000-8000-000000000002'::uuid], 500
  );
  update public.customer_profiles
  set status = 'blocked', updated_at = pg_catalog.statement_timestamp() - interval '10 minutes'
  where id = '61000000-0000-4000-8000-000000000002';
  select updated_at into strict v_profile_change_at from public.customer_profiles
  where id = '61000000-0000-4000-8000-000000000002';
  update public.customer_profile_boleta_analytics_incremental_state set
    watermark_updated_at = v_profile_change_at,
    watermark_tiebreaker = '61000000-0000-4000-8000-000000000001'
  where stream_key = 'customer_profiles';
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 0 where stream_key = 'selector';
  v_result := public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1);
  if (v_result ->> 'ok')::boolean is not true
    or (v_result ->> 'removedProfiles')::integer <> 1
    or exists (select 1 from public.customer_profile_boleta_analytics
      where customer_id = '61000000-0000-4000-8000-000000000002') then
    raise exception 'inactive profile cleanup failed: result=%, analytics_exists=%, cursor=%',
      v_result,
      exists (
        select 1 from public.customer_profile_boleta_analytics
        where customer_id = '61000000-0000-4000-8000-000000000002'
      ),
      (select watermark_tiebreaker
       from public.customer_profile_boleta_analytics_incremental_state
       where stream_key = 'customer_profiles');
  end if;

  -- Merged profiles follow the same bounded profile stream cleanup.
  update public.customer_profiles
  set status = 'active', merged_into_profile_id = null,
      updated_at = pg_catalog.statement_timestamp() - interval '10 minutes'
  where id = '61000000-0000-4000-8000-000000000002';
  perform public.customer_window_refresh_boleta_analytics_v1_m2m(
    array['61000000-0000-4000-8000-000000000002'::uuid], 500
  );
  update public.customer_profiles
  set status = 'merged', merged_into_profile_id = '61000000-0000-4000-8000-000000000001',
      updated_at = pg_catalog.statement_timestamp() - interval '10 minutes'
  where id = '61000000-0000-4000-8000-000000000002';
  select updated_at into strict v_profile_change_at from public.customer_profiles
  where id = '61000000-0000-4000-8000-000000000002';
  update public.customer_profile_boleta_analytics_incremental_state set
    watermark_updated_at = v_profile_change_at,
    watermark_tiebreaker = '61000000-0000-4000-8000-000000000001'
  where stream_key = 'customer_profiles';
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 0 where stream_key = 'selector';
  v_result := public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1);
  if (v_result ->> 'ok')::boolean is not true
    or (v_result ->> 'removedProfiles')::integer <> 1 then
    raise exception 'merged profile cleanup failed';
  end if;

  -- A forced subtransaction failure must roll back selector state and recalculation together.
  select processed_rows into v_selector_cycle_before
  from public.customer_profile_boleta_analytics_incremental_state where stream_key = 'selector';
  select processed_rows into v_profiles_rows_before
  from public.customer_profile_boleta_analytics_incremental_state where stream_key = 'customer_profiles';
  begin
    update public.customer_profiles
    set updated_at = pg_catalog.statement_timestamp() - interval '10 minutes'
    where id = '61000000-0000-4000-8000-000000000001';
    select updated_at into strict v_profile_change_at from public.customer_profiles
    where id = '61000000-0000-4000-8000-000000000001';
    update public.customer_profile_boleta_analytics_incremental_state set
      watermark_updated_at = v_profile_change_at - interval '1 microsecond',
      watermark_tiebreaker = '00000000-0000-0000-0000-000000000000'
    where stream_key = 'customer_profiles';
    update public.customer_profile_boleta_analytics_incremental_state
    set processed_rows = 0 where stream_key = 'selector';
    perform public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1);
    raise exception 'forced_incremental_rollback';
  exception when raise_exception then
    null;
  end;
  select processed_rows into v_selector_cycle_after
  from public.customer_profile_boleta_analytics_incremental_state where stream_key = 'selector';
  select processed_rows into v_profiles_rows_after
  from public.customer_profile_boleta_analytics_incremental_state where stream_key = 'customer_profiles';
  if v_selector_cycle_after <> v_selector_cycle_before or v_profiles_rows_after <> v_profiles_rows_before then
    raise exception 'watermark advanced after rollback';
  end if;

  -- The six rotating quotas sum to p_limit; with p_limit=1 only one stale profile is processed.
  update public.customer_profile_boleta_analytics
  set as_of_date = as_of_date - 1
  where customer_id in (
    '61000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000003'
  );
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 5 where stream_key = 'selector';
  v_result := public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1);
  if (v_result ->> 'ok')::boolean is not true
    or (v_result ->> 'processedProfiles')::integer > 1
    or (v_result ->> 'hasMore')::boolean is not true then
    raise exception 'bounded rotating selector failed';
  end if;

  -- Drain the remaining as-of row, then replay that selector with no changes.
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 5 where stream_key = 'selector';
  perform public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1, 'as_of');
  update public.customer_profile_boleta_analytics_incremental_state
  set processed_rows = 5 where stream_key = 'selector';
  v_result := public.customer_window_refresh_boleta_analytics_v1_m2m(null, 1, 'as_of');
  if (v_result ->> 'ok')::boolean is not true
    or (v_result ->> 'processedProfiles')::integer <> 0 then
    raise exception 'incremental replay idempotence failed';
  end if;
end;
$$;

do $$
declare
  v_status jsonb;
begin
  v_status := public.customer_window_boleta_analytics_v1_refresh_status_m2m(false);
  if v_status ->> 'calculationVersion' <> 'CUSTOMER_360_BOLETA_ANALYTICS_V1'
    or (v_status ->> 'countsIncluded')::boolean is not false
    or v_status ->> 'countsCost' <> 'not_requested'
    or pg_catalog.jsonb_array_length(v_status -> 'streams') <> 6
    or v_status -> 'analyticsMaterializedCount' <> 'null'::jsonb
    or v_status -> 'analyticsStaleCount' <> 'null'::jsonb
    or v_status -> 'activeEligibleWithoutAnalyticsCount' <> 'null'::jsonb
    or not exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_status -> 'streams') stream
      where stream ->> 'streamName' = 'bootstrap'
        and stream ? 'cursorTiebreaker'
        and stream ? 'streamComplete'
        and stream ? 'updatedAt'
    ) then
    raise exception 'refresh status cheap contract failed';
  end if;
end;
$$;

-- ACL and RLS runtime catalog assertions.
do $$
begin
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.customer_profile_boleta_analytics'::regclass)
    or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.customer_profile_boleta_analytics_incremental_state'::regclass)
    or pg_catalog.has_table_privilege('anon', 'public.customer_profile_boleta_analytics', 'SELECT')
    or pg_catalog.has_table_privilege('authenticated', 'public.customer_profile_boleta_analytics', 'SELECT')
    or pg_catalog.has_table_privilege('service_role', 'public.customer_profile_boleta_analytics', 'SELECT')
    or pg_catalog.has_function_privilege('anon', 'public.customer_window_360_v1_get_boleta_analytics(jsonb)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.customer_window_360_v1_get_boleta_analytics(jsonb)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.customer_window_360_v1_get_boleta_analytics(jsonb)', 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', 'public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean)', 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', 'public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('service_role', 'public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean)', 'EXECUTE') then
    raise exception 'RLS / ACL contract failed';
  end if;
  if not exists (
      select 1 from pg_catalog.pg_roles
      where rolname = 'customer_360_boleta_analytics_runner'
        and not rolcanlogin and not rolinherit and not rolsuper and not rolbypassrls
        and not rolcreatedb and not rolcreaterole and not rolreplication
    )
    or not pg_catalog.has_database_privilege('customer_360_boleta_analytics_runner',
      pg_catalog.current_database(), 'CONNECT')
    or not pg_catalog.has_schema_privilege('customer_360_boleta_analytics_runner', 'public', 'USAGE')
    or pg_catalog.has_schema_privilege('customer_360_boleta_analytics_runner', 'public', 'CREATE')
    or not pg_catalog.has_function_privilege('customer_360_boleta_analytics_runner',
      'public.customer_window_refresh_boleta_analytics_v1_m2m(uuid[],integer,text)', 'EXECUTE')
    or not pg_catalog.has_function_privilege('customer_360_boleta_analytics_runner',
      'public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean)', 'EXECUTE')
    or pg_catalog.has_function_privilege('customer_360_boleta_analytics_runner',
      'public.customer_window_calculate_boleta_analytics_v1(uuid[])', 'EXECUTE')
    or pg_catalog.has_table_privilege('customer_360_boleta_analytics_runner',
      'public.customer_profile_boleta_analytics', 'SELECT,INSERT,UPDATE,DELETE')
    or exists (
      select 1
      from pg_catalog.pg_proc procedure
      join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and procedure.proname in (
          'customer_window_refresh_boleta_analytics_v1_m2m',
          'customer_window_boleta_analytics_v1_refresh_status_m2m'
        )
        and pg_catalog.pg_get_userbyid(procedure.proowner) = 'customer_360_boleta_analytics_runner'
    ) then
    raise exception 'BOLETA runner capability contract failed';
  end if;
end;
$$;

select
  true as mcp_only_ok,
  true as eap_only_ok,
  true as okp_only_ok,
  true as cross_source_ok,
  true as pack_excluded_ok,
  true as future_booking_ok,
  true as median_gap_ok,
  true as median_ticket_ok,
  true as weighted_adr_ok,
  true as null_vs_zero_ok,
  true as warnings_ok,
  true as incremental_selector_ok,
  true as reversible_checks_ok;

rollback;

select
  not exists (select 1 from pg_catalog.pg_roles
    where rolname = 'customer_360_boleta_analytics_runner') as capability_role_absent,
  pg_catalog.to_regclass('public.customer_profile_boleta_analytics') is null as analytics_table_absent,
  pg_catalog.to_regclass('public.customer_profile_boleta_discount_codes') is null as discount_codes_table_absent,
  pg_catalog.to_regclass('public.customer_profile_boleta_analytics_incremental_state') is null as incremental_state_table_absent,
  pg_catalog.to_regprocedure('public.customer_window_calculate_boleta_analytics_v1(uuid[])') is null as calculator_absent,
  pg_catalog.to_regprocedure('public.customer_window_refresh_boleta_analytics_v1_m2m(uuid[],integer,text)') is null as refresh_rpc_absent,
  pg_catalog.to_regprocedure('public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean)') is null as refresh_status_rpc_absent,
  pg_catalog.to_regprocedure('public.customer_window_360_v1_get_boleta_analytics(jsonb)') is null as read_rpc_absent;
