begin;

alter table public.customer_window_classification_rules
  add column gold_reservations_24m smallint not null default 2;

update public.customer_window_classification_rules
set gold_reservations_24m = 2,
    updated_at = pg_catalog.clock_timestamp()
where rule_key = 'CUSTOMER_CLASSIFICATION_V1';

create or replace function public.customer_window_calculate_profile_metrics(p_customer_ids uuid[])
returns table (
  customer_id uuid,
  first_purchase_at timestamp without time zone,
  last_purchase_at timestamp without time zone,
  previous_purchase_at timestamp without time zone,
  total_reservations bigint,
  reservations_12m bigint,
  reservations_24m bigint,
  median_gap_days numeric,
  days_since_last_purchase integer,
  lifecycle_status text,
  tier text,
  tier_rank smallint,
  brand_behavior text,
  pack_status text,
  first_pack_purchase_at timestamp without time zone,
  days_to_first_pack integer,
  mcp_count bigint,
  eap_count bigint,
  okp_count bigint,
  okp_express_count bigint,
  okp_rio_clarillo_count bigint,
  okp_otros_count bigint,
  future_booking_count bigint,
  parking_families text[],
  last_brand text,
  last_parking text,
  as_of_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select
      pg_catalog.timezone('America/Santiago', pg_catalog.now())::date as today,
      rules.*
    from public.customer_window_classification_rules rules
    where rules.rule_key = 'CUSTOMER_CLASSIFICATION_V1'
  ),
  scoped as (
    select
      booking.*,
      case
        when booking.source = 'OKP' then coalesce(parking_rule.parking_family, 'OKP_OTROS')
        else parking_rule.parking_family
      end as parking_family,
      case when booking.brand in ('MCP', 'EAP') then 'MCP_EAP' else 'OKP' end as brand_family
    from public.customer_window_bookings_v booking
    join public.customer_profiles profile
      on profile.id = booking.customer_id and profile.status = 'active'
    left join public.customer_window_parking_family_rules parking_rule
      on parking_rule.source = booking.source and parking_rule.parking = booking.parking
    where booking.customer_id = any(p_customer_ids)
      and booking.purchase_created_at is not null
  ),
  sequenced as (
    select
      scoped.*,
      pg_catalog.lag(purchase_created_at) over (
        partition by customer_id order by purchase_created_at, source, source_row_id
      ) as prior_purchase_at
    from scoped
  ),
  gaps as (
    select customer_id, (purchase_created_at::date - prior_purchase_at::date)::numeric as gap_days
    from sequenced
    where prior_purchase_at is not null
  ),
  gap_summary as (
    select customer_id,
      pg_catalog.percentile_cont(0.5) within group (order by gap_days)::numeric as median_gap_days
    from gaps
    group by customer_id
  ),
  aggregated as (
    select
      scoped.customer_id,
      min(purchase_created_at) as first_purchase_at,
      max(purchase_created_at) as last_purchase_at,
      (pg_catalog.array_agg(purchase_created_at order by purchase_created_at desc, source desc, source_row_id desc))[2] as previous_purchase_at,
      count(*)::bigint as total_reservations,
      count(*) filter (where purchase_created_at >= params.today - interval '12 months')::bigint as reservations_12m,
      count(*) filter (where purchase_created_at >= params.today - interval '24 months')::bigint as reservations_24m,
      min(purchase_created_at) filter (where is_pack is true) as first_pack_purchase_at,
      count(*) filter (where brand = 'MCP')::bigint as mcp_count,
      count(*) filter (where brand = 'EAP')::bigint as eap_count,
      count(*) filter (where brand = 'OKP')::bigint as okp_count,
      count(*) filter (where parking_family = 'OKP_EXPRESS')::bigint as okp_express_count,
      count(*) filter (where parking_family = 'OKP_RIO_CLARILLO')::bigint as okp_rio_clarillo_count,
      count(*) filter (where parking_family = 'OKP_OTROS')::bigint as okp_otros_count,
      count(*) filter (where planned_arrival_at::date > params.today)::bigint as future_booking_count,
      coalesce(pg_catalog.array_agg(distinct parking_family order by parking_family)
        filter (where parking_family is not null), '{}'::text[]) as parking_families,
      (pg_catalog.array_agg(brand order by purchase_created_at desc, source desc, source_row_id desc))[1] as last_brand,
      (pg_catalog.array_agg(parking order by purchase_created_at desc, source desc, source_row_id desc))[1] as last_parking,
      pg_catalog.array_agg(brand_family order by purchase_created_at desc, source desc, source_row_id desc) as brand_history,
      params.today,
      params.lifecycle_reset_years,
      params.silver_reservations_12m,
      params.silver_reservations_24m,
      params.gold_reservations_12m,
      params.gold_historical_reservations,
      params.gold_reservations_24m,
      params.gold_median_gap_days,
      params.platinum_reservations_12m,
      params.platinum_cadence_reservations_12m,
      params.platinum_median_gap_days,
      params.diamond_reservations_12m,
      params.diamond_cadence_reservations_12m,
      params.diamond_median_gap_days,
      params.migration_recent_reservations
    from scoped
    cross join params
    group by scoped.customer_id, params.today, params.lifecycle_reset_years,
      params.silver_reservations_12m, params.silver_reservations_24m,
      params.gold_reservations_12m, params.gold_historical_reservations,
      params.gold_reservations_24m, params.gold_median_gap_days,
      params.platinum_reservations_12m, params.platinum_cadence_reservations_12m, params.platinum_median_gap_days,
      params.diamond_reservations_12m, params.diamond_cadence_reservations_12m, params.diamond_median_gap_days,
      params.migration_recent_reservations
  ),
  classified as (
    select aggregated.*, gap_summary.median_gap_days,
      case
        when total_reservations = 1
          or last_purchase_at >= previous_purchase_at + pg_catalog.make_interval(years => lifecycle_reset_years)
          then 'NEW'
        else 'FREQUENT'
      end as lifecycle_status,
      case
        when reservations_12m >= diamond_reservations_12m
          or (reservations_12m >= diamond_cadence_reservations_12m and gap_summary.median_gap_days <= diamond_median_gap_days)
          then 'DIAMOND'
        when reservations_12m >= platinum_reservations_12m
          or (reservations_12m >= platinum_cadence_reservations_12m and gap_summary.median_gap_days <= platinum_median_gap_days)
          then 'PLATINUM'
        when reservations_12m >= gold_reservations_12m
          or (
            total_reservations >= gold_historical_reservations
            and reservations_24m >= gold_reservations_24m
            and gap_summary.median_gap_days <= gold_median_gap_days
          )
          then 'GOLD'
        when reservations_12m >= silver_reservations_12m or reservations_24m >= silver_reservations_24m then 'SILVER'
        when total_reservations = 1 then 'IRON'
        else 'BRONZE'
      end as tier,
      case
        when mcp_count + eap_count > 0 and okp_count = 0 then 'ONLY_MCP_EAP'
        when okp_count > 0 and mcp_count + eap_count = 0 then 'ONLY_OKP'
        when total_reservations >= migration_recent_reservations
          and brand_history[1:migration_recent_reservations] = pg_catalog.array_fill('MCP_EAP'::text, array[migration_recent_reservations::integer])
          then 'MIGRATED_TO_MCP_EAP'
        when total_reservations >= migration_recent_reservations
          and brand_history[1:migration_recent_reservations] = pg_catalog.array_fill('OKP'::text, array[migration_recent_reservations::integer])
          then 'MIGRATED_TO_OKP'
        else 'ALTERNATING'
      end as brand_behavior
    from aggregated
    left join gap_summary using (customer_id)
  )
  select
    customer_id, first_purchase_at, last_purchase_at, previous_purchase_at,
    total_reservations, reservations_12m, reservations_24m, median_gap_days,
    greatest(0, today - last_purchase_at::date), lifecycle_status,
    tier,
    case tier when 'IRON' then 1 when 'BRONZE' then 2 when 'SILVER' then 3
      when 'GOLD' then 4 when 'PLATINUM' then 5 else 6 end::smallint,
    brand_behavior,
    case when first_pack_purchase_at is null then 'NO_PACK' else 'PACK' end,
    first_pack_purchase_at,
    case when first_pack_purchase_at is null then null
      else greatest(0, first_pack_purchase_at::date - first_purchase_at::date) end,
    mcp_count, eap_count, okp_count, okp_express_count, okp_rio_clarillo_count, okp_otros_count,
    future_booking_count, parking_families, last_brand, last_parking, today
  from classified;
$$;

comment on column public.customer_window_classification_rules.gold_reservations_24m is
  'Minimum recent 24-month activity required by the historical-cadence GOLD rule.';

commit;
