begin;

create table public.customer_profile_metrics_incremental_state (
  stream_key text primary key,
  watermark_updated_at timestamptz,
  watermark_tiebreaker text,
  status text not null default 'uninitialized',
  processed_rows bigint not null default 0,
  last_batch_count integer not null default 0,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint customer_profile_metrics_incremental_state_stream_check
    check (stream_key in ('booking_links', 'okp', 'mcp_eap', 'customer_profiles')),
  constraint customer_profile_metrics_incremental_state_status_check
    check (status in ('uninitialized', 'ready', 'running', 'error')),
  constraint customer_profile_metrics_incremental_state_watermark_check
    check ((watermark_updated_at is null) = (watermark_tiebreaker is null)),
  constraint customer_profile_metrics_incremental_state_counts_check
    check (processed_rows >= 0 and last_batch_count >= 0)
);

alter table public.customer_profile_metrics_incremental_state enable row level security;
revoke all on table public.customer_profile_metrics_incremental_state
  from public, anon, authenticated, service_role;

insert into public.customer_profile_metrics_incremental_state (stream_key)
values ('booking_links'), ('okp'), ('mcp_eap'), ('customer_profiles')
on conflict (stream_key) do nothing;

create or replace function public.customer_window_get_profile_metrics_incremental_state_m2m()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'ok', true,
    'streams', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'streamKey', state.stream_key,
      'watermarkUpdatedAt', state.watermark_updated_at,
      'watermarkTiebreaker', state.watermark_tiebreaker,
      'status', state.status,
      'processedRows', state.processed_rows,
      'lastBatchCount', state.last_batch_count,
      'lastStartedAt', state.last_started_at,
      'lastSucceededAt', state.last_succeeded_at,
      'lastError', state.last_error
    ) order by state.stream_key), '[]'::jsonb)
  )
  from public.customer_profile_metrics_incremental_state state;
$$;

create or replace function public.customer_window_initialize_profile_metrics_incremental_watermark_m2m(
  p_stream_key text,
  p_watermark_updated_at timestamptz,
  p_watermark_tiebreaker text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.customer_profile_metrics_incremental_state%rowtype;
begin
  if p_stream_key not in ('booking_links', 'okp', 'mcp_eap', 'customer_profiles')
    or p_watermark_updated_at is null or p_watermark_tiebreaker is null
    or pg_catalog.btrim(p_watermark_tiebreaker) = '' then
    raise exception 'Invalid incremental watermark initialization' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('customer_profile_metrics_incremental:' || p_stream_key, 0));
  select * into v_state from public.customer_profile_metrics_incremental_state
  where stream_key = p_stream_key for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'stream_not_found'); end if;
  if v_state.status <> 'uninitialized' then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'stream_already_initialized');
  end if;
  update public.customer_profile_metrics_incremental_state set
    watermark_updated_at = p_watermark_updated_at,
    watermark_tiebreaker = p_watermark_tiebreaker,
    status = 'ready', last_error = null, updated_at = pg_catalog.clock_timestamp()
  where stream_key = p_stream_key and status = 'uninitialized';
  return pg_catalog.jsonb_build_object('ok', true, 'code', 'watermark_initialized',
    'streamKey', p_stream_key, 'watermarkUpdatedAt', p_watermark_updated_at,
    'watermarkTiebreaker', p_watermark_tiebreaker);
end;
$$;

