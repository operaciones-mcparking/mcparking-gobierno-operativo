begin;

create table public.customer_commercial_signal_rules (
  signal_key text primary key,
  rule_version text not null,
  label text not null,
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  criteria jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (signal_key in ('PRICE_LIST_BUYER', 'OCCASIONAL_PROMO', 'DISCOUNT_DEPENDENT', 'PACK_CANDIDATE', 'RECOVERABLE')),
  check (rule_version = 'customer_signals_v1')
);

insert into public.customer_commercial_signal_rules
  (signal_key, rule_version, label, confidence, criteria)
values
  ('PRICE_LIST_BUYER', 'customer_signals_v1', 'Compra a precio lista', 'HIGH',
    '{"minimumBoletas":3,"discountUsagePct":0}'::jsonb),
  ('OCCASIONAL_PROMO', 'customer_signals_v1', 'Ocasionalmente promocional', 'MEDIUM',
    '{"minimumBoletas":3,"discountUsagePctExclusiveMinimum":0,"discountUsagePctMaximum":0.5}'::jsonb),
  ('DISCOUNT_DEPENDENT', 'customer_signals_v1', 'Dependiente de descuento', 'HIGH',
    '{"minimumBoletas":4,"discountUsagePctMinimum":0.75,"weightedDiscountPctMinimum":0.25}'::jsonb),
  ('PACK_CANDIDATE', 'customer_signals_v1', 'Candidato a Pack', 'HIGH',
    '{"high":{"packCount":0,"minimumBoletas":4,"minimumEconomicDays":23,"minimumReservations12m":2},"medium":{"packCount":0,"minimumBoletas":2,"minimumEconomicDays":13,"minimumReservations12m":1}}'::jsonb),
  ('RECOVERABLE', 'customer_signals_v1', 'Recuperable', 'HIGH',
    '{"minimumReservations":3,"minimumIntervals":2,"minimumRecencyRatio":2,"timezone":"America/Santiago"}'::jsonb);

create table public.customer_commercial_signals (
  customer_id uuid not null references public.customer_profiles(id),
  signal_key text not null references public.customer_commercial_signal_rules(signal_key),
  rule_version text not null,
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  evidence jsonb not null,
  is_active boolean not null default true,
  as_of_at timestamptz not null,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (customer_id, signal_key),
  check (rule_version = 'customer_signals_v1'),
  check (jsonb_typeof(evidence) = 'object')
);

