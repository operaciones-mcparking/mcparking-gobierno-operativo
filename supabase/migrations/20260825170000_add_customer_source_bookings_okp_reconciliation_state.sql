begin;

alter table public.recovery_sync_state
  add column if not exists last_source_updated_at timestamp without time zone null;

create or replace function public.get_customer_source_bookings_okp_reconciliation_state_m2m()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state public.recovery_sync_state%rowtype;
begin
  select state.*
  into v_state
  from public.recovery_sync_state as state
  where state.source_key = 'BOOKINGS_LOGS_OKP'
    and state.sync_kind = 'active_reconciliation'
  limit 1;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'sync_state_not_found'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'sync_state_found',
    'sourceKey', v_state.source_key,
    'syncKind', v_state.sync_kind,
    'lastSourceUpdatedAt', v_state.last_source_updated_at,
    'lastSourceId', v_state.last_source_id,
    'version', v_state.version,
    'lastAttemptAt', v_state.last_attempt_at,
    'lastSuccessAt', v_state.last_success_at,
    'lastError', v_state.last_error
  );
end;
$$;

create or replace function public.advance_customer_source_bookings_okp_reconciliation_cursor_m2m(
  p_expected_source_updated_at timestamp without time zone,
  p_expected_source_id bigint,
  p_new_source_updated_at timestamp without time zone,
  p_new_source_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_state public.recovery_sync_state%rowtype;
  v_previous_source_updated_at timestamp without time zone;
  v_previous_source_id bigint;
begin
  if p_expected_source_updated_at is null or p_new_source_updated_at is null then
    raise exception 'expected and new source_updated_at are required' using errcode = '22023';
  end if;

  if p_expected_source_id is null or p_expected_source_id < 0 then
    raise exception 'expected_source_id must be non-negative' using errcode = '22023';
  end if;

  if p_new_source_id is null or p_new_source_id < 0 then
    raise exception 'new_source_id must be non-negative' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_source_bookings_okp_active_reconciliation_cursor', 0)
  );

  select state.*
  into v_state
  from public.recovery_sync_state as state
  where state.source_key = 'BOOKINGS_LOGS_OKP'
    and state.sync_kind = 'active_reconciliation'
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'sync_state_not_found'
    );
  end if;

  if v_state.last_source_updated_at is distinct from p_expected_source_updated_at
    or v_state.last_source_id is distinct from p_expected_source_id then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'cursor_conflict',
      'lastSourceUpdatedAt', v_state.last_source_updated_at,
      'lastSourceId', v_state.last_source_id,
      'version', v_state.version
    );
  end if;

  if p_new_source_updated_at < p_expected_source_updated_at
    or (
      p_new_source_updated_at = p_expected_source_updated_at
      and p_new_source_id <= p_expected_source_id
    ) then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'cursor_not_advanced',
      'lastSourceUpdatedAt', v_state.last_source_updated_at,
      'lastSourceId', v_state.last_source_id,
      'version', v_state.version
    );
  end if;

  v_previous_source_updated_at := v_state.last_source_updated_at;
  v_previous_source_id := v_state.last_source_id;

  update public.recovery_sync_state as state
  set
    last_source_updated_at = p_new_source_updated_at,
    last_source_id = p_new_source_id,
    last_success_at = v_now,
    last_error = null,
    version = state.version + 1,
    updated_at = v_now
  where state.source_key = 'BOOKINGS_LOGS_OKP'
    and state.sync_kind = 'active_reconciliation'
    and state.last_source_updated_at is not distinct from p_expected_source_updated_at
    and state.last_source_id is not distinct from p_expected_source_id
    and state.version = v_state.version
  returning state.* into v_state;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'cursor_conflict',
      'lastSourceUpdatedAt', v_previous_source_updated_at,
      'lastSourceId', v_previous_source_id,
      'version', v_state.version
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'cursor_advanced',
    'previousSourceUpdatedAt', v_previous_source_updated_at,
    'previousSourceId', v_previous_source_id,
    'lastSourceUpdatedAt', v_state.last_source_updated_at,
    'lastSourceId', v_state.last_source_id,
    'version', v_state.version
  );
end;
$$;

revoke all on function public.get_customer_source_bookings_okp_reconciliation_state_m2m()
  from public, anon, authenticated, service_role;

grant execute on function public.get_customer_source_bookings_okp_reconciliation_state_m2m()
  to service_role;

revoke all on function public.advance_customer_source_bookings_okp_reconciliation_cursor_m2m(
  timestamp without time zone,
  bigint,
  timestamp without time zone,
  bigint
) from public, anon, authenticated, service_role;

grant execute on function public.advance_customer_source_bookings_okp_reconciliation_cursor_m2m(
  timestamp without time zone,
  bigint,
  timestamp without time zone,
  bigint
) to service_role;

commit;
