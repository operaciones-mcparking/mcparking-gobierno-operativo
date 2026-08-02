-- Recovery weekly snapshots for canonical attribution results.
-- This migration is intentionally persistence-only: the canonical attribution
-- calculation remains in src/lib/recuperacion/recovery-attribution.ts.

create table if not exists public.recovery_weekly_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null,
  payload_hash text not null,
  week_start date not null,
  week_end date not null,
  snapshot_at timestamptz not null default now(),
  snapshot_kind text not null,
  calculation_version text not null,
  carts_total integer not null,
  recovered_confirmed integer not null,
  recovered_review integer not null,
  unrecovered integer not null,
  operational_recovered integer not null,
  recovered_amount numeric(14,2) not null,
  recovery_rate numeric(8,5) not null,
  trigger_batch_id uuid references public.recovery_import_batches(id) on delete set null,
  latest_cart_batch_id uuid references public.recovery_import_batches(id) on delete set null,
  latest_purchase_batch_id uuid references public.recovery_import_batches(id) on delete set null,
  latest_tracking_batch_id uuid references public.recovery_import_batches(id) on delete set null,
  latest_message_memory_batch_id uuid references public.recovery_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint recovery_weekly_snapshots_snapshot_key_unique unique (snapshot_key),
  constraint recovery_weekly_snapshots_snapshot_key_check check (length(trim(snapshot_key)) > 0),
  constraint recovery_weekly_snapshots_payload_hash_check check (length(trim(payload_hash)) > 0),
  constraint recovery_weekly_snapshots_week_check check (week_end > week_start),
  constraint recovery_weekly_snapshots_kind_check
    check (snapshot_kind in ('batch', 'daily', 'weekly_close', 'manual', 'reconstructed')),
  constraint recovery_weekly_snapshots_calculation_version_check check (length(trim(calculation_version)) > 0),
  constraint recovery_weekly_snapshots_counts_check check (
    carts_total >= 0
    and recovered_confirmed >= 0
    and recovered_review >= 0
    and unrecovered >= 0
    and operational_recovered >= 0
    and recovered_amount >= 0
    and operational_recovered = recovered_confirmed + recovered_review
    and carts_total = operational_recovered + unrecovered
  ),
  constraint recovery_weekly_snapshots_recovery_rate_check check (recovery_rate >= 0 and recovery_rate <= 100)
);

create table if not exists public.recovery_weekly_cart_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.recovery_weekly_snapshots(id) on delete cascade,
  week_start date not null,
  cart_id uuid not null,
  recovery_status text not null,
  attributed_purchase_id uuid,
  attributed_purchase_at timestamptz,
  attributed_amount numeric(14,2),
  attribution_reason text not null,
  match_type text,
  confidence text,
  form_datetime timestamptz not null,
  intended_arrival_at timestamptz,
  cart_batch_id uuid references public.recovery_import_batches(id) on delete set null,
  purchase_batch_id uuid references public.recovery_import_batches(id) on delete set null,
  cart_row_hash text,
  purchase_row_hash text,
  cart_updated_at_source timestamptz,
  purchase_created_at timestamptz,
  created_at timestamptz not null default now(),
  constraint recovery_weekly_cart_snapshots_snapshot_cart_unique unique (snapshot_id, cart_id),
  constraint recovery_weekly_cart_snapshots_status_check
    check (recovery_status in ('recovered_with_amount', 'recovered_pack', 'payment_review', 'unrecovered')),
  constraint recovery_weekly_cart_snapshots_amount_check check (attributed_amount is null or attributed_amount >= 0),
  constraint recovery_weekly_cart_snapshots_match_type_check
    check (match_type is null or match_type in ('email_phone', 'phone', 'email')),
  constraint recovery_weekly_cart_snapshots_confidence_check
    check (confidence is null or confidence in ('high', 'medium', 'low')),
  constraint recovery_weekly_cart_snapshots_status_coherence_check check (
    case recovery_status
      when 'recovered_with_amount' then attributed_purchase_id is not null and attributed_amount > 0
      when 'recovered_pack' then attributed_purchase_id is not null and coalesce(attributed_amount, 0) = 0
      when 'payment_review' then coalesce(attributed_amount, 0) = 0
      when 'unrecovered' then attributed_purchase_id is null and attributed_purchase_at is null and coalesce(attributed_amount, 0) = 0
      else false
    end
  )
);