create table public.customer_commercial_signal_evaluations (
  customer_id uuid primary key references public.customer_profiles(id),
  rule_version text not null check (rule_version = 'customer_signals_v1'),
  source_metrics_updated_at timestamptz,
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customer_commercial_signals_active_key_idx
  on public.customer_commercial_signals(signal_key, confidence, customer_id)
  where is_active is true;

alter table public.customer_commercial_signal_rules enable row level security;
alter table public.customer_commercial_signals enable row level security;
alter table public.customer_commercial_signal_evaluations enable row level security;

revoke all on table public.customer_commercial_signal_rules from public, anon, authenticated, service_role;
revoke all on table public.customer_commercial_signals from public, anon, authenticated, service_role;
revoke all on table public.customer_commercial_signal_evaluations from public, anon, authenticated, service_role;
grant select on table public.customer_commercial_signal_rules to service_role;
grant select on table public.customer_commercial_signals to service_role;
grant select on table public.customer_commercial_signal_evaluations to service_role;

create or replace function public.customer_window_calculate_commercial_signals(p_customer_ids uuid[])
returns table (customer_id uuid, signal_key text, rule_version text, confidence text, evidence jsonb)
language sql
stable
security definer
set search_path = ''
as $function$
with params as (
  select pg_catalog.timezone('America/Santiago', pg_catalog.now())::date as today
),
bookings as materialized (
  select booking.*
  from public.customer_window_bookings_v booking
  join public.customer_profiles profile on profile.id = booking.customer_id and profile.status = 'active'
  where booking.customer_id = any(p_customer_ids)
),
sequenced as (
  select booking.*,
    pg_catalog.lag(booking.purchase_created_at::date) over (
      partition by booking.customer_id
      order by booking.purchase_created_at, booking.source, booking.source_row_id
    ) as previous_purchase_date
  from bookings booking
),
gap_summary as (
  select customer_id,
    count(*) filter (where previous_purchase_date is not null)::integer as interval_count,
    (pg_catalog.percentile_cont(0.5) within group (
      order by purchase_created_at::date - previous_purchase_date
    ) filter (where previous_purchase_date is not null))::numeric as median_purchase_interval_days
  from sequenced
  group by customer_id
),
code_counts as (
  select customer_id, source,
    case when source = 'OKP' then coupon_code else promotion_code end as code,
    count(*)::bigint as uses
  from bookings
  where is_pack is false and economic_eligible is true and economics_available is true
    and case when source = 'OKP' then coupon_code else promotion_code end is not null
  group by customer_id, source, case when source = 'OKP' then coupon_code else promotion_code end
),
code_payload as (
  select customer_id, pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('source', source, 'code', code, 'uses', uses)
    order by uses desc, source, code
  ) as discount_codes
  from code_counts
  group by customer_id
),
aggregated as (
  select booking.customer_id,
    count(*)::bigint as total_reservations,
    max(booking.purchase_created_at) as last_purchase_at,
    count(*) filter (where booking.is_pack is true)::bigint as pack_count,
    count(*) filter (where booking.is_pack is false and booking.economic_eligible is true and booking.economics_available is true)::bigint as boleta_count,
    count(*) filter (where booking.is_pack is false and booking.economic_eligible is true and booking.economics_available is true and booking.discount_amount > 0)::bigint as discounted_boleta_count,
    sum(booking.paid_amount) filter (where booking.is_pack is false and booking.economic_eligible is true and booking.economics_available is true)::numeric as paid_amount,
    sum(booking.list_amount) filter (where booking.is_pack is false and booking.economic_eligible is true and booking.economics_available is true)::numeric as list_amount,
    sum(booking.discount_amount) filter (where booking.is_pack is false and booking.economic_eligible is true and booking.economics_available is true)::numeric as discount_amount,
    sum(booking.economic_days) filter (where booking.is_pack is false and booking.economic_eligible is true and booking.economics_available is true)::bigint as economic_days
  from bookings booking
  group by booking.customer_id
),
facts as (
  select aggregated.*, metrics.reservations_12m,
    gaps.interval_count, gaps.median_purchase_interval_days,
    greatest(0, params.today - aggregated.last_purchase_at::date)::integer as current_recency_days,
    greatest(0, params.today - aggregated.last_purchase_at::date)::numeric / nullif(gaps.median_purchase_interval_days, 0) as recency_ratio,
    aggregated.discounted_boleta_count::numeric / nullif(aggregated.boleta_count, 0) as discount_usage_pct,
    aggregated.discount_amount / nullif(aggregated.list_amount, 0) as weighted_discount_pct,
    aggregated.paid_amount / nullif(aggregated.economic_days, 0) as paid_adr,
    aggregated.list_amount / nullif(aggregated.economic_days, 0) as list_adr,
    aggregated.paid_amount / nullif(aggregated.boleta_count, 0) as average_boleta_ticket,
    coalesce(codes.discount_codes, '[]'::jsonb) as discount_codes
  from aggregated
  join public.customer_profile_metrics metrics on metrics.customer_id = aggregated.customer_id
  left join gap_summary gaps using (customer_id)
  left join code_payload codes using (customer_id)
  cross join params
),
base_signals as (
  select facts.customer_id, 'PRICE_LIST_BUYER'::text as signal_key, 'HIGH'::text as confidence
  from facts where boleta_count >= 3 and discount_usage_pct = 0
  union all
  select facts.customer_id, 'OCCASIONAL_PROMO', 'MEDIUM'
  from facts where boleta_count >= 3 and discount_usage_pct > 0 and discount_usage_pct <= 0.50
  union all
  select facts.customer_id, 'DISCOUNT_DEPENDENT', 'HIGH'
  from facts where boleta_count >= 4 and discount_usage_pct >= 0.75 and weighted_discount_pct >= 0.25
  union all
  select facts.customer_id, 'PACK_CANDIDATE',
    case when boleta_count >= 4 and economic_days >= 23 and reservations_12m >= 2 then 'HIGH' else 'MEDIUM' end
  from facts
  where pack_count = 0 and (
    (boleta_count >= 4 and economic_days >= 23 and reservations_12m >= 2)
    or (boleta_count >= 2 and economic_days >= 13 and reservations_12m >= 1)
  )
  union all
  select facts.customer_id, 'RECOVERABLE', 'HIGH'
  from facts
  where total_reservations >= 3 and interval_count >= 2
    and median_purchase_interval_days > 0 and recency_ratio >= 2
)
select signal.customer_id, signal.signal_key, 'customer_signals_v1'::text, signal.confidence,
  case signal.signal_key
    when 'RECOVERABLE' then pg_catalog.jsonb_build_object(
      'totalReservations', facts.total_reservations, 'lastPurchaseAt', facts.last_purchase_at,
      'currentRecencyDays', facts.current_recency_days, 'intervalCount', facts.interval_count,
      'medianPurchaseIntervalDays', facts.median_purchase_interval_days, 'recencyRatio', facts.recency_ratio
    )
    when 'PACK_CANDIDATE' then pg_catalog.jsonb_build_object(
      'boletaCount', facts.boleta_count, 'packCount', facts.pack_count, 'economicDays', facts.economic_days,
      'reservations12m', facts.reservations_12m, 'totalReservations', facts.total_reservations,
      'lastPurchaseAt', facts.last_purchase_at, 'paidAmount', facts.paid_amount,
      'averageBoletaTicket', facts.average_boleta_ticket
    )
    else pg_catalog.jsonb_build_object(
      'boletaCount', facts.boleta_count, 'discountedBoletaCount', facts.discounted_boleta_count,
      'discountUsagePct', facts.discount_usage_pct, 'weightedDiscountPct', facts.weighted_discount_pct,
      'paidAdr', facts.paid_adr, 'listAdr', facts.list_adr,
      'averageBoletaTicket', facts.average_boleta_ticket, 'discountCodes', facts.discount_codes
    )
  end as evidence
