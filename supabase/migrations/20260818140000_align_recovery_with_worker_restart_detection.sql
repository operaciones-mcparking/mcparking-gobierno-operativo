begin;

create or replace function public.orchestrator_recover_stuck_worker(
  p_worker_id text,
  p_recent_hours integer default 6,
  p_reason text default 'manual_recovery_from_web',
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'ops_orchestrator'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_stale_timeout constant interval := interval '5 minutes';
  v_worker_recent_timeout constant interval := interval '90 seconds';
  v_worker ops_orchestrator.orchestrator_workers%rowtype;
  v_job ops_orchestrator.orchestrator_jobs%rowtype;
  v_worker_after ops_orchestrator.orchestrator_workers%rowtype;
  v_worker_started_at timestamptz;
  v_job_stale boolean := false;
  v_worker_stale boolean := false;
  v_worker_recent boolean := false;
  v_restart_evidence boolean := false;
  v_recovery_mode text;
  v_candidate jsonb;
  v_error_message text;
  v_active_jobs_after integer := 0;
begin
  -- Kept for signature compatibility. The current remote contract does not use it.
  perform p_recent_hours;

  select *
  into v_worker
  from ops_orchestrator.orchestrator_workers
  where worker_id = p_worker_id
  for update;

  if not found or v_worker.current_job_id is null then
    return jsonb_build_object(
      'dry_run', p_dry_run,
      'recovered', false,
      'would_recover', false,
      'reason_code', 'no_current_job',
      'worker_before', case when v_worker.worker_id is null then null else to_jsonb(v_worker) end,
      'worker_after', null,
      'candidate_jobs', '[]'::jsonb,
      'updated_jobs', '[]'::jsonb,
      'events_inserted', 0,
      'active_jobs_after', 0,
      'message', 'Worker has no current job to recover.'
    );
  end if;

  select *
  into v_job
  from ops_orchestrator.orchestrator_jobs
  where id = v_worker.current_job_id
  for update;

  if not found
    or v_job.status <> 'running'
    or v_job.locked_by_worker_id is distinct from v_worker.worker_id
  then
    return jsonb_build_object(
      'dry_run', p_dry_run,
      'recovered', false,
      'would_recover', false,
      'reason_code', 'ownership_or_state_changed',
      'worker_before', to_jsonb(v_worker),
      'worker_after', null,
      'candidate_jobs', '[]'::jsonb,
      'updated_jobs', '[]'::jsonb,
      'events_inserted', 0,
      'active_jobs_after', 0,
      'message', 'Worker ownership or job state changed; no recovery.'
    );
  end if;

  v_job_stale := v_job.last_heartbeat_at is not null
    and v_job.last_heartbeat_at < v_now - v_stale_timeout;
  v_worker_stale := v_worker.last_seen_at is not null
    and v_worker.last_seen_at < v_now - v_stale_timeout;
  v_worker_recent := v_worker.last_seen_at is not null
    and v_worker.last_seen_at >= v_now - v_worker_recent_timeout;

  if nullif(btrim(v_worker.metadata ->> 'started_at'), '') is not null then
    begin
      v_worker_started_at := (v_worker.metadata ->> 'started_at')::timestamptz;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        v_worker_started_at := null;
    end;
  end if;

  v_restart_evidence := v_job_stale
    and v_worker_recent
    and v_job.started_at is not null
    and v_worker_started_at is not null
    and v_worker_started_at > v_job.started_at
    and v_worker_started_at > v_job.last_heartbeat_at;

  if not v_job_stale or not (v_worker_stale or v_restart_evidence) then
    return jsonb_build_object(
      'dry_run', p_dry_run,
      'recovered', false,
      'would_recover', false,
      'reason_code', 'heartbeat_not_stale',
      'worker_before', to_jsonb(v_worker),
      'worker_after', null,
      'candidate_jobs', '[]'::jsonb,
      'updated_jobs', '[]'::jsonb,
      'events_inserted', 0,
      'active_jobs_after', 1,
      'message', 'Worker and job heartbeats do not satisfy a safe recovery path.'
    );
  end if;

  v_recovery_mode := case
    when v_restart_evidence then 'worker_restarted'
    else 'stale_worker'
  end;

  v_candidate := jsonb_build_object(
    'id', v_job.id,
    'job_type', v_job.job_type,
    'status', v_job.status,
    'requested_source', v_job.requested_source,
    'locked_by_worker_id', v_job.locked_by_worker_id,
    'attempts', v_job.attempts,
    'max_attempts', v_job.max_attempts,
    'created_at', v_job.created_at,
    'started_at', v_job.started_at,
    'last_heartbeat_at', v_job.last_heartbeat_at,
    'worker_last_seen_at', v_worker.last_seen_at
  );

  if p_dry_run then
    return jsonb_build_object(
      'dry_run', true,
      'recovered', false,
      'would_recover', true,
      'reason_code', case
        when v_restart_evidence then 'worker_restarted_orphan_job'
        else 'stale_candidate'
      end,
      'recovery_mode', v_recovery_mode,
      'worker_before', to_jsonb(v_worker),
      'worker_after', null,
      'candidate_jobs', jsonb_build_array(v_candidate),
      'updated_jobs', '[]'::jsonb,
      'events_inserted', 0,
      'active_jobs_after', 1,
      'message', case
        when v_restart_evidence then 'Worker restart left a stale running job eligible for recovery.'
        else 'Worker and job are stale and eligible for recovery.'
      end
    );
  end if;

  v_error_message := format(
    'Operational recovery (%s): %s',
    v_recovery_mode,
    coalesce(nullif(btrim(p_reason), ''), 'manual_recovery_from_web')
  );

  update ops_orchestrator.orchestrator_jobs
  set
    status = 'failed',
    error_message = v_error_message,
    finished_at = coalesce(finished_at, v_now),
    updated_at = v_now
  where id = v_job.id
    and status = 'running'
    and locked_by_worker_id = v_worker.worker_id;

  if not found then
    raise exception 'Recovery candidate changed while locked';
  end if;

  insert into ops_orchestrator.orchestrator_job_events (
    job_id,
    worker_id,
    event_type,
    message,
    data
  )
  values (
    v_job.id,
    v_worker.worker_id,
    'failed',
    'Job marked failed by controlled worker recovery',
    jsonb_build_object(
      'error_message', v_error_message,
      'reason', p_reason,
      'recovery_source', 'worker_startup',
      'recovery_mode', v_recovery_mode
    )
  );

  update ops_orchestrator.orchestrator_workers
  set
    status = 'idle',
    current_job_id = null,
    last_seen_at = v_now,
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{last_automatic_recovery}',
      jsonb_build_object(
        'job_id', v_job.id,
        'recovered_at', v_now,
        'reason', p_reason,
        'recovery_source', 'worker_startup',
        'recovery_mode', v_recovery_mode
      ),
      true
    ),
    updated_at = v_now
  where worker_id = v_worker.worker_id
    and current_job_id = v_job.id
  returning * into v_worker_after;

  if not found then
    raise exception 'Worker state changed while recovering job';
  end if;

  select count(*)::integer
  into v_active_jobs_after
  from ops_orchestrator.orchestrator_jobs
  where status in ('queued', 'running')
    and locked_by_worker_id = v_worker.worker_id;

  return jsonb_build_object(
    'dry_run', false,
    'recovered', true,
    'would_recover', true,
    'reason_code', case
      when v_restart_evidence then 'recovered_restarted_orphan_job'
      else 'recovered_stale_job'
    end,
    'recovery_mode', v_recovery_mode,
    'worker_before', to_jsonb(v_worker),
    'worker_after', to_jsonb(v_worker_after),
    'candidate_jobs', jsonb_build_array(v_candidate),
    'updated_jobs', jsonb_build_array(v_candidate || jsonb_build_object('status', 'failed')),
    'events_inserted', 1,
    'active_jobs_after', v_active_jobs_after,
    'message', 'Controlled worker recovery completed.'
  );
end;
$$;

revoke all on function public.orchestrator_recover_stuck_worker(text, integer, text, boolean) from public;
revoke execute on function public.orchestrator_recover_stuck_worker(text, integer, text, boolean) from anon;
revoke execute on function public.orchestrator_recover_stuck_worker(text, integer, text, boolean) from authenticated;
grant execute on function public.orchestrator_recover_stuck_worker(text, integer, text, boolean) to service_role;

commit;
