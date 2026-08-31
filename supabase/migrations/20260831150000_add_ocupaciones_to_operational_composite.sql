begin;

do $$
begin
  if to_regprocedure('public.orchestrator_start_operational_update(uuid,timestamp with time zone)') is null then
    raise exception 'Missing function public.orchestrator_start_operational_update';
  end if;

  if to_regprocedure('public.orchestrator_create_operational_update_step_if_missing(uuid,uuid,text,jsonb,integer,text,smallint,text,timestamp with time zone)') is null then
    raise exception 'Missing function public.orchestrator_create_operational_update_step_if_missing';
  end if;

  if to_regprocedure('ops_orchestrator.advance_operational_composite_after_success(uuid)') is null then
    raise exception 'Missing function ops_orchestrator.advance_operational_composite_after_success';
  end if;

  if to_regprocedure('public.orchestrator_finish_job(uuid,text,text,jsonb,text)') is null then
    raise exception 'Missing function public.orchestrator_finish_job';
  end if;
end;
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
      p_sequence_total := 4::smallint,
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
      p_sequence_total := 4::smallint,
      p_target_worker_id := p_target_worker_id,
      p_not_before := p_not_before
    ) as created_step;
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

  if v_current.sequence_total is distinct from 4::smallint
    or v_current.sequence_index is null
    or v_current.sequence_index not in (1::smallint, 2::smallint, 3::smallint, 4::smallint) then
    raise exception 'Invalid operational composite sequence contract';
  end if;

  if v_current.sequence_index = 4::smallint then
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
    v_next_job_type := 'ocupaciones_actualizar';
    v_next_payload := '{"modo":"last-week"}'::jsonb;
    v_next_priority := 100;
    v_next_source := 'web_orchestrator';
    v_next_worker := 'pc_operaciones_01';
  elsif v_current.sequence_index = 3::smallint then
    v_next_index := 4::smallint;
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
      or v_existing.sequence_total is distinct from 4::smallint
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
      4::smallint
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
        'sequence_total', 4,
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
        or v_existing.sequence_total is distinct from 4::smallint
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


revoke all on function public.orchestrator_start_operational_update(uuid, timestamptz) from public;
revoke execute on function public.orchestrator_start_operational_update(uuid, timestamptz) from anon;
revoke execute on function public.orchestrator_start_operational_update(uuid, timestamptz) from authenticated;
grant execute on function public.orchestrator_start_operational_update(uuid, timestamptz) to service_role;

revoke all on function public.orchestrator_create_operational_update_step_if_missing(uuid, uuid, text, jsonb, integer, text, smallint, text, timestamptz) from public;
revoke execute on function public.orchestrator_create_operational_update_step_if_missing(uuid, uuid, text, jsonb, integer, text, smallint, text, timestamptz) from anon;
revoke execute on function public.orchestrator_create_operational_update_step_if_missing(uuid, uuid, text, jsonb, integer, text, smallint, text, timestamptz) from authenticated;
grant execute on function public.orchestrator_create_operational_update_step_if_missing(uuid, uuid, text, jsonb, integer, text, smallint, text, timestamptz) to service_role;

revoke all on function ops_orchestrator.advance_operational_composite_after_success(uuid) from public;
revoke execute on function ops_orchestrator.advance_operational_composite_after_success(uuid) from anon;
revoke execute on function ops_orchestrator.advance_operational_composite_after_success(uuid) from authenticated;

commit;