from base_signals signal
join facts using (customer_id);
$function$;

create or replace function public.customer_window_refresh_commercial_signals_m2m(p_customer_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_result jsonb;
begin
  if p_customer_ids is null or pg_catalog.cardinality(p_customer_ids) < 1 or pg_catalog.cardinality(p_customer_ids) > 500 then
    raise exception 'Invalid customer signal batch' using errcode = '22023';
  end if;

  with requested as materialized (
    select distinct requested_id as customer_id from pg_catalog.unnest(p_customer_ids) requested_id
  ),
  calculated as materialized (
    select * from public.customer_window_calculate_commercial_signals(
      (select pg_catalog.array_agg(customer_id order by customer_id) from requested)
    )
  ),
  upserted as (
    insert into public.customer_commercial_signals
      (customer_id, signal_key, rule_version, confidence, evidence, is_active, as_of_at, deactivated_at, updated_at)
    select customer_id, signal_key, rule_version, confidence, evidence, true,
      pg_catalog.clock_timestamp(), null, pg_catalog.clock_timestamp()
    from calculated
    on conflict (customer_id, signal_key) do update set
      rule_version = excluded.rule_version, confidence = excluded.confidence,
      evidence = excluded.evidence, is_active = true, as_of_at = excluded.as_of_at,
      deactivated_at = null, updated_at = excluded.updated_at
    returning customer_id, signal_key
  ),
  deactivated as (
    update public.customer_commercial_signals signal set
      is_active = false, deactivated_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
    where signal.customer_id in (select customer_id from requested)
      and signal.is_active is true
      and not exists (
        select 1 from calculated
        where calculated.customer_id = signal.customer_id and calculated.signal_key = signal.signal_key
      )
    returning signal.customer_id, signal.signal_key
  ),
  evaluated as (
    insert into public.customer_commercial_signal_evaluations
      (customer_id, rule_version, source_metrics_updated_at, evaluated_at, updated_at)
    select requested.customer_id, 'customer_signals_v1', metrics.updated_at,
      pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
    from requested
    join public.customer_profile_metrics metrics on metrics.customer_id = requested.customer_id
    on conflict (customer_id) do update set
      rule_version = excluded.rule_version, source_metrics_updated_at = excluded.source_metrics_updated_at,
      evaluated_at = excluded.evaluated_at, updated_at = excluded.updated_at
    returning customer_id
  )
  select pg_catalog.jsonb_build_object(
    'ok', true, 'ruleVersion', 'customer_signals_v1',
    'evaluatedCustomers', (select count(*) from evaluated),
    'activeSignals', (select count(*) from upserted),
    'deactivatedSignals', (select count(*) from deactivated)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.customer_window_get_commercial_signals(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
select pg_catalog.jsonb_build_object(
  'ok', true, 'code', 'customer_signals_found', 'customerId', p_customer_id,
  'ruleVersion', 'customer_signals_v1',
  'signals', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'signalKey', signal.signal_key, 'label', rules.label, 'confidence', signal.confidence,
    'evidence', signal.evidence, 'asOfAt', signal.as_of_at
  ) order by signal.signal_key) filter (where signal.signal_key is not null), '[]'::jsonb)
)
from public.customer_profiles profile
left join public.customer_commercial_signals signal
  on signal.customer_id = profile.id and signal.is_active is true and signal.rule_version = 'customer_signals_v1'
