-- Self-contained PostgreSQL harness. All schema, role, fixture, and function changes roll back.
begin;

set local statement_timeout = '2min';
set local lock_timeout = '3s';

do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'customer_related_review_builder'
  ) then
    create role customer_related_review_builder nologin;
  end if;
end
$roles$;

create table public.customer_related_review_snapshots (
  snapshot_id uuid primary key,
  rule_key text not null,
  key_id text not null,
  status text not null,
  captured_at timestamptz not null,
  built_at timestamptz,
  activated_at timestamptz,
  superseded_at timestamptz,
  manifest_sha256 text,
  valid_source_count bigint,
  confirmed_count bigint,
  related_count bigint,
  group_count bigint,
  anomaly_count bigint,
  active_profiles_without_metrics_count bigint,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint rr_retention_status_check
    check (status in ('building', 'ready', 'active', 'superseded', 'failed'))
);
create unique index rr_retention_one_active_idx
  on public.customer_related_review_snapshots(rule_key) where status = 'active';

create table public.customer_related_review_groups (
  snapshot_id uuid not null references public.customer_related_review_snapshots(snapshot_id)
    on delete cascade,
  group_id text not null,
  primary key (snapshot_id, group_id)
);
create table public.customer_related_review_members (
  snapshot_id uuid not null,
  group_id text not null,
  member_key bigint not null,
  primary key (snapshot_id, member_key),
  foreign key (snapshot_id, group_id)
    references public.customer_related_review_groups(snapshot_id, group_id) on delete cascade
);
create table public.customer_analytical_booking_assignments (
  snapshot_id uuid not null references public.customer_related_review_snapshots(snapshot_id)
    on delete cascade,
  assignment_key bigint not null,
  related_group_id text,
  primary key (snapshot_id, assignment_key),
  foreign key (snapshot_id, related_group_id)
    references public.customer_related_review_groups(snapshot_id, group_id)
);
create table public.customer_related_review_metrics (
  snapshot_id uuid not null,
  group_id text not null,
  total_reservations bigint not null,
  primary key (snapshot_id, group_id),
  foreign key (snapshot_id, group_id)
    references public.customer_related_review_groups(snapshot_id, group_id) on delete cascade
);

-- BEGIN EMBEDDED MIGRATION BODY
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
-- END EMBEDDED MIGRATION BODY

insert into public.customer_related_review_snapshots (
  snapshot_id, rule_key, key_id, status, captured_at, built_at, activated_at,
  superseded_at, manifest_sha256, valid_source_count, confirmed_count, related_count,
  group_count, anomaly_count, active_profiles_without_metrics_count, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000009', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'active', now(), now(), now(), null, repeat('a',64), 1,1,0,0,0,0,
   '2026-09-09 00:00:00+00', now()),
  ('10000000-0000-4000-8000-000000000001', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'superseded', now(), now(), now(), now(), repeat('a',64), 1,0,1,1,0,0,
   '2026-09-01 00:00:00+00', now()),
  ('10000000-0000-4000-8000-000000000002', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'superseded', now(), now(), now(), now(), repeat('a',64), 1,0,1,1,0,0,
   '2026-09-02 00:00:00+00', now()),
  ('10000000-0000-4000-8000-000000000003', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'superseded', now(), now(), now(), now(), repeat('a',64), 1,0,1,1,0,0,
   '2026-09-03 00:00:00+00', now()),
  ('10000000-0000-4000-8000-000000000004', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'superseded', now(), now(), now(), now(), repeat('a',64), 1,0,1,1,0,0,
   '2026-09-04 00:00:00+00', now()),
  ('10000000-0000-4000-8000-000000000005', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'superseded', now(), now(), now(), now(), repeat('a',64), 1,0,1,1,0,0,
   '2026-09-05 00:00:00+00', now()),
  ('10000000-0000-4000-8000-000000000006', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'superseded', now(), now(), now(), now(), repeat('a',64), 1,0,1,1,0,0,
   '2026-09-06 00:00:00+00', now()),
  ('10000000-0000-4000-8000-000000000007', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'superseded', now(), now(), now(), now(), repeat('a',64), 1,0,1,1,0,0,
   '2026-09-07 00:00:00+00', now()),
  ('10000000-0000-4000-8000-000000000008', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'superseded', now(), now(), now(), now(), repeat('a',64), 1,0,1,1,0,0,
   '2026-09-08 00:00:00+00', now());

insert into public.customer_related_review_groups values
  ('10000000-0000-4000-8000-000000000001', repeat('1',64));
insert into public.customer_related_review_members values
  ('10000000-0000-4000-8000-000000000001', repeat('1',64), 1);
insert into public.customer_analytical_booking_assignments values
  ('10000000-0000-4000-8000-000000000001', 1, repeat('1',64));
insert into public.customer_related_review_metrics values
  ('10000000-0000-4000-8000-000000000001', repeat('1',64), 1);

select
  array_agg(snapshot_id order by created_at desc, snapshot_id desc)
    filter (where retention_rank <= 5) as retained_superseded,
  (array_agg(snapshot_id order by created_at asc, snapshot_id asc)
    filter (where retention_rank > 5))[1] as selected_candidate,
  bool_and(status = 'superseded') filter (where retention_rank > 5) as candidates_superseded
from (
  select snapshot_id, status, created_at,
    row_number() over (order by created_at desc, snapshot_id desc) as retention_rank
  from public.customer_related_review_snapshots
  where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'superseded'
) preview;

create temp table rr_retention_results (
  attempt integer primary key,
  result jsonb not null
) on commit drop;

