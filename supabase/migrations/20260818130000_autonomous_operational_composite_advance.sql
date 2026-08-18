begin;

do $$
begin
  if to_regclass('ops_orchestrator.orchestrator_jobs') is null then
    raise exception 'Missing table ops_orchestrator.orchestrator_jobs';
  end if;

  if to_regclass('ops_orchestrator.orchestrator_job_events') is null then
    raise exception 'Missing table ops_orchestrator.orchestrator_job_events';
  end if;

  if to_regclass('ops_orchestrator.orchestrator_job_types') is null then
    raise exception 'Missing table ops_orchestrator.orchestrator_job_types';
  end if;

  if to_regclass('ops_orchestrator.orchestrator_workers') is null then
    raise exception 'Missing table ops_orchestrator.orchestrator_workers';
  end if;

  if to_regprocedure('public.orchestrator_finish_job(uuid,text,text,jsonb,text)') is null then
    raise exception 'Missing function public.orchestrator_finish_job(uuid,text,text,jsonb,text)';
  end if;

  if not exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'orchestrator_create_composite_job_step'
  ) then
    raise exception 'Missing function public.orchestrator_create_composite_job_step';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'ops_orchestrator'
      and tablename = 'orchestrator_jobs'
      and indexname = 'orchestrator_jobs_composite_step_uidx'
      and indexdef ilike 'create unique index%'
  ) then
    raise exception 'Missing unique index ops_orchestrator.orchestrator_jobs_composite_step_uidx';
  end if;
end;
$$;

create or replace function ops_orchestrator.advance_operational_composite_after_success(
  p_job_id uuid
)
returns ops_orchestrator.orchestrator_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current ops_orchestrator.orchestrator_jobs%rowtype;
  v_existing ops_orchestrator.orchestrator_jobs%rowtype;
  v_next ops_orchestrator.orchestrator_jobs%rowtype;
  v_initiator uuid;
  v_next_index smallint;
  v_next_job_type text;
  v_next_payload jsonb;
  v_next_priority integer;
  v_next_source text;
  v_next_worker text;
  v_next_job_type_enabled boolean;
begin
  select j.*
  into v_current
  from ops_orchestrator.orchestrator_jobs as j
  where j.id = p_job_id;

  if not found then
    raise exception 'Finished composite job not found';
  end if;

  if v_current.status <> 'succeeded'
    or v_current.composite_run_id is null
    or v_current.composite_kind is distinct from 'actualizar_datos_operacionales_last_month' then
    return null;
  end if;

  if v_current.sequence_total is distinct from 3::smallint
    or v_current.sequence_index is null
    or v_current.sequence_index not in (1::smallint, 2::smallint, 3::smallint) then
    raise exception 'Invalid operational composite sequence contract';
  end if;

  if v_current.sequence_index = 3::smallint then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'advance_operational_composite:' || v_current.composite_run_id::text,
      0
    )
  );

  select step_one.requested_by
  into v_initiator
  from ops_orchestrator.orchestrator_jobs as step_one
  where step_one.composite_run_id = v_current.composite_run_id
    and step_one.sequence_index = 1::smallint;

  if not found then
    raise exception 'Operational composite step 1 not found';
  end if;

  if v_current.sequence_index = 1::smallint then
    v_next_index := 2::smallint;
    v_next_job_type := 'banco_packs_actualizar_sin_consumos';
    v_next_payload := '{"action":"actualizar-packs"}'::jsonb;
    v_next_priority := 91;
    v_next_source := 'web_orchestrator_operaciones_last_month_packs';
    v_next_worker := 'pc_operaciones_01';
  elsif v_current.sequence_index = 2::smallint then
    v_next_index := 3::smallint;
    v_next_job_type := 'dashboard_actualizar_metricas';
    v_next_payload := '{"action":"actualizar-metricas","agent":"dashboard","periodo":"last-week"}'::jsonb;
    v_next_priority := 92;
    v_next_source := 'web_orchestrator_operaciones_last_month_dashboard';
    v_next_worker := 'pc_operaciones_01';
  else
    raise exception 'Operational composite has no next step';
  end if;

  select jt.enabled
  into v_next_job_type_enabled
  from ops_orchestrator.orchestrator_job_types as jt
  where jt.job_type = v_next_job_type;

  if not found then
    raise exception 'Operational composite next job type does not exist: %', v_next_job_type;
  end if;

  if not exists (
    select 1
    from ops_orchestrator.orchestrator_workers as w
    where w.worker_id = v_next_worker
  ) then
    raise exception 'Operational composite target worker does not exist: %', v_next_worker;
  end if;

  select j.*
  into v_existing
  from ops_orchestrator.orchestrator_jobs as j
  where j.composite_run_id = v_current.composite_run_id
    and j.sequence_index = v_next_index;

  if found then
    if v_existing.composite_kind is distinct from 'actualizar_datos_operacionales_last_month'
      or v_existing.sequence_total is distinct from 3::smallint
      or v_existing.job_type is distinct from v_next_job_type
      or v_existing.requested_source is distinct from v_next_source
      or v_existing.target_worker_id is distinct from v_next_worker
      or v_existing.priority is distinct from v_next_priority
      or v_existing.payload is distinct from v_next_payload then
      raise exception 'Composite step already exists with different contract';
    end if;

    return v_existing;
  end if;

  begin
    insert into ops_orchestrator.orchestrator_jobs (
      job_type,
      status,
      requested_by,
      requested_source,
      target_worker_id,
      priority,
      payload,
      not_before,
      composite_run_id,
      composite_kind,
      sequence_index,
      sequence_total
    )
    values (
      v_next_job_type,
      'queued',
      v_initiator,
      v_next_source,
      v_next_worker,
      v_next_priority,
      v_next_payload,
      now(),
      v_current.composite_run_id,
      'actualizar_datos_operacionales_last_month',
      v_next_index,
      3::smallint
    )
    returning * into v_next;

    insert into ops_orchestrator.orchestrator_job_events (
      job_id,
      worker_id,
      event_type,
      message,
      data
    )
    values (
      v_next.id,
      null,
      'created',
      'Composite job step created',
      jsonb_build_object(
        'requested_source', v_next_source,
        'composite_run_id', v_current.composite_run_id,
        'composite_kind', 'actualizar_datos_operacionales_last_month',
        'sequence_index', v_next_index,
        'sequence_total', 3,
        'autonomous_advance', true,
        'job_type_enabled', v_next_job_type_enabled
      )
    );

    return v_next;
  exception
    when unique_violation then
      select j.*
      into v_existing
      from ops_orchestrator.orchestrator_jobs as j
      where j.composite_run_id = v_current.composite_run_id
        and j.sequence_index = v_next_index;

      if not found then
        raise;
      end if;

      if v_existing.composite_kind is distinct from 'actualizar_datos_operacionales_last_month'
        or v_existing.sequence_total is distinct from 3::smallint
        or v_existing.job_type is distinct from v_next_job_type
        or v_existing.requested_source is distinct from v_next_source
        or v_existing.target_worker_id is distinct from v_next_worker
        or v_existing.priority is distinct from v_next_priority
        or v_existing.payload is distinct from v_next_payload then
        raise exception 'Composite step already exists with different contract';
      end if;

      return v_existing;
  end;
