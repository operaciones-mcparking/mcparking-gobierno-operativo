begin;

create table public.customer_profile_metrics (
  customer_id uuid primary key references public.customer_profiles(id),
  first_purchase_at timestamp without time zone not null,
  last_purchase_at timestamp without time zone not null,
  previous_purchase_at timestamp without time zone,
  total_reservations bigint not null,
  reservations_12m bigint not null,
  reservations_24m bigint not null,
  median_gap_days numeric,
  days_since_last_purchase integer not null,
  lifecycle_status text not null,
  tier text not null,
  tier_rank smallint not null,
  brand_behavior text not null,
  pack_status text not null,
  first_pack_purchase_at timestamp without time zone,
  days_to_first_pack integer,
  mcp_count bigint not null,
  eap_count bigint not null,
  okp_count bigint not null,
  okp_express_count bigint not null,
  okp_rio_clarillo_count bigint not null,
  okp_otros_count bigint not null,
  future_booking_count bigint not null,
  parking_families text[] not null default '{}'::text[],
  last_brand text,
  last_parking text,
  as_of_date date not null,
  updated_at timestamptz not null default now(),
  constraint customer_profile_metrics_counts_check check (
    total_reservations >= 1 and reservations_12m >= 0 and reservations_24m >= 0
    and mcp_count >= 0 and eap_count >= 0 and okp_count >= 0
    and okp_express_count >= 0 and okp_rio_clarillo_count >= 0 and okp_otros_count >= 0
    and future_booking_count >= 0
  ),
  constraint customer_profile_metrics_lifecycle_check
    check (lifecycle_status in ('NEW', 'FREQUENT')),
  constraint customer_profile_metrics_tier_check
    check (tier in ('IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND')),
  constraint customer_profile_metrics_tier_rank_check check (tier_rank between 1 and 6),
  constraint customer_profile_metrics_brand_behavior_check check (
    brand_behavior in ('ONLY_MCP_EAP', 'ONLY_OKP', 'MIGRATED_TO_MCP_EAP', 'MIGRATED_TO_OKP', 'ALTERNATING')
  ),
  constraint customer_profile_metrics_pack_status_check check (pack_status in ('PACK', 'NO_PACK')),
  constraint customer_profile_metrics_parking_families_check check (
    parking_families <@ array['MCP', 'EAP', 'OKP_RIO_CLARILLO', 'OKP_EXPRESS', 'OKP_OTROS']::text[]
  )
);

create table public.customer_window_classification_rules (
  rule_key text primary key,
  lifecycle_reset_years smallint not null,
  silver_reservations_12m smallint not null,
  silver_reservations_24m smallint not null,
  gold_reservations_12m smallint not null,
  gold_historical_reservations smallint not null,
  gold_median_gap_days smallint not null,
  platinum_reservations_12m smallint not null,
  platinum_cadence_reservations_12m smallint not null,
  platinum_median_gap_days smallint not null,
  diamond_reservations_12m smallint not null,
  diamond_cadence_reservations_12m smallint not null,
  diamond_median_gap_days smallint not null,
  migration_recent_reservations smallint not null,
  updated_at timestamptz not null default now(),
  constraint customer_window_classification_rules_key_check check (rule_key = 'CUSTOMER_CLASSIFICATION_V1')
);

insert into public.customer_window_classification_rules (
  rule_key, lifecycle_reset_years,
  silver_reservations_12m, silver_reservations_24m,
  gold_reservations_12m, gold_historical_reservations, gold_median_gap_days,
  platinum_reservations_12m, platinum_cadence_reservations_12m, platinum_median_gap_days,
  diamond_reservations_12m, diamond_cadence_reservations_12m, diamond_median_gap_days,
  migration_recent_reservations
) values (
  'CUSTOMER_CLASSIFICATION_V1', 2,
  2, 3,
  3, 3, 64,
  4, 3, 20,
  11, 6, 9,
  3
);

create table public.customer_window_parking_family_rules (
  source text not null,
  parking text not null,
  parking_family text not null,
  primary key (source, parking),
  constraint customer_window_parking_family_source_check check (source in ('OKP', 'MCP_EAP')),
  constraint customer_window_parking_family_check check (
    parking_family in ('MCP', 'EAP', 'OKP_RIO_CLARILLO', 'OKP_EXPRESS', 'OKP_OTROS')
  )
);

insert into public.customer_window_parking_family_rules (source, parking, parking_family) values
  ('MCP_EAP', 'MCPARKING', 'MCP'),
  ('MCP_EAP', 'MCPARKING VESPUCIO', 'MCP'),
  ('MCP_EAP', 'ESTACIONAMIENTO AEROPUERTO', 'EAP'),
  ('OKP', 'OKP_RC', 'OKP_RIO_CLARILLO'),
  ('OKP', 'OKP_EXP', 'OKP_EXPRESS'),
  ('OKP', 'OKP_PREMIUM', 'OKP_OTROS'),
  ('OKP', 'OKP_FIDAE', 'OKP_OTROS');

