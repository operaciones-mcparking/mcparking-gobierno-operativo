begin;

create table public.customer_window_profile_metrics_bootstrap_state (
  job_key text primary key,
  cursor_customer_id uuid,
  status text not null default 'pending',
  processed_profiles bigint not null default 0,
  last_batch_count integer not null default 0,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint customer_window_profile_metrics_bootstrap_state_key_check
    check (job_key = 'customer_profile_metrics_bootstrap'),
  constraint customer_window_profile_metrics_bootstrap_state_status_check
    check (status in ('pending', 'running', 'completed', 'error')),
  constraint customer_window_profile_metrics_bootstrap_state_counts_check
    check (processed_profiles >= 0 and last_batch_count >= 0)
);

alter table public.customer_window_profile_metrics_bootstrap_state enable row level security;

revoke all on table public.customer_window_profile_metrics_bootstrap_state
  from public, anon, authenticated, service_role;

insert into public.customer_window_profile_metrics_bootstrap_state (
  job_key,
  cursor_customer_id,
  status,
  processed_profiles,
  last_batch_count
) values (
  'customer_profile_metrics_bootstrap',
  null,
  'pending',
  0,
  0
)
on conflict (job_key) do nothing;

create or replace function public.customer_window_get_profile_metrics_bootstrap_state_m2m()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when state.job_key is null then pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'bootstrap_state_not_found'
    )
    else pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'bootstrap_state_found',
      'jobKey', state.job_key,
      'cursorCustomerId', state.cursor_customer_id,
      'status', state.status,
      'processedProfiles', state.processed_profiles,
      'lastBatchCount', state.last_batch_count,
      'lastStartedAt', state.last_started_at,
      'lastSucceededAt', state.last_succeeded_at,
      'completedAt', state.completed_at,
      'lastError', state.last_error,
      'completed', state.status = 'completed'
    )
  end
  from (select 1) anchor
  left join public.customer_window_profile_metrics_bootstrap_state state
    on state.job_key = 'customer_profile_metrics_bootstrap';
$$;

create or replace function public.customer_window_start_profile_metrics_bootstrap_batch_m2m()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.customer_window_profile_metrics_bootstrap_state%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_profile_metrics_bootstrap_state', 0)
  );

  select * into v_state
  from public.customer_window_profile_metrics_bootstrap_state
  where job_key = 'customer_profile_metrics_bootstrap'
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'bootstrap_state_not_found');
  end if;

  if v_state.status = 'completed' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'bootstrap_already_completed',
      'cursorCustomerId', v_state.cursor_customer_id,
      'processedProfiles', v_state.processed_profiles
    );
  end if;

  update public.customer_window_profile_metrics_bootstrap_state
  set status = 'running',
      last_started_at = pg_catalog.clock_timestamp(),
      last_error = null,
      updated_at = pg_catalog.clock_timestamp()
  where job_key = 'customer_profile_metrics_bootstrap';

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'bootstrap_batch_started',
    'cursorCustomerId', v_state.cursor_customer_id,
    'processedProfiles', v_state.processed_profiles
  );
end;
$$;

