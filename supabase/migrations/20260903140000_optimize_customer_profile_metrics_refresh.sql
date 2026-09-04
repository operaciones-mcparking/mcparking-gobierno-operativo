begin;

create index if not exists customer_profile_metrics_as_of_date_idx
  on public.customer_profile_metrics(as_of_date, customer_id);

create index if not exists customer_booking_profile_links_active_profile_idx
  on public.customer_booking_profile_links(profile_id, source, source_row_id)
  where status = 'active';

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
  selected_links as materialized (
    select link.profile_id, link.source, link.source_row_id
    from public.customer_booking_profile_links link
    join public.customer_profiles profile
      on profile.id = link.profile_id and profile.status = 'active'
    where link.profile_id = any(p_customer_ids)
      and link.status = 'active'
  ),
  scoped as materialized (
    select
      link.profile_id as customer_id,
      'OKP'::text as source,
      booking.source_row_id,
      booking.source_created_at as purchase_created_at,
      booking.planned_arrival_at,
      booking.is_pack,
      'OKP'::text as brand,
      booking.parking_normalized as parking,
      coalesce(parking_rule.parking_family, 'OKP_OTROS') as parking_family,
      'OKP'::text as brand_family
    from selected_links link
    join public.customer_source_bookings_okp booking
      on link.source = 'OKP' and booking.source_row_id = link.source_row_id
    left join public.customer_window_parking_family_rules parking_rule
      on parking_rule.source = 'OKP' and parking_rule.parking = booking.parking_normalized
    where (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
       or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)

    union all

    select
      link.profile_id,
      'MCP_EAP'::text,
      booking.source_row_id,
      booking.source_created_at,
      booking.planned_arrival_at,
      booking.is_pack,
      booking.brand_normalized,
      booking.parking_normalized,
      parking_rule.parking_family,
      'MCP_EAP'::text
    from selected_links link
    join public.customer_source_bookings_mcp_eap booking
      on link.source = 'MCP_EAP' and booking.source_row_id = link.source_row_id
    left join public.customer_window_parking_family_rules parking_rule
      on parking_rule.source = 'MCP_EAP' and parking_rule.parking = booking.parking_normalized
    where booking.booking_status in (1, 8)
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

create or replace function public.customer_window_refresh_profile_metrics_m2m(
  p_customer_ids uuid[] default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_processed integer := 0;
  v_removed integer := 0;
  v_has_more boolean := false;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid refresh limit' using errcode = '22023';
  end if;
  if p_customer_ids is not null and (cardinality(p_customer_ids) < 1 or cardinality(p_customer_ids) > 500) then
    raise exception 'Invalid customer ID batch' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_window_profile_metrics_refresh', 0)
  );

  if p_customer_ids is not null then
    select pg_catalog.array_agg(distinct requested_id order by requested_id)
    into v_ids
    from pg_catalog.unnest(p_customer_ids) requested_id;
  else
    with params as (
      select pg_catalog.timezone('America/Santiago', pg_catalog.now())::date as today
    ),
    missing_metrics as (
      select distinct link.profile_id
      from public.customer_booking_profile_links link
      join public.customer_profiles profile
        on profile.id = link.profile_id and profile.status = 'active'
      left join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
      where link.status = 'active'
        and metrics.customer_id is null
        and (
          (
            link.source = 'OKP'
            and exists (
              select 1
              from public.customer_source_bookings_okp booking
              where booking.source_row_id = link.source_row_id
                and (
                  (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
                  or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
                )
            )
          )
          or (
            link.source = 'MCP_EAP'
            and exists (
              select 1
              from public.customer_source_bookings_mcp_eap booking
              where booking.source_row_id = link.source_row_id
                and booking.booking_status in (1, 8)
            )
          )
        )
      order by link.profile_id
      limit p_limit + 1
    ),
    expired_metrics as (
      select metrics.customer_id as profile_id
      from public.customer_profile_metrics metrics
      join public.customer_profiles profile
        on profile.id = metrics.customer_id and profile.status = 'active'
      cross join params
      where metrics.as_of_date < params.today
      order by metrics.as_of_date, metrics.customer_id
      limit p_limit + 1
    ),
    changed_links as (
      select distinct link.profile_id
      from public.customer_booking_profile_links link
      join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
      where link.updated_at > metrics.updated_at
      order by link.profile_id
      limit p_limit + 1
    ),
    changed_okp as (
      select distinct link.profile_id
      from public.customer_booking_profile_links link
      join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
      join public.customer_source_bookings_okp booking
        on link.source = 'OKP' and booking.source_row_id = link.source_row_id
      where link.status = 'active' and booking.updated_at > metrics.updated_at
      order by link.profile_id
      limit p_limit + 1
    ),
    changed_mcp_eap as (
      select distinct link.profile_id
      from public.customer_booking_profile_links link
      join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
      join public.customer_source_bookings_mcp_eap booking
        on link.source = 'MCP_EAP' and booking.source_row_id = link.source_row_id
      where link.status = 'active' and booking.updated_at > metrics.updated_at
      order by link.profile_id
      limit p_limit + 1
    ),
    removable_metrics as (
      select metrics.customer_id as profile_id
      from public.customer_profile_metrics metrics
      left join public.customer_profiles profile on profile.id = metrics.customer_id
      where profile.id is null
        or profile.status <> 'active'
        or not exists (
          select 1
          from public.customer_booking_profile_links link
          join public.customer_source_bookings_okp booking
            on link.source = 'OKP' and booking.source_row_id = link.source_row_id
          where link.profile_id = metrics.customer_id
            and link.status = 'active'
            and (
              (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
              or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
            )
          union all
          select 1
          from public.customer_booking_profile_links link
          join public.customer_source_bookings_mcp_eap booking
            on link.source = 'MCP_EAP' and booking.source_row_id = link.source_row_id
          where link.profile_id = metrics.customer_id
            and link.status = 'active'
            and booking.booking_status in (1, 8)
        )
      order by metrics.customer_id
      limit p_limit + 1
    ),
    candidate_pool as materialized (
      select profile_id from missing_metrics
      union all
      select profile_id from expired_metrics
      union all
      select profile_id from changed_links
      union all
      select profile_id from changed_okp
      union all
      select profile_id from changed_mcp_eap
      union all
      select profile_id from removable_metrics
    ),
    stale as (
      select distinct profile_id
      from candidate_pool
      order by profile_id
      limit p_limit + 1
    )
    select pg_catalog.array_agg(profile_id order by profile_id)
    into v_ids
    from stale;

    v_has_more := coalesce(cardinality(v_ids), 0) > p_limit;
    if v_has_more then v_ids := v_ids[1:p_limit]; end if;
  end if;

  if coalesce(cardinality(v_ids), 0) = 0 then
    return pg_catalog.jsonb_build_object(
      'ok', true, 'processedProfiles', 0, 'removedProfiles', 0, 'hasMore', false
    );
  end if;

  insert into public.customer_profile_metrics (
    customer_id, first_purchase_at, last_purchase_at, previous_purchase_at,
    total_reservations, reservations_12m, reservations_24m, median_gap_days,
    days_since_last_purchase, lifecycle_status, tier, tier_rank, brand_behavior, pack_status,
    first_pack_purchase_at, days_to_first_pack,
    mcp_count, eap_count, okp_count, okp_express_count, okp_rio_clarillo_count, okp_otros_count,
    future_booking_count, parking_families, last_brand, last_parking, as_of_date, updated_at
  )
  select calculated.*, pg_catalog.clock_timestamp()
  from public.customer_window_calculate_profile_metrics(v_ids) calculated
  on conflict (customer_id) do update set
    first_purchase_at = excluded.first_purchase_at,
    last_purchase_at = excluded.last_purchase_at,
    previous_purchase_at = excluded.previous_purchase_at,
    total_reservations = excluded.total_reservations,
    reservations_12m = excluded.reservations_12m,
    reservations_24m = excluded.reservations_24m,
    median_gap_days = excluded.median_gap_days,
    days_since_last_purchase = excluded.days_since_last_purchase,
    lifecycle_status = excluded.lifecycle_status,
    tier = excluded.tier,
    tier_rank = excluded.tier_rank,
    brand_behavior = excluded.brand_behavior,
    pack_status = excluded.pack_status,
    first_pack_purchase_at = excluded.first_pack_purchase_at,
    days_to_first_pack = excluded.days_to_first_pack,
    mcp_count = excluded.mcp_count,
    eap_count = excluded.eap_count,
    okp_count = excluded.okp_count,
    okp_express_count = excluded.okp_express_count,
    okp_rio_clarillo_count = excluded.okp_rio_clarillo_count,
    okp_otros_count = excluded.okp_otros_count,
    future_booking_count = excluded.future_booking_count,
    parking_families = excluded.parking_families,
    last_brand = excluded.last_brand,
    last_parking = excluded.last_parking,
    as_of_date = excluded.as_of_date,
    updated_at = excluded.updated_at;
  get diagnostics v_processed = row_count;

  delete from public.customer_profile_metrics metrics
  where metrics.customer_id = any(v_ids)
    and (
      not exists (
        select 1 from public.customer_profiles profile
        where profile.id = metrics.customer_id and profile.status = 'active'
      )
      or not exists (
        select 1
        from public.customer_booking_profile_links link
        join public.customer_source_bookings_okp booking
          on link.source = 'OKP' and booking.source_row_id = link.source_row_id
        where link.profile_id = metrics.customer_id
          and link.status = 'active'
          and (
            (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
            or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
          )
        union all
        select 1
        from public.customer_booking_profile_links link
        join public.customer_source_bookings_mcp_eap booking
          on link.source = 'MCP_EAP' and booking.source_row_id = link.source_row_id
        where link.profile_id = metrics.customer_id
          and link.status = 'active'
          and booking.booking_status in (1, 8)
      )
    );
  get diagnostics v_removed = row_count;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'processedProfiles', v_processed,
    'removedProfiles', v_removed,
    'hasMore', v_has_more
  );
end;
$$;

revoke all on function public.customer_window_calculate_profile_metrics(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_refresh_profile_metrics_m2m(uuid[], integer)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_window_refresh_profile_metrics_m2m(uuid[], integer)
  to service_role;

comment on function public.customer_window_refresh_profile_metrics_m2m(uuid[], integer) is
  'Refreshes explicit or stale profile metrics in bounded batches with early-limited candidate selection.';

commit;