create index customer_profile_metrics_last_purchase_idx
  on public.customer_profile_metrics(last_purchase_at desc, customer_id);
create index customer_profile_metrics_classification_idx
  on public.customer_profile_metrics(tier, lifecycle_status, brand_behavior, pack_status, last_purchase_at desc, customer_id);
create index customer_profile_metrics_total_reservations_idx
  on public.customer_profile_metrics(total_reservations desc, customer_id);
create index customer_profile_metrics_parking_families_idx
  on public.customer_profile_metrics using gin(parking_families);

alter table public.customer_profile_metrics enable row level security;
alter table public.customer_window_classification_rules enable row level security;
alter table public.customer_window_parking_family_rules enable row level security;

revoke all on table public.customer_profile_metrics from public, anon, authenticated, service_role;
revoke all on table public.customer_window_classification_rules from public, anon, authenticated, service_role;
revoke all on table public.customer_window_parking_family_rules from public, anon, authenticated, service_role;
grant select on table public.customer_profile_metrics to service_role;

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
      params.gold_reservations_12m, params.gold_historical_reservations, params.gold_median_gap_days,
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
          or (total_reservations >= gold_historical_reservations and gap_summary.median_gap_days <= gold_median_gap_days)
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
    with stale_candidates as (
      select link.profile_id
      from public.customer_booking_profile_links link
      join public.customer_profiles profile on profile.id = link.profile_id and profile.status = 'active'
      left join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
      where link.status = 'active'
        and (metrics.customer_id is null
          or metrics.as_of_date < pg_catalog.timezone('America/Santiago', pg_catalog.now())::date)
      union
      select link.profile_id
      from public.customer_booking_profile_links link
      join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
      where link.updated_at > metrics.updated_at
      union
      select link.profile_id
      from public.customer_booking_profile_links link
      join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
      join public.customer_source_bookings_okp source_booking
        on link.source = 'OKP' and source_booking.source_row_id = link.source_row_id
      where link.status = 'active' and source_booking.updated_at > metrics.updated_at
      union
      select link.profile_id
      from public.customer_booking_profile_links link
      join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
      join public.customer_source_bookings_mcp_eap source_booking
        on link.source = 'MCP_EAP' and source_booking.source_row_id = link.source_row_id
      where link.status = 'active' and source_booking.updated_at > metrics.updated_at
      union
      select metrics.customer_id
      from public.customer_profile_metrics metrics
      left join public.customer_profiles profile on profile.id = metrics.customer_id
      where profile.id is null or profile.status <> 'active'
        or not exists (
          select 1 from public.customer_window_bookings_v booking
          where booking.customer_id = metrics.customer_id and booking.purchase_created_at is not null
        )
    ),
    stale as (
      select distinct profile_id
      from stale_candidates
      order by profile_id
      limit p_limit + 1
    )
    select pg_catalog.array_agg(profile_id order by profile_id) into v_ids from stale;
    v_has_more := coalesce(cardinality(v_ids), 0) > p_limit;
    if v_has_more then v_ids := v_ids[1:p_limit]; end if;
  end if;

  if coalesce(cardinality(v_ids), 0) = 0 then
    return pg_catalog.jsonb_build_object('ok', true, 'processedProfiles', 0, 'removedProfiles', 0, 'hasMore', false);
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
        select 1 from public.customer_window_bookings_v booking
        where booking.customer_id = metrics.customer_id and booking.purchase_created_at is not null
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

