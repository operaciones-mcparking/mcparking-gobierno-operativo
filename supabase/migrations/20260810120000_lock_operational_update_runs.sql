create or replace function public.orchestrator_get_active_operational_update_jobs()
returns table (
  id uuid,
  job_type text,
  status text,
  requested_source text,
  target_worker_id text,
  locked_by_worker_id text,
  attempts integer,
  max_attempts integer,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  composite_run_id uuid,
  composite_kind text,
  sequence_index smallint,
  sequence_total smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  with active_runs as (
    select
      j.composite_run_id,
      max(j.created_at) as last_created_at
    from ops_orchestrator.orchestrator_jobs as j
    where j.composite_kind = 'actualizar_datos_operacionales_last_month'
    group by j.composite_run_id
    having count(*) filter (where j.status not in ('succeeded', 'failed', 'cancelled')) > 0
  ),
  selected_run as (
    select active_runs.composite_run_id
    from active_runs
    order by active_runs.last_created_at desc, active_runs.composite_run_id desc
    limit 1
  )
  select
    j.id,
    j.job_type,
    j.status,
    j.requested_source,
    j.target_worker_id,
    j.locked_by_worker_id,
    j.attempts,
    j.max_attempts,
    j.error_message,
    j.started_at,
    j.finished_at,
    j.created_at,
    j.updated_at,
    j.composite_run_id,
    j.composite_kind,
    j.sequence_index,
    j.sequence_total
  from ops_orchestrator.orchestrator_jobs as j
  join selected_run on selected_run.composite_run_id = j.composite_run_id
  order by j.sequence_index asc, j.created_at asc, j.id asc;
$$;

create or replace function public.orchestrator_start_operational_update(
  p_requested_by uuid,
  p_not_before timestamptz default now()
)
returns table (
  created boolean,
  existing boolean,
  id uuid,
  job_type text,
  status text,
  requested_source text,
  target_worker_id text,
  locked_by_worker_id text,
  attempts integer,
  max_attempts integer,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  composite_run_id uuid,
  composite_kind text,
  sequence_index smallint,
  sequence_total smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('actualizar_datos_operacionales_last_month', 0));

  if exists (select 1 from public.orchestrator_get_active_operational_update_jobs()) then
    return query
      select
        false,
        true,
        active.id,
        active.job_type,
        active.status,
        active.requested_source,
        active.target_worker_id,
        active.locked_by_worker_id,
        active.attempts,
        active.max_attempts,
        active.error_message,
        active.started_at,
        active.finished_at,
        active.created_at,
        active.updated_at,
        active.composite_run_id,
        active.composite_kind,
        active.sequence_index,
        active.sequence_total
      from public.orchestrator_get_active_operational_update_jobs() as active;
    return;
  end if;

  v_run_id := gen_random_uuid();

  return query
    select
      true,
      false,
      created_step.id,
      created_step.job_type,
      created_step.status,
      created_step.requested_source,
      created_step.target_worker_id,
      created_step.locked_by_worker_id,
      created_step.attempts,
      created_step.max_attempts,
      created_step.error_message,
      created_step.started_at,
      created_step.finished_at,
      created_step.created_at,
      created_step.updated_at,
      created_step.composite_run_id,
      created_step.composite_kind,
      created_step.sequence_index,
      created_step.sequence_total
    from public.orchestrator_create_composite_job_step(
      p_composite_kind := 'actualizar_datos_operacionales_last_month',
      p_composite_run_id := v_run_id,
      p_job_type := 'banco_reservas_actualizar',
      p_payload := jsonb_build_object('modo', 'last-week'),
      p_priority := 90,
      p_requested_by := p_requested_by,
      p_requested_source := 'web_orchestrator_operaciones_last_month_reservas',
      p_sequence_index := 1::smallint,
      p_sequence_total := 3::smallint,
      p_target_worker_id := 'pc_operaciones_01',
      p_not_before := p_not_before
    ) as created_step;
end;
$$;

create or replace function public.orchestrator_create_operational_update_step_if_missing(
  p_composite_run_id uuid,
  p_requested_by uuid,
  p_job_type text,
  p_payload jsonb,
  p_priority integer,
  p_requested_source text,
  p_sequence_index smallint,
  p_target_worker_id text,
  p_not_before timestamptz default now()
)
returns table (
  created boolean,
  existing boolean,
  id uuid,
  job_type text,
  status text,
  requested_source text,
  target_worker_id text,
  locked_by_worker_id text,
  attempts integer,
  max_attempts integer,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  composite_run_id uuid,
  composite_kind text,
  sequence_index smallint,
  sequence_total smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('actualizar_datos_operacionales_last_month', 0));

  if exists (
    select 1
    from ops_orchestrator.orchestrator_jobs as j
    where j.composite_run_id = p_composite_run_id
      and j.composite_kind = 'actualizar_datos_operacionales_last_month'
      and j.sequence_index = p_sequence_index
  ) then
    return query
      select
        false,
        true,
        j.id,
        j.job_type,
        j.status,
        j.requested_source,
        j.target_worker_id,
        j.locked_by_worker_id,
        j.attempts,
        j.max_attempts,
        j.error_message,
        j.started_at,
        j.finished_at,
        j.created_at,
        j.updated_at,
        j.composite_run_id,
        j.composite_kind,
        j.sequence_index,
        j.sequence_total
      from ops_orchestrator.orchestrator_jobs as j
      where j.composite_run_id = p_composite_run_id
        and j.composite_kind = 'actualizar_datos_operacionales_last_month'
        and j.sequence_index = p_sequence_index
      order by j.created_at asc, j.id asc
      limit 1;
    return;
  end if;

  return query
    select
      true,
      false,
      created_step.id,
      created_step.job_type,
      created_step.status,
      created_step.requested_source,
      created_step.target_worker_id,
      created_step.locked_by_worker_id,
      created_step.attempts,
      created_step.max_attempts,
      created_step.error_message,
      created_step.started_at,
      created_step.finished_at,
      created_step.created_at,
      created_step.updated_at,
      created_step.composite_run_id,
      created_step.composite_kind,
      created_step.sequence_index,
      created_step.sequence_total
    from public.orchestrator_create_composite_job_step(
      p_composite_kind := 'actualizar_datos_operacionales_last_month',
      p_composite_run_id := p_composite_run_id,
      p_job_type := p_job_type,
      p_payload := p_payload,
      p_priority := p_priority,
      p_requested_by := p_requested_by,
      p_requested_source := p_requested_source,
      p_sequence_index := p_sequence_index,
      p_sequence_total := 3::smallint,
      p_target_worker_id := p_target_worker_id,
      p_not_before := p_not_before
    ) as created_step;
end;
$$;

revoke all on function public.orchestrator_get_active_operational_update_jobs() from public;
revoke execute on function public.orchestrator_get_active_operational_update_jobs() from anon;
revoke execute on function public.orchestrator_get_active_operational_update_jobs() from authenticated;
grant execute on function public.orchestrator_get_active_operational_update_jobs() to service_role;

revoke all on function public.orchestrator_start_operational_update(uuid, timestamptz) from public;
revoke execute on function public.orchestrator_start_operational_update(uuid, timestamptz) from anon;
revoke execute on function public.orchestrator_start_operational_update(uuid, timestamptz) from authenticated;
grant execute on function public.orchestrator_start_operational_update(uuid, timestamptz) to service_role;

revoke all on function public.orchestrator_create_operational_update_step_if_missing(uuid, uuid, text, jsonb, integer, text, smallint, text, timestamptz) from public;
revoke execute on function public.orchestrator_create_operational_update_step_if_missing(uuid, uuid, text, jsonb, integer, text, smallint, text, timestamptz) from anon;
revoke execute on function public.orchestrator_create_operational_update_step_if_missing(uuid, uuid, text, jsonb, integer, text, smallint, text, timestamptz) from authenticated;
grant execute on function public.orchestrator_create_operational_update_step_if_missing(uuid, uuid, text, jsonb, integer, text, smallint, text, timestamptz) to service_role;