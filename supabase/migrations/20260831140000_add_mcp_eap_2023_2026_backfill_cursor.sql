begin;

create or replace function public.advance_mcp_eap_2023_2026_backfill_cursor_m2m(
  p_expected_source_id bigint,
  p_new_source_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_key constant text := 'MCP_BUCHUNGEN';
  v_sync_kind constant text := 'historical_backfill_2023_2026';
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_state public.recovery_sync_state%rowtype;
  v_previous_source_id bigint;
  v_expected_version bigint;
begin
  if p_expected_source_id is null or p_expected_source_id < 0 then
    raise exception 'expected_source_id must be non-negative' using errcode = '22023';
  end if;

  if p_new_source_id is null or p_new_source_id < 0 then
    raise exception 'new_source_id must be non-negative' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mcp_eap_historical_backfill_2023_2026_cursor', 0)
  );

  select state.*
  into v_state
  from public.recovery_sync_state as state
  where state.source_key = v_source_key
    and state.sync_kind = v_sync_kind
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'sync_state_not_found');
  end if;

  if v_state.last_source_id is distinct from p_expected_source_id then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'cursor_conflict',
      'lastSourceId', v_state.last_source_id,
      'version', v_state.version
    );
  end if;

  if p_new_source_id <= p_expected_source_id then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'cursor_not_advanced',
      'lastSourceId', v_state.last_source_id,
      'version', v_state.version
    );
  end if;

  v_previous_source_id := v_state.last_source_id;
  v_expected_version := v_state.version;

  update public.recovery_sync_state as state
  set last_source_id = p_new_source_id,
      last_success_at = v_now,
      last_error = null,
      version = state.version + 1,
      updated_at = v_now
  where state.source_key = v_source_key
    and state.sync_kind = v_sync_kind
    and state.last_source_id is not distinct from p_expected_source_id
    and state.version = v_expected_version
  returning state.* into v_state;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'cursor_conflict',
      'lastSourceId', v_previous_source_id,
      'version', v_expected_version
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'cursor_advanced',
    'previousSourceId', v_previous_source_id,
    'lastSourceId', v_state.last_source_id,
    'version', v_state.version
  );
end;
$$;

revoke all on function public.advance_mcp_eap_2023_2026_backfill_cursor_m2m(bigint, bigint)
  from public, anon, authenticated, service_role;

grant execute on function public.advance_mcp_eap_2023_2026_backfill_cursor_m2m(bigint, bigint)
  to service_role;

commit;