create index if not exists recovery_weekly_snapshots_week_snapshot_at_idx
  on public.recovery_weekly_snapshots(week_start, snapshot_at desc);

create index if not exists recovery_weekly_snapshots_trigger_batch_idx
  on public.recovery_weekly_snapshots(trigger_batch_id)
  where trigger_batch_id is not null;

create index if not exists recovery_weekly_snapshots_calculation_version_idx
  on public.recovery_weekly_snapshots(calculation_version);

create index if not exists recovery_weekly_snapshots_payload_hash_idx
  on public.recovery_weekly_snapshots(payload_hash);

create index if not exists recovery_weekly_cart_snapshots_snapshot_id_idx
  on public.recovery_weekly_cart_snapshots(snapshot_id);

create index if not exists recovery_weekly_cart_snapshots_cart_id_idx
  on public.recovery_weekly_cart_snapshots(cart_id);

create index if not exists recovery_weekly_cart_snapshots_status_idx
  on public.recovery_weekly_cart_snapshots(recovery_status);

create index if not exists recovery_weekly_cart_snapshots_week_cart_idx
  on public.recovery_weekly_cart_snapshots(week_start, cart_id);

alter table public.recovery_weekly_snapshots enable row level security;
alter table public.recovery_weekly_cart_snapshots enable row level security;

revoke all on table public.recovery_weekly_snapshots from public;
revoke all on table public.recovery_weekly_snapshots from anon;
revoke all on table public.recovery_weekly_snapshots from authenticated;
grant select, insert on table public.recovery_weekly_snapshots to service_role;

revoke all on table public.recovery_weekly_cart_snapshots from public;
revoke all on table public.recovery_weekly_cart_snapshots from anon;
revoke all on table public.recovery_weekly_cart_snapshots from authenticated;
grant select, insert on table public.recovery_weekly_cart_snapshots to service_role;

create or replace function public.recovery_jsonb_contains_forbidden_keys(p_value jsonb)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
begin
  if p_value is null then
    return false;
  end if;

  case jsonb_typeof(p_value)
    when 'object' then
      for v_key, v_value in select key, value from jsonb_each(p_value) loop
        if lower(v_key) in ('email', 'phone', 'telefono', 'nombre', 'name', 'wamid', 'wa_id', 'message_text', 'message_body', 'payload') then
          return true;
        end if;

        if public.recovery_jsonb_contains_forbidden_keys(v_value) then
          return true;
        end if;
      end loop;
    when 'array' then
      for v_value in select value from jsonb_array_elements(p_value) loop
        if public.recovery_jsonb_contains_forbidden_keys(v_value) then
          return true;
        end if;
      end loop;
    else
      return false;
  end case;

  return false;
end;
$$;