insert into rr_retention_results values
  (1, public.customer_related_review_prune_superseded_v1_m2m()),
  (2, public.customer_related_review_prune_superseded_v1_m2m()),
  (3, public.customer_related_review_prune_superseded_v1_m2m()),
  (4, public.customer_related_review_prune_superseded_v1_m2m());

do $test$
begin
  if (select result ->> 'deletedSnapshotId' from rr_retention_results where attempt = 1)
      <> '10000000-0000-4000-8000-000000000001'
    or (select result ->> 'deletedSnapshotId' from rr_retention_results where attempt = 2)
      <> '10000000-0000-4000-8000-000000000002'
    or (select result ->> 'deletedSnapshotId' from rr_retention_results where attempt = 3)
      <> '10000000-0000-4000-8000-000000000003'
    or (select (result ->> 'deleted')::integer from rr_retention_results where attempt = 4) <> 0
    or (select count(*) from public.customer_related_review_snapshots
        where status = 'superseded') <> 5
    or not exists (select 1 from public.customer_related_review_snapshots
        where snapshot_id = '10000000-0000-4000-8000-000000000009' and status = 'active') then
    raise exception 'Retention order or 1+5 contract failed';
  end if;

  if exists (select 1 from public.customer_related_review_groups
      where snapshot_id = '10000000-0000-4000-8000-000000000001')
    or exists (select 1 from public.customer_related_review_members
      where snapshot_id = '10000000-0000-4000-8000-000000000001')
    or exists (select 1 from public.customer_analytical_booking_assignments
      where snapshot_id = '10000000-0000-4000-8000-000000000001')
    or exists (select 1 from public.customer_related_review_metrics
      where snapshot_id = '10000000-0000-4000-8000-000000000001') then
    raise exception 'Retention cascade failed';
  end if;
end
$test$;

insert into public.customer_related_review_snapshots values
  ('20000000-0000-4000-8000-000000000001', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'ready', now(), now(), null, null, repeat('b',64), 1,1,0,0,0,0, now(), now());
do $test$
begin
  begin
    perform public.customer_related_review_prune_superseded_v1_m2m();
    raise exception 'Ready snapshot did not block retention';
  exception when serialization_failure then null;
  end;
end
$test$;
delete from public.customer_related_review_snapshots
where snapshot_id = '20000000-0000-4000-8000-000000000001';

insert into public.customer_related_review_snapshots values
  ('20000000-0000-4000-8000-000000000002', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'building', now(), null, null, null, null, null,null,null,null,null,null, now(), now());
do $test$
begin
  begin
    perform public.customer_related_review_prune_superseded_v1_m2m();
    raise exception 'Building snapshot did not block retention';
  exception when serialization_failure then null;
  end;
end
$test$;
delete from public.customer_related_review_snapshots
where snapshot_id = '20000000-0000-4000-8000-000000000002';

update public.customer_related_review_snapshots
set status = 'failed'
where snapshot_id = '10000000-0000-4000-8000-000000000009';
do $test$
begin
  begin
    perform public.customer_related_review_prune_superseded_v1_m2m();
    raise exception 'Missing active snapshot did not block retention';
  exception when serialization_failure then null;
  end;
end
$test$;
update public.customer_related_review_snapshots
set status = 'active'
where snapshot_id = '10000000-0000-4000-8000-000000000009';

insert into public.customer_related_review_snapshots values
  ('30000000-0000-4000-8000-000000000001', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'superseded', now(), now(), now(), now(), repeat('c',64), 1,0,1,1,0,0,
   '2026-08-01 00:00:00+00', now()),
  ('30000000-0000-4000-8000-000000000002', 'RELATED_REVIEW_MCP_EAP_V1', 'test',
   'superseded', now(), now(), now(), now(), repeat('c',64), 1,0,1,1,0,0,
   '2026-08-02 00:00:00+00', now());
create temp table rr_retention_changed_candidate on commit drop as
select snapshot_id
from public.customer_related_review_snapshots
where status = 'superseded'
order by created_at asc, snapshot_id asc
limit 1;
update public.customer_related_review_snapshots
set status = 'failed', superseded_at = null
where snapshot_id = (select snapshot_id from rr_retention_changed_candidate);
select public.customer_related_review_prune_superseded_v1_m2m() as changed_candidate_result;

do $test$
begin
  if not exists (
    select 1
    from public.customer_related_review_snapshots snapshot
    join rr_retention_changed_candidate candidate using (snapshot_id)
    where snapshot.status = 'failed'
  ) then
    raise exception 'Changed retention candidate was deleted';
  end if;
end
$test$;

select
  true as active_preserved,
  true as five_superseded_retained,
  true as one_delete_per_call,
  true as lifecycle_fail_closed,
  true as candidate_revalidated,
  true as cascades_ok;

rollback;

do $postcheck$
begin
  if pg_catalog.to_regclass('public.customer_related_review_snapshots') is not null
    or pg_catalog.to_regclass('public.customer_related_review_groups') is not null
    or pg_catalog.to_regclass('public.customer_related_review_members') is not null
    or pg_catalog.to_regclass('public.customer_analytical_booking_assignments') is not null
    or pg_catalog.to_regclass('public.customer_related_review_metrics') is not null
    or pg_catalog.to_regprocedure(
      'public.customer_related_review_prune_superseded_v1_m2m()') is not null then
    raise exception 'Retention reversible cleanup failed';
  end if;
end
$postcheck$;

select
  pg_catalog.to_regclass('public.customer_related_review_snapshots') is null
    as tables_absent_after_rollback,
  pg_catalog.to_regprocedure(
    'public.customer_related_review_prune_superseded_v1_m2m()') is null
    as retention_rpc_absent_after_rollback;
