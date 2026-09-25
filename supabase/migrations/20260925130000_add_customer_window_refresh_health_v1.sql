begin;

create table public.customer_related_review_refresh_state (
  rule_key text primary key,
  run_id uuid not null,
  run_status text not null,
  started_at timestamptz not null,
  heartbeat_at timestamptz not null,
  finished_at timestamptz,
  last_success_at timestamptz,
  last_attempt_at timestamptz not null,
  last_error_code text,
  last_error_phase text,
  retention_last_attempt_at timestamptz,
  retention_last_deleted_snapshot_id uuid,
  retention_last_deleted_count integer,
  retention_last_error_code text,
  updated_at timestamptz not null default now(),
  constraint customer_related_review_refresh_state_rule_check
    check (rule_key = 'RELATED_REVIEW_MCP_EAP_V1'),
  constraint customer_related_review_refresh_state_status_check
    check (run_status in ('running', 'success', 'error')),
  constraint customer_related_review_refresh_state_lifecycle_check
    check (
      (run_status = 'running' and finished_at is null)
      or (run_status in ('success', 'error') and finished_at is not null)
    ),
  constraint customer_related_review_refresh_state_error_check
    check (
      (run_status <> 'error' and last_error_code is null and last_error_phase is null)
      or (run_status = 'error'
        and last_error_code ~ '^[a-z][a-z0-9_]{0,79}$'
        and last_error_phase ~ '^[a-z][a-z0-9_-]{0,79}$')
    ),
  constraint customer_related_review_refresh_state_retention_check
    check (
      (retention_last_attempt_at is null
        and retention_last_deleted_snapshot_id is null
        and retention_last_deleted_count is null
        and retention_last_error_code is null)
      or (retention_last_attempt_at is not null
        and retention_last_deleted_count is not null
        and retention_last_deleted_count >= 0
        and (retention_last_error_code is null
          or retention_last_error_code ~ '^[A-Za-z0-9_]{1,80}$'))
    )
);

alter table public.customer_related_review_refresh_state enable row level security;
revoke all on table public.customer_related_review_refresh_state
  from public, anon, authenticated, service_role, customer_related_review_builder;

create or replace function public.customer_related_review_refresh_start_v1_m2m(
  p_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_run_id uuid := coalesce(p_run_id, pg_catalog.gen_random_uuid());
  v_current public.customer_related_review_refresh_state%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(181923741, 3);

  select state.* into v_current
  from public.customer_related_review_refresh_state state
  where state.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
  for update;

  if found and v_current.run_status = 'running' and v_current.run_id = v_run_id then
    return jsonb_build_object(
      'ok', true, 'runId', v_current.run_id, 'startedAt', v_current.started_at,
      'idempotent', true, 'containsPii', false
    );
  end if;

  if found and v_current.run_status = 'running'
    and v_current.heartbeat_at >= v_now - interval '120 seconds' then
    return jsonb_build_object(
      'ok', false, 'code', 'refresh_already_running', 'containsPii', false
    );
  end if;

  insert into public.customer_related_review_refresh_state (
    rule_key, run_id, run_status, started_at, heartbeat_at, finished_at,
    last_success_at, last_attempt_at, last_error_code, last_error_phase,
    retention_last_attempt_at, retention_last_deleted_snapshot_id,
    retention_last_deleted_count, retention_last_error_code, updated_at
  ) values (
    'RELATED_REVIEW_MCP_EAP_V1', v_run_id, 'running', v_now, v_now, null,
    v_current.last_success_at, v_now, null, null,
    v_current.retention_last_attempt_at, v_current.retention_last_deleted_snapshot_id,
    v_current.retention_last_deleted_count, v_current.retention_last_error_code, v_now
  )
  on conflict (rule_key) do update set
    run_id = excluded.run_id,
    run_status = excluded.run_status,
    started_at = excluded.started_at,
    heartbeat_at = excluded.heartbeat_at,
    finished_at = null,
    last_attempt_at = excluded.last_attempt_at,
    last_error_code = null,
    last_error_phase = null,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'ok', true, 'runId', v_run_id, 'startedAt', v_now,
    'idempotent', false, 'containsPii', false
  );