create or replace function public.create_recovery_weekly_snapshot(
  p_snapshot_key text,
  p_week_start date,
  p_week_end date,
  p_snapshot_kind text,
  p_calculation_version text,
  p_trigger_batch_id uuid default null,
  p_latest_cart_batch_id uuid default null,
  p_latest_purchase_batch_id uuid default null,
  p_latest_tracking_batch_id uuid default null,
  p_latest_message_memory_batch_id uuid default null,
  p_summary jsonb default '{}'::jsonb,
  p_cart_results jsonb default '[]'::jsonb
)
returns table (
  snapshot_id uuid,
  created boolean,
  carts_total integer,
  snapshot_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot_key text := nullif(trim(p_snapshot_key), '');
  v_calculation_version text := nullif(trim(p_calculation_version), '');
  v_existing public.recovery_weekly_snapshots%rowtype;
  v_snapshot_id uuid;
  v_snapshot_at timestamptz;
  v_carts_total integer;
  v_recovered_confirmed integer;
  v_recovered_review integer;
  v_unrecovered integer;
  v_operational_recovered integer;
  v_recovered_amount numeric(14,2);
  v_recovery_rate numeric(8,5);
  v_summary_carts_total integer;
  v_summary_recovered_confirmed integer;
  v_summary_recovered_review integer;
  v_summary_unrecovered integer;
  v_summary_recovered_amount numeric(14,2);
  v_summary_recovery_rate numeric;
  v_payload_hash text;
  v_normalized_payload jsonb;
begin
  if v_snapshot_key is null then
    raise exception 'snapshot_key is required' using errcode = '22023';
  end if;

  if p_week_start is null or p_week_end is null or p_week_end <= p_week_start then
    raise exception 'invalid week range' using errcode = '22023';
  end if;

  if p_snapshot_kind not in ('batch', 'daily', 'weekly_close', 'manual', 'reconstructed') then
    raise exception 'invalid snapshot_kind' using errcode = '22023';
  end if;

  if v_calculation_version is null then
    raise exception 'calculation_version is required' using errcode = '22023';
  end if;

  if p_summary is null or jsonb_typeof(p_summary) <> 'object' then
    raise exception 'summary must be a JSON object' using errcode = '22023';
  end if;

  if p_cart_results is null or jsonb_typeof(p_cart_results) <> 'array' then
    raise exception 'cart_results must be a JSON array' using errcode = '22023';
  end if;

  if public.recovery_jsonb_contains_forbidden_keys(p_cart_results) then
    raise exception 'cart_results contains forbidden fields' using errcode = '22023';
  end if;

  with detail_rows as (
    select *
    from jsonb_to_recordset(p_cart_results) as row_data (
      cart_id uuid,
      recovery_status text,
      attributed_purchase_id uuid,
      attributed_purchase_at timestamptz,
      attributed_amount numeric,
      attribution_reason text,
      match_type text,
      confidence text,
      form_datetime timestamptz,
      intended_arrival_at timestamptz,
      cart_batch_id uuid,
      purchase_batch_id uuid,
      cart_row_hash text,
      purchase_row_hash text,
      cart_updated_at_source timestamptz,
      purchase_created_at timestamptz
    )
  ), duplicate_cart_ids as (
    select cart_id
    from detail_rows
    group by cart_id
    having count(*) > 1
  ), derived as (
    select
      count(*)::integer as carts_total,
      count(*) filter (where recovery_status in ('recovered_with_amount', 'recovered_pack'))::integer as recovered_confirmed,
      count(*) filter (where recovery_status = 'payment_review')::integer as recovered_review,
      count(*) filter (where recovery_status = 'unrecovered')::integer as unrecovered,
      coalesce(sum(case when recovery_status <> 'unrecovered' then coalesce(attributed_amount, 0) else 0 end), 0)::numeric(14,2) as recovered_amount,
      count(*) filter (where recovery_status not in ('recovered_with_amount', 'recovered_pack', 'payment_review', 'unrecovered'))::integer as invalid_status_rows,
      count(*) filter (where cart_id is null or attribution_reason is null or form_datetime is null)::integer as missing_required_rows,
      count(*) filter (where recovery_status = 'recovered_with_amount' and (attributed_purchase_id is null or coalesce(attributed_amount, 0) <= 0))::integer as invalid_recovered_with_amount_rows,
      count(*) filter (where recovery_status = 'recovered_pack' and (attributed_purchase_id is null or coalesce(attributed_amount, 0) <> 0))::integer as invalid_recovered_pack_rows,
      count(*) filter (where recovery_status = 'payment_review' and coalesce(attributed_amount, 0) <> 0)::integer as invalid_payment_review_rows,
      count(*) filter (where recovery_status = 'unrecovered' and (attributed_purchase_id is not null or attributed_purchase_at is not null or coalesce(attributed_amount, 0) <> 0))::integer as invalid_unrecovered_rows
    from detail_rows
  )
  select
    derived.carts_total,
    derived.recovered_confirmed,
    derived.recovered_review,
    derived.unrecovered,
    derived.recovered_confirmed + derived.recovered_review,
    derived.recovered_amount,
    case
      when derived.carts_total = 0 then 0::numeric(8,5)
      else round((((derived.recovered_confirmed + derived.recovered_review)::numeric / derived.carts_total::numeric) * 100), 5)::numeric(8,5)
    end
  into
    v_carts_total,
    v_recovered_confirmed,
    v_recovered_review,
    v_unrecovered,
    v_operational_recovered,
    v_recovered_amount,
    v_recovery_rate
  from derived
  where not exists (select 1 from duplicate_cart_ids)
    and derived.invalid_status_rows = 0
    and derived.missing_required_rows = 0
    and derived.invalid_recovered_with_amount_rows = 0
    and derived.invalid_recovered_pack_rows = 0
    and derived.invalid_payment_review_rows = 0
    and derived.invalid_unrecovered_rows = 0;

  if v_carts_total is null then
    raise exception 'cart_results failed validation' using errcode = '22023';
  end if;

  v_summary_carts_total := nullif(p_summary->>'cartsTotal', '')::integer;
  v_summary_recovered_confirmed := nullif(p_summary->>'recoveredConfirmed', '')::integer;
  v_summary_recovered_review := nullif(p_summary->>'recoveredReview', '')::integer;
  v_summary_unrecovered := nullif(p_summary->>'unrecovered', '')::integer;
  v_summary_recovered_amount := coalesce(nullif(p_summary->>'recoveredAmount', '')::numeric, 0)::numeric(14,2);
  v_summary_recovery_rate := coalesce(nullif(p_summary->>'recoveryRate', '')::numeric, v_recovery_rate);

  if v_summary_carts_total is null
    or v_summary_recovered_confirmed is null
    or v_summary_recovered_review is null
    or v_summary_unrecovered is null
  then
    raise exception 'summary is missing required counts' using errcode = '22023';
  end if;

  if v_summary_carts_total <> v_carts_total
    or v_summary_recovered_confirmed <> v_recovered_confirmed
    or v_summary_recovered_review <> v_recovered_review
    or v_summary_unrecovered <> v_unrecovered
    or abs(v_summary_recovered_amount - v_recovered_amount) > 0.009
    or abs(v_summary_recovery_rate - v_recovery_rate) > 0.00001
  then
    raise exception 'summary does not match cart_results' using errcode = '22023';
  end if;

  with detail_rows as (
    select *
    from jsonb_to_recordset(p_cart_results) as row_data (
      cart_id uuid,
      recovery_status text,
      attributed_purchase_id uuid,
      attributed_purchase_at timestamptz,
      attributed_amount numeric,
      attribution_reason text,
      match_type text,
      confidence text,
      form_datetime timestamptz,
      intended_arrival_at timestamptz,
      cart_batch_id uuid,
      purchase_batch_id uuid,
      cart_row_hash text,
      purchase_row_hash text,
      cart_updated_at_source timestamptz,
      purchase_created_at timestamptz
    )
  ), normalized_detail as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'attributed_amount', coalesce(attributed_amount, 0),
          'attributed_purchase_at', attributed_purchase_at,
          'attributed_purchase_id', attributed_purchase_id,
          'attribution_reason', attribution_reason,
          'cart_batch_id', cart_batch_id,
          'cart_id', cart_id,
          'cart_row_hash', cart_row_hash,
          'cart_updated_at_source', cart_updated_at_source,
          'confidence', confidence,
          'form_datetime', form_datetime,
          'intended_arrival_at', intended_arrival_at,
          'match_type', match_type,
          'purchase_batch_id', purchase_batch_id,
          'purchase_created_at', purchase_created_at,
          'purchase_row_hash', purchase_row_hash,
          'recovery_status', recovery_status
        )
        order by cart_id
      ),
      '[]'::jsonb
    ) as rows
    from detail_rows
  )
  select jsonb_build_object(
    'calculation_version', v_calculation_version,
    'carts_total', v_carts_total,
    'detail', normalized_detail.rows,
    'recovered_amount', v_recovered_amount,
    'recovered_confirmed', v_recovered_confirmed,
    'recovered_review', v_recovered_review,
    'recovery_rate', v_recovery_rate,
    'snapshot_kind', p_snapshot_kind,
    'trigger_batch_id', p_trigger_batch_id,
    'unrecovered', v_unrecovered,
    'week_end', p_week_end,
    'week_start', p_week_start
  )
  into v_normalized_payload
  from normalized_detail;

  v_payload_hash := md5(v_normalized_payload::text);

  perform pg_advisory_xact_lock(hashtext('recovery_weekly_snapshot'), hashtext(v_snapshot_key));

  select *
  into v_existing
  from public.recovery_weekly_snapshots
  where recovery_weekly_snapshots.snapshot_key = v_snapshot_key;

  if v_existing.id is not null then
    if v_existing.payload_hash <> v_payload_hash
      or v_existing.week_start <> p_week_start
      or v_existing.week_end <> p_week_end
      or v_existing.snapshot_kind <> p_snapshot_kind
      or v_existing.calculation_version <> v_calculation_version
      or v_existing.trigger_batch_id is distinct from p_trigger_batch_id
      or v_existing.carts_total <> v_carts_total
      or v_existing.recovered_confirmed <> v_recovered_confirmed
      or v_existing.recovered_review <> v_recovered_review
      or v_existing.unrecovered <> v_unrecovered
      or abs(v_existing.recovered_amount - v_recovered_amount) > 0.009
    then
      raise exception 'snapshot_key_conflict' using errcode = '23505';
    end if;

    snapshot_id := v_existing.id;
    created := false;
    carts_total := v_existing.carts_total;
    snapshot_at := v_existing.snapshot_at;
    return next;
    return;
  end if;

  insert into public.recovery_weekly_snapshots (
    snapshot_key,
    payload_hash,
    week_start,
    week_end,
    snapshot_kind,
    calculation_version,
    carts_total,
    recovered_confirmed,
    recovered_review,
    unrecovered,
    operational_recovered,
    recovered_amount,
    recovery_rate,
    trigger_batch_id,
    latest_cart_batch_id,
    latest_purchase_batch_id,
    latest_tracking_batch_id,
    latest_message_memory_batch_id
  ) values (
    v_snapshot_key,
    v_payload_hash,
    p_week_start,
    p_week_end,
    p_snapshot_kind,
    v_calculation_version,
    v_carts_total,
    v_recovered_confirmed,
    v_recovered_review,
    v_unrecovered,
    v_operational_recovered,
    v_recovered_amount,
    v_recovery_rate,
    p_trigger_batch_id,
    p_latest_cart_batch_id,
    p_latest_purchase_batch_id,
    p_latest_tracking_batch_id,
    p_latest_message_memory_batch_id
  )
  returning id, recovery_weekly_snapshots.snapshot_at into v_snapshot_id, v_snapshot_at;

  insert into public.recovery_weekly_cart_snapshots (
    snapshot_id,
    week_start,
    cart_id,
    recovery_status,
    attributed_purchase_id,
    attributed_purchase_at,
    attributed_amount,
    attribution_reason,
    match_type,
    confidence,
    form_datetime,
    intended_arrival_at,
    cart_batch_id,
    purchase_batch_id,
    cart_row_hash,
    purchase_row_hash,
    cart_updated_at_source,
    purchase_created_at
  )
  select
    v_snapshot_id,
    p_week_start,
    row_data.cart_id,
    row_data.recovery_status,
    row_data.attributed_purchase_id,
    row_data.attributed_purchase_at,
    row_data.attributed_amount,
    row_data.attribution_reason,
    row_data.match_type,
    row_data.confidence,
    row_data.form_datetime,
    row_data.intended_arrival_at,
    row_data.cart_batch_id,
    row_data.purchase_batch_id,
    row_data.cart_row_hash,
    row_data.purchase_row_hash,
    row_data.cart_updated_at_source,
    row_data.purchase_created_at
  from jsonb_to_recordset(p_cart_results) as row_data (
    cart_id uuid,
    recovery_status text,
    attributed_purchase_id uuid,
    attributed_purchase_at timestamptz,
    attributed_amount numeric,
    attribution_reason text,
    match_type text,
    confidence text,
    form_datetime timestamptz,
    intended_arrival_at timestamptz,
    cart_batch_id uuid,
    purchase_batch_id uuid,
    cart_row_hash text,
    purchase_row_hash text,
    cart_updated_at_source timestamptz,
    purchase_created_at timestamptz
  );

  snapshot_id := v_snapshot_id;
  created := true;
  carts_total := v_carts_total;
  snapshot_at := v_snapshot_at;
  return next;
