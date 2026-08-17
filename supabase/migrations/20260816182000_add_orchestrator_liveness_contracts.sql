begin;

do $$
begin
  if to_regclass('ops_orchestrator.orchestrator_jobs') is null then
    raise exception 'Missing table ops_orchestrator.orchestrator_jobs';
  end if;

  if to_regclass('ops_orchestrator.orchestrator_job_events') is null then
    raise exception 'Missing table ops_orchestrator.orchestrator_job_events';
  end if;
end;
$$;

drop function if exists public.orchestrator_list_composite_run_jobs(uuid);

create function public.orchestrator_list_composite_run_jobs(p_composite_run_id uuid)
returns table (
  id uuid,
  job_type text,
  status text,
  requested_source text,
  target_worker_id text,
  locked_by_worker_id text,
  priority integer,
  attempts integer,
  max_attempts integer,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  last_heartbeat_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  composite_run_id uuid,
  composite_kind text,
  sequence_index smallint,
  sequence_total smallint
)
language sql
security definer
set search_path = ''
as $$
  select
    j.id,
    j.job_type,
    j.status,
    j.requested_source,
    j.target_worker_id,
    j.locked_by_worker_id,
    j.priority,
    j.attempts,
    j.max_attempts,
    j.error_message,
    j.started_at,
    j.finished_at,
    j.last_heartbeat_at,
    j.created_at,
    j.updated_at,
    j.composite_run_id,
    j.composite_kind,
    j.sequence_index,
    j.sequence_total
  from ops_orchestrator.orchestrator_jobs as j
  where j.composite_run_id = p_composite_run_id
  order by j.sequence_index asc, j.created_at asc, j.id asc;
$$;

revoke all on function public.orchestrator_list_composite_run_jobs(uuid) from public;
revoke execute on function public.orchestrator_list_composite_run_jobs(uuid) from anon;
revoke execute on function public.orchestrator_list_composite_run_jobs(uuid) from authenticated;
grant execute on function public.orchestrator_list_composite_run_jobs(uuid) to service_role;

create or replace function public.orchestrator_list_job_events(
  p_job_id uuid,
  p_limit integer default 50
)
returns table (
  id bigint,
  job_id uuid,
  worker_id text,
  event_type text,
  message text,
  data jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    e.id,
    e.job_id,
    e.worker_id,
    e.event_type,
    e.message,
    e.data,
    e.created_at
  from ops_orchestrator.orchestrator_job_events as e
  where e.job_id = p_job_id
  order by e.created_at desc, e.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.orchestrator_list_job_events(uuid, integer) from public;
revoke execute on function public.orchestrator_list_job_events(uuid, integer) from anon;
revoke execute on function public.orchestrator_list_job_events(uuid, integer) from authenticated;
grant execute on function public.orchestrator_list_job_events(uuid, integer) to service_role;

create or replace function public.orchestrator_get_job_for_retry(p_job_id uuid)
returns table (
  id uuid,
  job_type text,
  status text,
  target_worker_id text,
  priority integer,
  requested_source text,
  payload jsonb,
  composite_run_id uuid,
  composite_kind text,
  sequence_index smallint,
  sequence_total smallint
)
language sql
security definer
set search_path = ''
as $$
  select
    j.id,
    j.job_type,
    j.status,
    j.target_worker_id,
    j.priority,
    j.requested_source,
    j.payload,
    j.composite_run_id,
    j.composite_kind,
    j.sequence_index,
    j.sequence_total
  from ops_orchestrator.orchestrator_jobs as j
  where j.id = p_job_id
  limit 1;
$$;

revoke all on function public.orchestrator_get_job_for_retry(uuid) from public;
revoke execute on function public.orchestrator_get_job_for_retry(uuid) from anon;
revoke execute on function public.orchestrator_get_job_for_retry(uuid) from authenticated;
grant execute on function public.orchestrator_get_job_for_retry(uuid) to service_role;

commit;