end;
$function$;

create or replace function public.customer_related_review_refresh_heartbeat_v1_m2m(
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_updated integer;
begin
  update public.customer_related_review_refresh_state state
  set heartbeat_at = v_now, updated_at = v_now
  where state.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and state.run_id = p_run_id
    and state.run_status = 'running';
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    return jsonb_build_object(
      'ok', false, 'code', 'refresh_run_not_current', 'containsPii', false
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'runId', p_run_id, 'heartbeatAt', v_now, 'containsPii', false
  );
end;
$function$;

create or replace function public.customer_related_review_refresh_finish_v1_m2m(
  p_run_id uuid,
  p_success boolean,
  p_error_code text default null,
  p_error_phase text default null,
  p_retention_attempted boolean default false,
  p_retention_deleted_count integer default null,
  p_retention_last_deleted_snapshot_id uuid default null,
  p_retention_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_updated integer;
begin
  if p_success is null
    or (p_success and (p_error_code is not null or p_error_phase is not null))
    or (not p_success and (
      p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{0,79}$'
      or p_error_phase is null or p_error_phase !~ '^[a-z][a-z0-9_-]{0,79}$'))
    or (p_retention_attempted and (
      p_retention_deleted_count is null or p_retention_deleted_count < 0
      or (p_retention_error_code is not null
        and p_retention_error_code !~ '^[A-Za-z0-9_]{1,80}$')))
    or (not p_retention_attempted and (
      p_retention_deleted_count is not null
      or p_retention_last_deleted_snapshot_id is not null
      or p_retention_error_code is not null)) then
    raise exception 'Invalid Related Review refresh finish contract'
      using errcode = '22023';
  end if;

  update public.customer_related_review_refresh_state state
  set run_status = case when p_success then 'success' else 'error' end,
    heartbeat_at = v_now,
    finished_at = v_now,
    last_success_at = case when p_success then v_now else state.last_success_at end,
    last_error_code = case when p_success then null else p_error_code end,
    last_error_phase = case when p_success then null else p_error_phase end,
    retention_last_attempt_at = case when p_retention_attempted
      then v_now else state.retention_last_attempt_at end,
    retention_last_deleted_snapshot_id = case when p_retention_attempted
      then p_retention_last_deleted_snapshot_id
      else state.retention_last_deleted_snapshot_id end,
    retention_last_deleted_count = case when p_retention_attempted
      then p_retention_deleted_count else state.retention_last_deleted_count end,
    retention_last_error_code = case when p_retention_attempted
      then p_retention_error_code else state.retention_last_error_code end,
    updated_at = v_now
  where state.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and state.run_id = p_run_id
    and state.run_status = 'running';
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    return jsonb_build_object(
      'ok', false, 'code', 'refresh_run_not_current', 'containsPii', false
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'runId', p_run_id,
    'status', case when p_success then 'success' else 'error' end,
    'finishedAt', v_now, 'containsPii', false
  );
end;
$function$;

create or replace function public.customer_window_get_refresh_health_v1_m2m()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with snapshot_state as materialized (
    select
      count(*) filter (where snapshot.status = 'active')::integer as active_count,
      (pg_catalog.array_agg(snapshot.snapshot_id order by snapshot.snapshot_id)
        filter (where snapshot.status = 'active'))[1] as active_snapshot_id,
      (pg_catalog.array_agg(snapshot.activated_at order by snapshot.snapshot_id)
        filter (where snapshot.status = 'active'))[1] as active_snapshot_activated_at,
      greatest(count(*) filter (where snapshot.status = 'superseded')::integer - 5, 0)
        as retention_remaining
    from public.customer_related_review_snapshots snapshot
    where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
  ), operational as materialized (
    select state.*
    from public.customer_related_review_refresh_state state
    where state.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
  ), resolved as (
    select snapshot.*, operational.*,
      case
        when snapshot.active_count <> 1
          or snapshot.active_snapshot_id is null
          or snapshot.active_snapshot_activated_at is null then 'error'
        when operational.rule_key is null then 'error'
        when operational.run_status = 'running'
          and operational.heartbeat_at < pg_catalog.now() - interval '120 seconds' then 'error'
        when operational.run_status = 'running' then 'refreshing'
        when operational.run_status = 'error'
          and (operational.last_success_at is null
            or operational.last_attempt_at >= operational.last_success_at) then 'error'
        when operational.last_success_at is null then 'error'
        when operational.last_success_at < pg_catalog.now() - interval '45 minutes'
          then 'stale'
        else 'healthy'
      end as health_status,
      case
        when operational.retention_last_attempt_at is null then 'unknown'
        when operational.retention_last_error_code is not null then 'error'
        when snapshot.retention_remaining > 0 then 'draining'
        else 'active'
      end as retention_status,
      case
        when snapshot.active_count <> 1 then 'active_snapshot_count_invalid'
        when snapshot.active_snapshot_id is null
          or snapshot.active_snapshot_activated_at is null then 'active_snapshot_contract_invalid'
        when operational.rule_key is null then 'telemetry_unavailable'
        when operational.run_status = 'running'
          and operational.heartbeat_at < pg_catalog.now() - interval '120 seconds'
          then 'refresh_heartbeat_expired'
        when operational.run_status = 'error' then operational.last_error_code
        when operational.last_success_at is null then 'refresh_success_missing'
        else null
      end as effective_error_code,
      case
        when snapshot.active_count <> 1
          or snapshot.active_snapshot_id is null
          or snapshot.active_snapshot_activated_at is null
          or operational.rule_key is null
          or operational.last_success_at is null then 'status'
        when operational.run_status = 'running'
          and operational.heartbeat_at < pg_catalog.now() - interval '120 seconds'
          then 'heartbeat'
        when operational.run_status = 'error' then operational.last_error_phase
        else null
      end as effective_error_phase
    from snapshot_state snapshot
    left join operational on true
  )
  select jsonb_build_object(
    'status', resolved.health_status,
    'lastSuccessAt', resolved.last_success_at,
    'lastAttemptAt', resolved.last_attempt_at,
    'activeSnapshotId', resolved.active_snapshot_id,
    'activeSnapshotActivatedAt', resolved.active_snapshot_activated_at,
    'cadenceMinutes', 30,
    'retentionStatus', resolved.retention_status,
    'retentionRemaining', resolved.retention_remaining,
    'retentionLastDeletedSnapshotId', resolved.retention_last_deleted_snapshot_id,
    'lastErrorCode', resolved.effective_error_code,
    'lastErrorPhase', resolved.effective_error_phase,
    'containsPii', false
  )
  from resolved;
$function$;

revoke all on function public.customer_related_review_refresh_start_v1_m2m(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_related_review_refresh_heartbeat_v1_m2m(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_related_review_refresh_finish_v1_m2m(
  uuid, boolean, text, text, boolean, integer, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.customer_related_review_refresh_start_v1_m2m(uuid)
  to customer_related_review_builder;
grant execute on function public.customer_related_review_refresh_heartbeat_v1_m2m(uuid)
  to customer_related_review_builder;
grant execute on function public.customer_related_review_refresh_finish_v1_m2m(
  uuid, boolean, text, text, boolean, integer, uuid, text
) to customer_related_review_builder;

revoke all on function public.customer_window_get_refresh_health_v1_m2m()
  from public, anon, authenticated, customer_related_review_builder;
grant execute on function public.customer_window_get_refresh_health_v1_m2m()
  to service_role;

comment on table public.customer_related_review_refresh_state is
  'Safe operational state for the RELATED_REVIEW_MCP_EAP_V1 refresh worker. Contains no PII or secrets.';
comment on function public.customer_window_get_refresh_health_v1_m2m() is
  'Returns safe Customer Window refresh, active snapshot, and retention health for the server-side web API.';

commit;