create or replace function public.customer_window_list_profile_metrics(
  p_page integer default 1,
  p_page_size integer default 50,
  p_tier text default null,
  p_lifecycle_status text default null,
  p_brand_behavior text default null,
  p_pack_status text default null,
  p_parking_family text default null,
  p_order_by text default 'last_purchase_at',
  p_order_direction text default 'desc'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'Invalid pagination' using errcode = '22023';
  end if;
  if p_tier is not null and p_tier not in ('IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND') then
    raise exception 'Invalid tier' using errcode = '22023';
  end if;
  if p_lifecycle_status is not null and p_lifecycle_status not in ('NEW', 'FREQUENT') then
    raise exception 'Invalid lifecycle status' using errcode = '22023';
  end if;
  if p_brand_behavior is not null and p_brand_behavior not in ('ONLY_MCP_EAP', 'ONLY_OKP', 'MIGRATED_TO_MCP_EAP', 'MIGRATED_TO_OKP', 'ALTERNATING') then
    raise exception 'Invalid brand behavior' using errcode = '22023';
  end if;
  if p_pack_status is not null and p_pack_status not in ('PACK', 'NO_PACK') then
    raise exception 'Invalid pack status' using errcode = '22023';
  end if;
  if p_parking_family is not null and p_parking_family not in ('MCP', 'EAP', 'OKP_RIO_CLARILLO', 'OKP_EXPRESS', 'OKP_OTROS') then
    raise exception 'Invalid parking family' using errcode = '22023';
  end if;
  if p_order_by not in ('last_purchase_at', 'total_reservations', 'tier') or p_order_direction not in ('asc', 'desc') then
    raise exception 'Invalid ordering' using errcode = '22023';
  end if;

  with filtered as (
    select metrics.*
    from public.customer_profile_metrics metrics
    where (p_tier is null or metrics.tier = p_tier)
      and (p_lifecycle_status is null or metrics.lifecycle_status = p_lifecycle_status)
      and (p_brand_behavior is null or metrics.brand_behavior = p_brand_behavior)
      and (p_pack_status is null or metrics.pack_status = p_pack_status)
      and (p_parking_family is null or metrics.parking_families @> array[p_parking_family])
  ),
  paged as (
    select * from filtered
    order by
      case when p_order_by = 'last_purchase_at' and p_order_direction = 'desc' then last_purchase_at end desc,
      case when p_order_by = 'last_purchase_at' and p_order_direction = 'asc' then last_purchase_at end asc,
      case when p_order_by = 'total_reservations' and p_order_direction = 'desc' then total_reservations end desc,
      case when p_order_by = 'total_reservations' and p_order_direction = 'asc' then total_reservations end asc,
      case when p_order_by = 'tier' and p_order_direction = 'desc' then tier_rank end desc,
      case when p_order_by = 'tier' and p_order_direction = 'asc' then tier_rank end asc,
      customer_id
    limit p_page_size offset (p_page - 1) * p_page_size
  )
  select pg_catalog.jsonb_build_object(
    'items', coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(paged)), '[]'::jsonb),
    'total', (select count(*)::bigint from filtered),
    'page', p_page,
    'pageSize', p_page_size
  ) into v_result from paged;

  return v_result;
end;
$$;

create or replace function public.customer_window_get_classification_criteria()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'version', rules.rule_key,
    'lifecycle', pg_catalog.jsonb_build_object('resetYears', rules.lifecycle_reset_years),
    'tier', pg_catalog.to_jsonb(rules) - 'rule_key' - 'lifecycle_reset_years' - 'migration_recent_reservations' - 'updated_at',
    'brandBehavior', pg_catalog.jsonb_build_object('migrationRecentReservations', rules.migration_recent_reservations),
    'pack', pg_catalog.jsonb_build_object('packIfAnyHistoricalPack', true),
    'parkingFamilies', (
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(parking_rule) order by source, parking)
      from public.customer_window_parking_family_rules parking_rule
    ),
    'okpFallback', 'OKP_OTROS'
  )
  from public.customer_window_classification_rules rules
  where rules.rule_key = 'CUSTOMER_CLASSIFICATION_V1';
$$;

create or replace function public.customer_window_get_page_identities(p_customer_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_customer_ids is null or cardinality(p_customer_ids) < 1 or cardinality(p_customer_ids) > 100 then
    raise exception 'Invalid customer ID page' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'customerId', identity_link.profile_id,
    'phones', identity_link.phones,
    'emails', identity_link.emails
  ) order by identity_link.profile_id), '[]'::jsonb)
  into v_result
  from (
    select profile_id,
      pg_catalog.array_agg(distinct identity_value_normalized order by identity_value_normalized)
        filter (where identity_type = 'phone') as phones,
      pg_catalog.array_agg(distinct identity_value_normalized order by identity_value_normalized)
        filter (where identity_type = 'email') as emails
    from public.customer_identity_links
    where profile_id = any(p_customer_ids)
      and status = 'active'
      and identity_type in ('phone', 'email')
    group by profile_id
  ) identity_link;

  return pg_catalog.jsonb_build_object('items', v_result);
end;
$$;

revoke all on function public.customer_window_calculate_profile_metrics(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_refresh_profile_metrics_m2m(uuid[], integer)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_list_profile_metrics(integer, integer, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_get_classification_criteria()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_get_page_identities(uuid[])
  from public, anon, authenticated, service_role;

grant execute on function public.customer_window_refresh_profile_metrics_m2m(uuid[], integer) to service_role;
grant execute on function public.customer_window_list_profile_metrics(integer, integer, text, text, text, text, text, text, text) to service_role;
grant execute on function public.customer_window_get_classification_criteria() to service_role;
grant execute on function public.customer_window_get_page_identities(uuid[]) to service_role;

comment on table public.customer_profile_metrics is
  'Persisted, non-PII Customer Window commercial classification read model. Amount metrics are intentionally excluded.';
comment on function public.customer_window_refresh_profile_metrics_m2m(uuid[], integer) is
  'Refreshes explicit or stale customer metric profiles in bounded batches; intended for background execution.';

commit;
