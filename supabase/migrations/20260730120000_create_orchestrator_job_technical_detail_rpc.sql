create or replace function public.orchestrator_get_job_technical_detail(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', j.id,
    'job_type', j.job_type,
    'status', j.status,
    'requested_source', j.requested_source,
    'target_worker_id', j.target_worker_id,
    'locked_by_worker_id', j.locked_by_worker_id,
    'attempts', j.attempts,
    'max_attempts', j.max_attempts,
    'created_at', j.created_at,
    'started_at', j.started_at,
    'finished_at', j.finished_at,
    'error_message', j.error_message,
    'result', j.result
  )
  from ops_orchestrator.orchestrator_jobs as j
  where j.id = p_job_id
  limit 1;
$$;

revoke all on function public.orchestrator_get_job_technical_detail(uuid) from public;
revoke execute on function public.orchestrator_get_job_technical_detail(uuid) from anon;
revoke execute on function public.orchestrator_get_job_technical_detail(uuid) from authenticated;
grant execute on function public.orchestrator_get_job_technical_detail(uuid) to service_role;