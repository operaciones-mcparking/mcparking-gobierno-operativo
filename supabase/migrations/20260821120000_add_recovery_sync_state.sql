-- Durable service-role-only cursor state for recovery source synchronization.
-- This migration creates infrastructure only; it does not seed a production cursor.

begin;

do $$
begin
  if to_regclass('public.recovery_import_batches') is null then
    raise exception 'Required table public.recovery_import_batches does not exist';
  end if;
end;
$$;

create table public.recovery_sync_state (
  source_key text not null,
  sync_kind text not null,
  last_source_id bigint,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_batch_id uuid references public.recovery_import_batches(id) on delete set null,
  last_error text,
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_key, sync_kind),
  constraint recovery_sync_state_source_key_check
    check (length(btrim(source_key)) between 1 and 100),
  constraint recovery_sync_state_sync_kind_check
    check (length(btrim(sync_kind)) between 1 and 100),
  constraint recovery_sync_state_last_source_id_check
    check (last_source_id is null or last_source_id >= 0),
  constraint recovery_sync_state_version_check
    check (version >= 0),
  constraint recovery_sync_state_last_error_check
    check (last_error is null or length(last_error) <= 500)
);

comment on table public.recovery_sync_state is
  'Operational metadata for durable recovery synchronization cursors. Contains no payloads, secrets, or PII.';

comment on column public.recovery_sync_state.last_source_id is
  'Last source identifier confirmed after a successful remote import. Null means the cutover cursor is not initialized.';

comment on column public.recovery_sync_state.version is
  'Monotonic compare-and-set version incremented only when the cursor advances successfully.';

alter table public.recovery_sync_state enable row level security;

revoke all on table public.recovery_sync_state from public, anon, authenticated;
grant select, insert, update, delete on table public.recovery_sync_state to service_role;

create or replace function public.recovery_get_sync_state_m2m(
  p_source_key text,
  p_sync_kind text
)
returns table (
  source_key text,
  sync_kind text,
  last_source_id bigint,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_batch_id uuid,
  last_error text,
  version bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    state.source_key,
    state.sync_kind,
    state.last_source_id,
    state.last_attempt_at,
    state.last_success_at,
    state.last_batch_id,
    state.last_error,
    state.version,
    state.created_at,
    state.updated_at
  from public.recovery_sync_state as state
  where state.source_key = nullif(btrim(p_source_key), '')
    and state.sync_kind = nullif(btrim(p_sync_kind), '')
  limit 1;
$$;

create or replace function public.recovery_record_sync_attempt_m2m(
  p_source_key text,
  p_sync_kind text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_key text := nullif(btrim(p_source_key), '');
  v_sync_kind text := nullif(btrim(p_sync_kind), '');
  v_now timestamptz := clock_timestamp();
  v_error text;
  v_state public.recovery_sync_state%rowtype;
begin
  if v_source_key is null or v_sync_kind is null then
    raise exception 'source_key and sync_kind are required' using errcode = '22023';
  end if;

  v_error := nullif(
    btrim(regexp_replace(coalesce(p_error, ''), '[[:cntrl:]]+', ' ', 'g')),
    ''
  );
  v_error := left(v_error, 500);

  update public.recovery_sync_state as state
  set
    last_attempt_at = v_now,
    last_error = v_error,
    updated_at = v_now
  where state.source_key = v_source_key
    and state.sync_kind = v_sync_kind
  returning state.* into v_state;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'sync_state_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'attempt_recorded',
    'sourceKey', v_state.source_key,
    'syncKind', v_state.sync_kind,
    'lastSourceId', v_state.last_source_id,
    'lastAttemptAt', v_state.last_attempt_at,
    'version', v_state.version
  );
end;
$$;

create or replace function public.recovery_advance_sync_cursor_m2m(
  p_source_key text,
  p_sync_kind text,
  p_expected_last_source_id bigint,
  p_new_last_source_id bigint,
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_key text := nullif(btrim(p_source_key), '');
  v_sync_kind text := nullif(btrim(p_sync_kind), '');
  v_now timestamptz := clock_timestamp();
  v_state public.recovery_sync_state%rowtype;
begin
  if v_source_key is null or v_sync_kind is null then
    raise exception 'source_key and sync_kind are required' using errcode = '22023';
  end if;

  if p_expected_last_source_id is not null and p_expected_last_source_id < 0 then
    raise exception 'expected_last_source_id must be null or non-negative' using errcode = '22023';
  end if;

  if p_new_last_source_id is null or p_new_last_source_id < 0 then
    raise exception 'new_last_source_id must be non-negative' using errcode = '22023';
  end if;

  if p_batch_id is null or not exists (
    select 1
    from public.recovery_import_batches as batch
    where batch.id = p_batch_id
      and batch.status = 'imported'
  ) then
    return jsonb_build_object('ok', false, 'code', 'invalid_batch');
  end if;

  select state.*
  into v_state
  from public.recovery_sync_state as state
  where state.source_key = v_source_key
    and state.sync_kind = v_sync_kind
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'sync_state_not_found');
  end if;

  if v_state.last_source_id is distinct from p_expected_last_source_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'stale_cursor',
      'currentLastSourceId', v_state.last_source_id,
      'version', v_state.version
    );
  end if;

  if v_state.last_source_id is not null and p_new_last_source_id <= v_state.last_source_id then
    return jsonb_build_object(
      'ok', false,
      'code', 'cursor_not_advanced',
      'currentLastSourceId', v_state.last_source_id,
      'version', v_state.version
    );
  end if;

  update public.recovery_sync_state as state
  set
    last_source_id = p_new_last_source_id,
    last_success_at = v_now,
    last_batch_id = p_batch_id,
    last_error = null,
    version = state.version + 1,
    updated_at = v_now
  where state.source_key = v_source_key
    and state.sync_kind = v_sync_kind
    and state.version = v_state.version
    and state.last_source_id is not distinct from p_expected_last_source_id
  returning state.* into v_state;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'stale_cursor');
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'cursor_advanced',
    'sourceKey', v_state.source_key,
    'syncKind', v_state.sync_kind,
    'lastSourceId', v_state.last_source_id,
    'lastSuccessAt', v_state.last_success_at,
    'lastBatchId', v_state.last_batch_id,
    'version', v_state.version
  );
end;
$$;

revoke all on function public.recovery_get_sync_state_m2m(text, text) from public, anon, authenticated;
grant execute on function public.recovery_get_sync_state_m2m(text, text) to service_role;

revoke all on function public.recovery_record_sync_attempt_m2m(text, text, text) from public, anon, authenticated;
grant execute on function public.recovery_record_sync_attempt_m2m(text, text, text) to service_role;

revoke all on function public.recovery_advance_sync_cursor_m2m(text, text, bigint, bigint, uuid) from public, anon, authenticated;
grant execute on function public.recovery_advance_sync_cursor_m2m(text, text, bigint, bigint, uuid) to service_role;

commit;