end;
$$;

revoke all on function ops_orchestrator.advance_operational_composite_after_success(uuid) from public;
revoke execute on function ops_orchestrator.advance_operational_composite_after_success(uuid) from anon;
revoke execute on function ops_orchestrator.advance_operational_composite_after_success(uuid) from authenticated;

create or replace function public.orchestrator_finish_job(
  p_job_id uuid,
  p_worker_id text,
  p_status text,
  p_result jsonb default null,
  p_error_message text default null
)
returns ops_orchestrator.orchestrator_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job ops_orchestrator.orchestrator_jobs%rowtype;
begin
  if p_status not in ('succeeded', 'failed', 'cancelled') then
    raise exception 'Estado final invalido: %', p_status;
  end if;

  update ops_orchestrator.orchestrator_jobs
  set
    status = p_status,
    result = p_result,
    error_message = p_error_message,
    finished_at = now(),
    updated_at = now()
  where id = p_job_id
    and locked_by_worker_id = p_worker_id
    and status = 'running'
  returning * into v_job;

  if not found then
    raise exception 'Job no encontrado, no esta running o no pertenece al worker';
  end if;

  update ops_orchestrator.orchestrator_workers
  set
    status = 'idle',
    current_job_id = null,
    last_seen_at = now(),
    updated_at = now()
  where worker_id = p_worker_id
    and current_job_id = p_job_id;

  insert into ops_orchestrator.orchestrator_job_events (
    job_id,
    worker_id,
    event_type,
    message,
    data
  )
  values (
    p_job_id,
    p_worker_id,
    p_status,
    case p_status
      when 'succeeded' then 'Job finalizado correctamente'
      when 'failed' then 'Job finalizado con error'
      when 'cancelled' then 'Job cancelado'
    end,
    jsonb_strip_nulls(
      jsonb_build_object(
        'result', p_result,
        'error_message', p_error_message
      )
    )
  );

  if p_status = 'succeeded' then
    perform ops_orchestrator.advance_operational_composite_after_success(v_job.id);
  end if;

  return v_job;
end;
$$;

revoke all on function public.orchestrator_finish_job(uuid, text, text, jsonb, text) from public;
revoke execute on function public.orchestrator_finish_job(uuid, text, text, jsonb, text) from anon;
revoke execute on function public.orchestrator_finish_job(uuid, text, text, jsonb, text) from authenticated;
grant execute on function public.orchestrator_finish_job(uuid, text, text, jsonb, text) to service_role;

commit;
