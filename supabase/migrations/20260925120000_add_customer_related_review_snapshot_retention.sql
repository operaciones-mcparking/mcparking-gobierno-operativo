begin;

create or replace function public.customer_related_review_prune_superseded_v1_m2m()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_lock_acquired boolean;
  v_active_count integer;
  v_ready_count integer;
  v_building_count integer;
  v_active_snapshot_id uuid;
  v_candidate_snapshot_id uuid;
  v_locked_candidate_id uuid;
  v_deleted_snapshot_id uuid;
  v_deleted_count integer := 0;
  v_remaining integer := 0;
  v_post_active_count integer;
  v_post_ready_count integer;
  v_post_building_count integer;
  v_post_active_snapshot_id uuid;
begin
  perform pg_catalog.set_config('lock_timeout', '3s', true);

  select pg_catalog.pg_try_advisory_xact_lock(181923741, 1)
  into v_lock_acquired;
  if v_lock_acquired is distinct from true then
    raise exception 'Related Review retention lock is unavailable'
      using errcode = '55P03';
  end if;

  select
    count(*) filter (where snapshot.status = 'active')::integer,
    count(*) filter (where snapshot.status = 'ready')::integer,
    count(*) filter (where snapshot.status = 'building')::integer
  into v_active_count, v_ready_count, v_building_count
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1';

  if v_active_count <> 1 or v_ready_count <> 0 or v_building_count <> 0 then
    raise exception 'Related Review retention lifecycle contract failed'
      using errcode = '40001';
  end if;

  select snapshot.snapshot_id
  into strict v_active_snapshot_id
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and snapshot.status = 'active'
  for update;

  with ranked as materialized (
    select snapshot.snapshot_id, snapshot.created_at,
      row_number() over (
        order by snapshot.created_at desc, snapshot.snapshot_id desc
      ) as retention_rank
    from public.customer_related_review_snapshots snapshot
    where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
      and snapshot.status = 'superseded'
  )
  select ranked.snapshot_id
  into v_candidate_snapshot_id
  from ranked
  where ranked.retention_rank > 5
  order by ranked.created_at asc, ranked.snapshot_id asc
  limit 1;

  if v_candidate_snapshot_id is not null then
    select snapshot.snapshot_id
    into v_locked_candidate_id
    from public.customer_related_review_snapshots snapshot
    where snapshot.snapshot_id = v_candidate_snapshot_id
      and snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
      and snapshot.status = 'superseded'
      and snapshot.snapshot_id <> v_active_snapshot_id
    for update;

    if v_locked_candidate_id is not null then
      delete from public.customer_related_review_snapshots snapshot
      where snapshot.snapshot_id = v_locked_candidate_id
        and snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
        and snapshot.status = 'superseded'
        and snapshot.snapshot_id <> v_active_snapshot_id
      returning snapshot.snapshot_id into v_deleted_snapshot_id;
      get diagnostics v_deleted_count = row_count;
    end if;
  end if;

  if v_deleted_count not in (0, 1) then
    raise exception 'Related Review retention deleted an invalid number of snapshots'
      using errcode = '40001';
  end if;

  select
    count(*) filter (where snapshot.status = 'active')::integer,
    count(*) filter (where snapshot.status = 'ready')::integer,
    count(*) filter (where snapshot.status = 'building')::integer,
    (pg_catalog.array_agg(snapshot.snapshot_id order by snapshot.snapshot_id)
      filter (where snapshot.status = 'active'))[1]
  into v_post_active_count, v_post_ready_count, v_post_building_count,
    v_post_active_snapshot_id
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1';

  if v_post_active_count <> 1
    or v_post_active_snapshot_id is distinct from v_active_snapshot_id
    or v_post_ready_count <> 0
    or v_post_building_count <> 0 then
    raise exception 'Related Review retention postcondition failed'
      using errcode = '40001';
  end if;

  select greatest(count(*)::integer - 5, 0)
  into v_remaining
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and snapshot.status = 'superseded';

  return jsonb_build_object(
    'ok', true,
    'deleted', v_deleted_count,
    'deletedSnapshotId', v_deleted_snapshot_id,
    'remainingSupersededBeyondRetention', v_remaining,
    'activeSnapshotId', v_active_snapshot_id,
    'containsPii', false
  );
end;
$function$;

revoke all on function public.customer_related_review_prune_superseded_v1_m2m()
  from public, anon, authenticated, service_role;
grant execute on function public.customer_related_review_prune_superseded_v1_m2m()
  to customer_related_review_builder;

comment on function public.customer_related_review_prune_superseded_v1_m2m() is
  'Deletes at most one superseded RELATED_REVIEW_MCP_EAP_V1 snapshot beyond the five newest. Intended only after a fully successful refresh.';

commit;