create or replace function public.customer_window_get_profile_metrics_booking_link_changes_m2m(
  p_after_updated_at timestamptz, p_after_id uuid, p_limit integer default 100
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ids jsonb; v_count integer; v_more boolean; v_next_at timestamptz; v_next_id uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 or (p_after_updated_at is null) <> (p_after_id is null) then
    raise exception 'Invalid booking link change cursor' using errcode = '22023'; end if;
  with page as materialized (
    select link.updated_at, link.id, link.profile_id
    from public.customer_booking_profile_links link
    where p_after_updated_at is null or (link.updated_at, link.id) > (p_after_updated_at, p_after_id)
    order by link.updated_at, link.id limit p_limit + 1
  ), batch as (select * from page order by updated_at, id limit p_limit)
  select coalesce((select pg_catalog.jsonb_agg(customer_id order by customer_id) from (select distinct profile_id customer_id from batch) ids), '[]'::jsonb),
    (select count(*) from batch), (select count(*) > p_limit from page),
    (select updated_at from batch order by updated_at desc, id desc limit 1),
    (select id from batch order by updated_at desc, id desc limit 1)
  into v_ids, v_count, v_more, v_next_at, v_next_id;
  return pg_catalog.jsonb_build_object('ok', true, 'customerIds', v_ids, 'customerCount', pg_catalog.jsonb_array_length(v_ids),
    'sourceRowCount', v_count, 'nextWatermarkUpdatedAt', v_next_at,
    'nextWatermarkTiebreaker', v_next_id::text, 'hasMore', v_more);
end; $$;

create or replace function public.customer_window_get_profile_metrics_okp_changes_m2m(
  p_after_updated_at timestamptz, p_after_source_row_id bigint, p_limit integer default 100
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ids jsonb; v_count integer; v_more boolean; v_next_at timestamptz; v_next_id bigint;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 or (p_after_updated_at is null) <> (p_after_source_row_id is null) then
    raise exception 'Invalid OKP change cursor' using errcode = '22023'; end if;
  with page as materialized (
    select booking.updated_at, booking.source_row_id
    from public.customer_source_bookings_okp booking
    where p_after_updated_at is null or (booking.updated_at, booking.source_row_id) > (p_after_updated_at, p_after_source_row_id)
    order by booking.updated_at, booking.source_row_id limit p_limit + 1
  ), batch as (select * from page order by updated_at, source_row_id limit p_limit)
  select coalesce((select pg_catalog.jsonb_agg(customer_id order by customer_id) from (
      select distinct link.profile_id customer_id from batch
      join public.customer_booking_profile_links link on link.source = 'OKP' and link.source_row_id = batch.source_row_id
    ) ids), '[]'::jsonb), (select count(*) from batch), (select count(*) > p_limit from page),
    (select updated_at from batch order by updated_at desc, source_row_id desc limit 1),
    (select source_row_id from batch order by updated_at desc, source_row_id desc limit 1)
  into v_ids, v_count, v_more, v_next_at, v_next_id;
  return pg_catalog.jsonb_build_object('ok', true, 'customerIds', v_ids, 'customerCount', pg_catalog.jsonb_array_length(v_ids),
    'sourceRowCount', v_count, 'nextWatermarkUpdatedAt', v_next_at,
    'nextWatermarkTiebreaker', v_next_id::text, 'hasMore', v_more);
end; $$;

create or replace function public.customer_window_get_profile_metrics_mcp_eap_changes_m2m(
  p_after_updated_at timestamptz, p_after_source_row_id bigint, p_limit integer default 100
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ids jsonb; v_count integer; v_more boolean; v_next_at timestamptz; v_next_id bigint;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 or (p_after_updated_at is null) <> (p_after_source_row_id is null) then
    raise exception 'Invalid MCP/EAP change cursor' using errcode = '22023'; end if;
  with page as materialized (
    select booking.updated_at, booking.source_row_id
    from public.customer_source_bookings_mcp_eap booking
    where p_after_updated_at is null or (booking.updated_at, booking.source_row_id) > (p_after_updated_at, p_after_source_row_id)
    order by booking.updated_at, booking.source_row_id limit p_limit + 1
  ), batch as (select * from page order by updated_at, source_row_id limit p_limit)
  select coalesce((select pg_catalog.jsonb_agg(customer_id order by customer_id) from (
      select distinct link.profile_id customer_id from batch
      join public.customer_booking_profile_links link on link.source = 'MCP_EAP' and link.source_row_id = batch.source_row_id
    ) ids), '[]'::jsonb), (select count(*) from batch), (select count(*) > p_limit from page),
    (select updated_at from batch order by updated_at desc, source_row_id desc limit 1),
    (select source_row_id from batch order by updated_at desc, source_row_id desc limit 1)
  into v_ids, v_count, v_more, v_next_at, v_next_id;
  return pg_catalog.jsonb_build_object('ok', true, 'customerIds', v_ids, 'customerCount', pg_catalog.jsonb_array_length(v_ids),
    'sourceRowCount', v_count, 'nextWatermarkUpdatedAt', v_next_at,
    'nextWatermarkTiebreaker', v_next_id::text, 'hasMore', v_more);
end; $$;

create or replace function public.customer_window_get_profile_metrics_customer_profile_changes_m2m(
  p_after_updated_at timestamptz, p_after_id uuid, p_limit integer default 100
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ids jsonb; v_count integer; v_more boolean; v_next_at timestamptz; v_next_id uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 or (p_after_updated_at is null) <> (p_after_id is null) then
    raise exception 'Invalid customer profile change cursor' using errcode = '22023'; end if;
  with page as materialized (
    select profile.updated_at, profile.id, profile.id customer_id
    from public.customer_profiles profile
    where p_after_updated_at is null or (profile.updated_at, profile.id) > (p_after_updated_at, p_after_id)
    order by profile.updated_at, profile.id limit p_limit + 1
  ), batch as (select * from page order by updated_at, id limit p_limit)
  select coalesce((select pg_catalog.jsonb_agg(customer_id order by customer_id) from (select distinct customer_id from batch) ids), '[]'::jsonb),
    (select count(*) from batch), (select count(*) > p_limit from page),
    (select updated_at from batch order by updated_at desc, id desc limit 1),
    (select id from batch order by updated_at desc, id desc limit 1)
  into v_ids, v_count, v_more, v_next_at, v_next_id;
  return pg_catalog.jsonb_build_object('ok', true, 'customerIds', v_ids, 'customerCount', pg_catalog.jsonb_array_length(v_ids),
    'sourceRowCount', v_count, 'nextWatermarkUpdatedAt', v_next_at,
    'nextWatermarkTiebreaker', v_next_id::text, 'hasMore', v_more);
end; $$;

create or replace function public.customer_window_commit_profile_metrics_incremental_watermark_m2m(
  p_stream_key text, p_expected_updated_at timestamptz, p_expected_tiebreaker text,
  p_next_updated_at timestamptz, p_next_tiebreaker text, p_processed_rows integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state public.customer_profile_metrics_incremental_state%rowtype; v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_stream_key not in ('booking_links', 'okp', 'mcp_eap', 'customer_profiles')
    or p_expected_updated_at is null or p_expected_tiebreaker is null
    or p_next_updated_at is null or p_next_tiebreaker is null or p_processed_rows is null or p_processed_rows < 1 then
    raise exception 'Invalid incremental watermark commit' using errcode = '22023'; end if;
  begin
    if p_stream_key in ('okp', 'mcp_eap') then
      perform p_expected_tiebreaker::bigint; perform p_next_tiebreaker::bigint;
    else
      perform p_expected_tiebreaker::uuid; perform p_next_tiebreaker::uuid;
    end if;
  exception when invalid_text_representation then
    raise exception 'Invalid incremental watermark tiebreaker' using errcode = '22023';
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('customer_profile_metrics_incremental:' || p_stream_key, 0));
  select * into v_state from public.customer_profile_metrics_incremental_state where stream_key = p_stream_key for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'stream_not_found'); end if;
  if v_state.status = 'uninitialized' then return pg_catalog.jsonb_build_object('ok', false, 'code', 'stream_not_initialized'); end if;
  if v_state.watermark_updated_at is distinct from p_expected_updated_at
    or v_state.watermark_tiebreaker is distinct from p_expected_tiebreaker then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'watermark_conflict'); end if;
  if p_next_updated_at < v_state.watermark_updated_at
    or (p_next_updated_at = v_state.watermark_updated_at and (
      (p_stream_key in ('okp', 'mcp_eap') and p_next_tiebreaker::bigint <= v_state.watermark_tiebreaker::bigint)
      or (p_stream_key in ('booking_links', 'customer_profiles') and p_next_tiebreaker::uuid <= v_state.watermark_tiebreaker::uuid)
    )) then
    return pg_catalog.jsonb_build_object('ok', false, 'code', 'watermark_not_advanced'); end if;
  update public.customer_profile_metrics_incremental_state set
    watermark_updated_at = p_next_updated_at, watermark_tiebreaker = p_next_tiebreaker,
    status = 'ready', processed_rows = processed_rows + p_processed_rows,
    last_batch_count = p_processed_rows, last_succeeded_at = v_now, last_error = null, updated_at = v_now
  where stream_key = p_stream_key and watermark_updated_at is not distinct from p_expected_updated_at
    and watermark_tiebreaker is not distinct from p_expected_tiebreaker;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'code', 'watermark_conflict'); end if;
  return pg_catalog.jsonb_build_object('ok', true, 'code', 'watermark_committed', 'streamKey', p_stream_key,
    'watermarkUpdatedAt', p_next_updated_at, 'watermarkTiebreaker', p_next_tiebreaker,
    'processedRows', v_state.processed_rows + p_processed_rows);
end; $$;

revoke all on function public.customer_window_get_profile_metrics_incremental_state_m2m() from public, anon, authenticated, service_role;
revoke all on function public.customer_window_initialize_profile_metrics_incremental_watermark_m2m(text, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_get_profile_metrics_booking_link_changes_m2m(timestamptz, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_get_profile_metrics_okp_changes_m2m(timestamptz, bigint, integer) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_get_profile_metrics_mcp_eap_changes_m2m(timestamptz, bigint, integer) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_get_profile_metrics_customer_profile_changes_m2m(timestamptz, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.customer_window_commit_profile_metrics_incremental_watermark_m2m(text, timestamptz, text, timestamptz, text, integer) from public, anon, authenticated, service_role;

grant execute on function public.customer_window_get_profile_metrics_incremental_state_m2m() to service_role;
grant execute on function public.customer_window_initialize_profile_metrics_incremental_watermark_m2m(text, timestamptz, text) to service_role;
grant execute on function public.customer_window_get_profile_metrics_booking_link_changes_m2m(timestamptz, uuid, integer) to service_role;
grant execute on function public.customer_window_get_profile_metrics_okp_changes_m2m(timestamptz, bigint, integer) to service_role;
grant execute on function public.customer_window_get_profile_metrics_mcp_eap_changes_m2m(timestamptz, bigint, integer) to service_role;
grant execute on function public.customer_window_get_profile_metrics_customer_profile_changes_m2m(timestamptz, uuid, integer) to service_role;
grant execute on function public.customer_window_commit_profile_metrics_incremental_watermark_m2m(text, timestamptz, text, timestamptz, text, integer) to service_role;

commit;