create or replace function public.customer_window_commit_profile_metrics_bootstrap_batch_m2m(
  p_expected_cursor uuid,
  p_next_cursor uuid,
  p_processed_profiles integer,
  p_has_more boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.customer_window_profile_metrics_bootstrap_state%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_processed_profiles is null or p_processed_profiles < 0 or p_processed_profiles > 500 then
    raise exception 'Invalid processed profile count' using errcode = '22023';
  end if;
  if p_has_more is null then
    raise exception 'Missing bootstrap continuation flag' using errcode = '22023';
  end if;
  if p_processed_profiles = 0 and (p_next_cursor is not null or p_has_more) then
    raise exception 'Empty batch cannot advance or continue' using errcode = '22023';
  end if;
  if p_processed_profiles > 0 and p_next_cursor is null then
    raise exception 'Successful batch requires next cursor' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_profile_metrics_bootstrap_state', 0)
  );

  select * into v_state
  from public.customer_window_profile_metrics_bootstrap_state
  where job_key = 'customer_profile_metrics_bootstrap'
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'bootstrap_state_not_found');
  end if;

  if v_state.status = 'completed' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'bootstrap_already_completed',
      'cursorCustomerId', v_state.cursor_customer_id,
      'processedProfiles', v_state.processed_profiles
    );
  end if;

  if v_state.cursor_customer_id is distinct from p_expected_cursor then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'cursor_conflict',
      'cursorCustomerId', v_state.cursor_customer_id,
      'processedProfiles', v_state.processed_profiles,
      'status', v_state.status
    );
  end if;

  if p_processed_profiles > 0
    and v_state.cursor_customer_id is not null
    and p_next_cursor <= v_state.cursor_customer_id
  then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'cursor_not_advanced',
      'cursorCustomerId', v_state.cursor_customer_id,
      'processedProfiles', v_state.processed_profiles,
      'status', v_state.status
    );
  end if;

  update public.customer_window_profile_metrics_bootstrap_state
  set cursor_customer_id = case
        when p_processed_profiles > 0 then p_next_cursor
        else cursor_customer_id
      end,
      status = case when p_has_more then 'pending' else 'completed' end,
      processed_profiles = processed_profiles + p_processed_profiles,
      last_batch_count = p_processed_profiles,
      last_succeeded_at = v_now,
      completed_at = case when p_has_more then null else v_now end,
      last_error = null,
      updated_at = v_now
  where job_key = 'customer_profile_metrics_bootstrap'
    and cursor_customer_id is not distinct from p_expected_cursor;

  if not found then
    select * into v_state
    from public.customer_window_profile_metrics_bootstrap_state
    where job_key = 'customer_profile_metrics_bootstrap';
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'cursor_conflict',
      'cursorCustomerId', v_state.cursor_customer_id,
      'processedProfiles', v_state.processed_profiles,
      'status', v_state.status
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', case when p_has_more then 'bootstrap_batch_committed' else 'bootstrap_completed' end,
    'cursorCustomerId', case when p_processed_profiles > 0 then p_next_cursor else v_state.cursor_customer_id end,
    'processedProfiles', v_state.processed_profiles + p_processed_profiles,
    'lastBatchCount', p_processed_profiles,
    'status', case when p_has_more then 'pending' else 'completed' end,
    'completed', not p_has_more
  );
end;
$$;

create or replace function public.customer_window_fail_profile_metrics_bootstrap_batch_m2m(
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.customer_window_profile_metrics_bootstrap_state%rowtype;
begin
  if nullif(pg_catalog.btrim(p_error), '') is null then
    raise exception 'Missing bootstrap error' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_profile_metrics_bootstrap_state', 0)
  );

  select * into v_state
  from public.customer_window_profile_metrics_bootstrap_state
  where job_key = 'customer_profile_metrics_bootstrap'
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'bootstrap_state_not_found');
  end if;

  if v_state.status = 'completed' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'bootstrap_already_completed',
      'cursorCustomerId', v_state.cursor_customer_id,
      'processedProfiles', v_state.processed_profiles
    );
  end if;

  update public.customer_window_profile_metrics_bootstrap_state
  set status = 'error',
      last_error = pg_catalog.left(pg_catalog.btrim(p_error), 1000),
      updated_at = pg_catalog.clock_timestamp()
  where job_key = 'customer_profile_metrics_bootstrap';

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'bootstrap_batch_failed',
    'cursorCustomerId', v_state.cursor_customer_id,
    'processedProfiles', v_state.processed_profiles,
    'status', 'error'
  );
end;
$$;

revoke all on function public.customer_window_get_profile_metrics_bootstrap_state_m2m()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_start_profile_metrics_bootstrap_batch_m2m()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_commit_profile_metrics_bootstrap_batch_m2m(uuid, uuid, integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_fail_profile_metrics_bootstrap_batch_m2m(text)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_window_get_profile_metrics_bootstrap_state_m2m()
  to service_role;
grant execute on function public.customer_window_start_profile_metrics_bootstrap_batch_m2m()
  to service_role;
grant execute on function public.customer_window_commit_profile_metrics_bootstrap_batch_m2m(uuid, uuid, integer, boolean)
  to service_role;
grant execute on function public.customer_window_fail_profile_metrics_bootstrap_batch_m2m(text)
  to service_role;

comment on table public.customer_window_profile_metrics_bootstrap_state is
  'Private single-row operational state for the Customer Window profile metrics bootstrap.';

commit;
