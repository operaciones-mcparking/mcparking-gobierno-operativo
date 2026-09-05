begin;

alter table public.customer_mcp_eap_sync_state
  drop constraint customer_mcp_eap_sync_state_identity_check;

alter table public.customer_mcp_eap_sync_state
  add constraint customer_mcp_eap_sync_state_identity_check
  check (
    source = 'MCP_BUCHUNGEN'
    and stream_key in ('new_rows_cursor', 'active_reconciliation')
  );

insert into public.customer_mcp_eap_sync_state (
  source,
  stream_key,
  cursor_id,
  status,
  processed_rows,
  last_batch_count
) values (
  'MCP_BUCHUNGEN',
  'active_reconciliation',
  0,
  'ready',
  0,
  0
)
on conflict (source, stream_key) do nothing;

comment on column public.customer_mcp_eap_sync_state.cursor_id is
  'Incremental source cursor for new_rows_cursor. Reserved as 0 and unused by active_reconciliation.';

create or replace function public.customer_window_get_mcp_eap_reconciliation_state_m2m()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when state.source is null then pg_catalog.jsonb_build_object(
      'ok', false,
      'code', 'sync_state_not_found'
    )
    else pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'sync_state_found',
      'source', state.source,
      'streamKey', state.stream_key,
      'status', state.status,
      'processedRows', state.processed_rows,
      'lastBatchCount', state.last_batch_count,
      'lastStartedAt', state.last_started_at,
      'lastSucceededAt', state.last_succeeded_at,
      'lastError', state.last_error
    )
  end
  from (select 1) anchor
  left join public.customer_mcp_eap_sync_state state
    on state.source = 'MCP_BUCHUNGEN'
   and state.stream_key = 'active_reconciliation';
$$;

create or replace function public.customer_window_start_mcp_eap_reconciliation_m2m()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.customer_mcp_eap_sync_state%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_window_mcp_eap_active_reconciliation', 0)
  );

  select * into v_state
  from public.customer_mcp_eap_sync_state
  where source = 'MCP_BUCHUNGEN' and stream_key = 'active_reconciliation'
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'sync_state_not_found');
  end if;

  update public.customer_mcp_eap_sync_state
  set status = 'running',
      last_started_at = v_now,
      last_error = null,
      updated_at = v_now
  where source = 'MCP_BUCHUNGEN' and stream_key = 'active_reconciliation';

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'sync_started',
    'status', 'running',
    'processedRows', v_state.processed_rows
  );
end;
$$;

create or replace function public.customer_window_commit_mcp_eap_reconciliation_m2m(
  p_processed_rows integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.customer_mcp_eap_sync_state%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_processed_rows is null or p_processed_rows < 0 or p_processed_rows > 500 then
    raise exception 'Invalid processed row count' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_window_mcp_eap_active_reconciliation', 0)
  );

  select * into v_state
  from public.customer_mcp_eap_sync_state
  where source = 'MCP_BUCHUNGEN' and stream_key = 'active_reconciliation'
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'sync_state_not_found');
  end if;

  update public.customer_mcp_eap_sync_state
  set status = 'ready',
      processed_rows = processed_rows + p_processed_rows,
      last_batch_count = p_processed_rows,
      last_succeeded_at = v_now,
      last_error = null,
      updated_at = v_now
  where source = 'MCP_BUCHUNGEN' and stream_key = 'active_reconciliation'
  returning * into v_state;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'sync_committed',
    'status', v_state.status,
    'processedRows', v_state.processed_rows,
    'lastBatchCount', v_state.last_batch_count,
    'lastSucceededAt', v_state.last_succeeded_at
  );
end;
$$;

create or replace function public.customer_window_fail_mcp_eap_reconciliation_m2m(
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.customer_mcp_eap_sync_state%rowtype;
begin
  if nullif(pg_catalog.btrim(p_error), '') is null then
    raise exception 'Missing MCP/EAP reconciliation error' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_window_mcp_eap_active_reconciliation', 0)
  );

  select * into v_state
  from public.customer_mcp_eap_sync_state
  where source = 'MCP_BUCHUNGEN' and stream_key = 'active_reconciliation'
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'sync_state_not_found');
  end if;

  update public.customer_mcp_eap_sync_state
  set status = 'error',
      last_error = pg_catalog.left(pg_catalog.btrim(p_error), 1000),
      updated_at = pg_catalog.clock_timestamp()
  where source = 'MCP_BUCHUNGEN' and stream_key = 'active_reconciliation';

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'sync_failed',
    'status', 'error',
    'processedRows', v_state.processed_rows
  );
end;
$$;

revoke all on function public.customer_window_get_mcp_eap_reconciliation_state_m2m()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_start_mcp_eap_reconciliation_m2m()
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_commit_mcp_eap_reconciliation_m2m(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_fail_mcp_eap_reconciliation_m2m(text)
  from public, anon, authenticated, service_role;

grant execute on function public.customer_window_get_mcp_eap_reconciliation_state_m2m()
  to service_role;
grant execute on function public.customer_window_start_mcp_eap_reconciliation_m2m()
  to service_role;
grant execute on function public.customer_window_commit_mcp_eap_reconciliation_m2m(integer)
  to service_role;
grant execute on function public.customer_window_fail_mcp_eap_reconciliation_m2m(text)
  to service_role;

commit;