left join public.customer_commercial_signal_rules rules on rules.signal_key = signal.signal_key and rules.is_active is true
where profile.id = p_customer_id and profile.status = 'active'
group by profile.id;
$function$;

create or replace function public.customer_window_get_commercial_signal_candidates_m2m(
  p_after_customer_id uuid default null, p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_ids uuid[]; v_more boolean;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid commercial signal candidate limit' using errcode = '22023';
  end if;
  select pg_catalog.array_agg(customer_id order by customer_id) into v_ids
  from (
    select metrics.customer_id
    from public.customer_profile_metrics metrics
    left join public.customer_commercial_signal_evaluations evaluation on evaluation.customer_id = metrics.customer_id
    where (p_after_customer_id is null or metrics.customer_id > p_after_customer_id)
      and (evaluation.customer_id is null or evaluation.rule_version <> 'customer_signals_v1'
        or metrics.updated_at > evaluation.source_metrics_updated_at)
    order by metrics.customer_id limit p_limit + 1
  ) candidates;
  v_more := coalesce(pg_catalog.cardinality(v_ids), 0) > p_limit;
  if v_more then v_ids := v_ids[1:p_limit]; end if;
  return pg_catalog.jsonb_build_object('ok', true, 'customerIds', coalesce(pg_catalog.to_jsonb(v_ids), '[]'::jsonb),
    'count', coalesce(pg_catalog.cardinality(v_ids), 0),
    'nextCursor', case when pg_catalog.cardinality(v_ids) > 0 then v_ids[pg_catalog.cardinality(v_ids)] else null end,
    'hasMore', v_more, 'ruleVersion', 'customer_signals_v1');
end;
$function$;

revoke all on function public.customer_window_calculate_commercial_signals(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_refresh_commercial_signals_m2m(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_get_commercial_signals(uuid) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_get_commercial_signal_candidates_m2m(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.customer_window_calculate_commercial_signals(uuid[]) to service_role;
grant execute on function public.customer_window_refresh_commercial_signals_m2m(uuid[]) to service_role;
grant execute on function public.customer_window_get_commercial_signals(uuid) to service_role;
grant execute on function public.customer_window_get_commercial_signal_candidates_m2m(uuid, integer) to service_role;

comment on table public.customer_commercial_signals is
  'Current versioned and explainable Customer Window commercial signals without PII.';

commit;