end;
$$;

create or replace function public.recovery_compare_snapshots(
  p_previous_snapshot_id uuid,
  p_current_snapshot_id uuid
)
returns table (
  cart_id uuid,
  previous_status text,
  current_status text,
  previous_purchase_id uuid,
  current_purchase_id uuid,
  previous_amount numeric,
  current_amount numeric,
  previous_intended_arrival_at timestamptz,
  current_intended_arrival_at timestamptz,
  previous_cart_row_hash text,
  current_cart_row_hash text,
  previous_purchase_row_hash text,
  current_purchase_row_hash text,
  status_changed boolean,
  purchase_changed boolean,
  amount_changed boolean,
  intended_arrival_changed boolean,
  cart_changed boolean,
  purchase_data_changed boolean,
  probable_change_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_previous public.recovery_weekly_snapshots%rowtype;
  v_current public.recovery_weekly_snapshots%rowtype;
begin
  select * into v_previous
  from public.recovery_weekly_snapshots
  where id = p_previous_snapshot_id;

  select * into v_current
  from public.recovery_weekly_snapshots
  where id = p_current_snapshot_id;

  if v_previous.id is null or v_current.id is null then
    raise exception 'snapshot_not_found' using errcode = '22023';
  end if;

  if v_previous.week_start <> v_current.week_start or v_previous.week_end <> v_current.week_end then
    raise exception 'snapshot_week_mismatch' using errcode = '22023';
  end if;

  if v_previous.calculation_version <> v_current.calculation_version then
    raise exception 'snapshot_calculation_version_mismatch' using errcode = '22023';
  end if;

  return query
  with previous_rows as (
    select *
    from public.recovery_weekly_cart_snapshots
    where snapshot_id = p_previous_snapshot_id
  ), current_rows as (
    select *
    from public.recovery_weekly_cart_snapshots
    where snapshot_id = p_current_snapshot_id
  )
  select
    coalesce(previous_rows.cart_id, current_rows.cart_id) as cart_id,
    previous_rows.recovery_status as previous_status,
    current_rows.recovery_status as current_status,
    previous_rows.attributed_purchase_id as previous_purchase_id,
    current_rows.attributed_purchase_id as current_purchase_id,
    previous_rows.attributed_amount as previous_amount,
    current_rows.attributed_amount as current_amount,
    previous_rows.intended_arrival_at as previous_intended_arrival_at,
    current_rows.intended_arrival_at as current_intended_arrival_at,
    previous_rows.cart_row_hash as previous_cart_row_hash,
    current_rows.cart_row_hash as current_cart_row_hash,
    previous_rows.purchase_row_hash as previous_purchase_row_hash,
    current_rows.purchase_row_hash as current_purchase_row_hash,
    previous_rows.recovery_status is distinct from current_rows.recovery_status as status_changed,
    previous_rows.attributed_purchase_id is distinct from current_rows.attributed_purchase_id as purchase_changed,
    previous_rows.attributed_amount is distinct from current_rows.attributed_amount as amount_changed,
    previous_rows.intended_arrival_at is distinct from current_rows.intended_arrival_at as intended_arrival_changed,
    previous_rows.cart_row_hash is distinct from current_rows.cart_row_hash as cart_changed,
    previous_rows.purchase_row_hash is distinct from current_rows.purchase_row_hash as purchase_data_changed,
    case
      when previous_rows.cart_id is null then 'added_to_snapshot'
      when current_rows.cart_id is null then 'removed_from_snapshot'
      when previous_rows.recovery_status is distinct from current_rows.recovery_status then 'recovery_status_changed'
      when previous_rows.attributed_purchase_id is distinct from current_rows.attributed_purchase_id then 'attributed_purchase_changed'
      when previous_rows.attributed_amount is distinct from current_rows.attributed_amount then 'attributed_amount_changed'
      when previous_rows.intended_arrival_at is distinct from current_rows.intended_arrival_at then 'intended_arrival_changed'
      when previous_rows.cart_row_hash is distinct from current_rows.cart_row_hash then 'cart_data_changed'
      when previous_rows.purchase_row_hash is distinct from current_rows.purchase_row_hash then 'purchase_data_changed'
      else 'unchanged'
    end as probable_change_reason
  from previous_rows
  full outer join current_rows using (cart_id);
end;
$$;

revoke all on function public.recovery_jsonb_contains_forbidden_keys(jsonb) from public;
revoke execute on function public.recovery_jsonb_contains_forbidden_keys(jsonb) from anon;
revoke execute on function public.recovery_jsonb_contains_forbidden_keys(jsonb) from authenticated;

revoke all on function public.create_recovery_weekly_snapshot(
  text, date, date, text, text, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb
) from public;
revoke execute on function public.create_recovery_weekly_snapshot(
  text, date, date, text, text, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb
) from anon;
revoke execute on function public.create_recovery_weekly_snapshot(
  text, date, date, text, text, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb
) from authenticated;
grant execute on function public.create_recovery_weekly_snapshot(
  text, date, date, text, text, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb
) to service_role;

revoke all on function public.recovery_compare_snapshots(uuid, uuid) from public;
revoke execute on function public.recovery_compare_snapshots(uuid, uuid) from anon;
revoke execute on function public.recovery_compare_snapshots(uuid, uuid) from authenticated;
grant execute on function public.recovery_compare_snapshots(uuid, uuid) to service_role;

comment on table public.recovery_weekly_snapshots is
  'Weekly aggregate snapshots of canonical recovery attribution. No PII is stored.';

comment on table public.recovery_weekly_cart_snapshots is
  'Per-cart weekly snapshots of canonical recovery attribution. Stores identifiers, hashes and attribution state, never contact data or message payloads.';

comment on column public.recovery_weekly_snapshots.payload_hash is
  'Deterministic hash of normalized non-PII snapshot metadata, derived summary and cart detail sorted by cart_id.';

comment on function public.recovery_jsonb_contains_forbidden_keys(jsonb) is
  'Internal defensive check for forbidden PII keys in snapshot JSON payloads.';

comment on function public.create_recovery_weekly_snapshot(
  text, date, date, text, text, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb
) is
  'Idempotently persists a recovery weekly snapshot calculated by server-side TypeScript canonical attribution logic.';

comment on function public.recovery_compare_snapshots(uuid, uuid) is
  'Compares two recovery weekly snapshots from the same week and calculation version using safe identifiers and hashes only. Change reasons are probable, not causal proof.';
