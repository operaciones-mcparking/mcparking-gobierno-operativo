-- Reversible lifecycle harness. Run as a role allowed to alter the snapshot table.
begin;

set local lock_timeout = '3s';
set local statement_timeout = '45s';
set local idle_in_transaction_session_timeout = '60s';

create temp table rr_snapshot_lifecycle_active_before on commit drop as
select snapshot_id, status, activated_at, updated_at
from public.customer_related_review_snapshots
where rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
  and status = 'active';

-- BEGIN EMBEDDED MIGRATION BODY
alter table public.customer_related_review_snapshots
  add column superseded_at timestamptz;

alter table public.customer_related_review_snapshots
  drop constraint customer_related_review_snapshots_status_check;

alter table public.customer_related_review_snapshots
  add constraint customer_related_review_snapshots_status_check
    check (status in ('building', 'ready', 'active', 'superseded', 'failed'));

alter table public.customer_related_review_snapshots
  drop constraint customer_related_review_snapshots_ready_check;

alter table public.customer_related_review_snapshots
  add constraint customer_related_review_snapshots_ready_check
    check (
      status not in ('ready', 'active', 'superseded') or (
        built_at is not null and manifest_sha256 is not null
        and valid_source_count is not null and confirmed_count is not null
        and related_count is not null and group_count is not null
        and anomaly_count = 0
        and active_profiles_without_metrics_count is not null
        and active_profiles_without_metrics_count = 0
        and valid_source_count = confirmed_count + related_count
      )
    );

alter table public.customer_related_review_snapshots
  add constraint customer_related_review_snapshots_lifecycle_timestamps_check
    check (
      (status = 'superseded'
        and activated_at is not null
        and superseded_at is not null
        and superseded_at >= activated_at)
      or (status <> 'superseded' and superseded_at is null)
    );

comment on column public.customer_related_review_snapshots.superseded_at is
  'Timestamp at which a previously active snapshot was atomically replaced. activated_at remains the original publication time.';
-- END EMBEDDED MIGRATION BODY

do $test$
declare
  v_status_check text;
  v_ready_check text;
  v_lifecycle_check text;
  v_active_index_ok boolean;
begin
  select pg_catalog.pg_get_constraintdef(constraint_row.oid)
  into v_status_check
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.customer_related_review_snapshots'::regclass
    and constraint_row.conname = 'customer_related_review_snapshots_status_check';

  select pg_catalog.pg_get_constraintdef(constraint_row.oid)
  into v_ready_check
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.customer_related_review_snapshots'::regclass
    and constraint_row.conname = 'customer_related_review_snapshots_ready_check';

  select pg_catalog.pg_get_constraintdef(constraint_row.oid)
  into v_lifecycle_check
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.customer_related_review_snapshots'::regclass
    and constraint_row.conname = 'customer_related_review_snapshots_lifecycle_timestamps_check';

  select index_row.indisunique
    and index_row.indisvalid
    and index_row.indisready
    and pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid) = '(status = ''active''::text)'
  into v_active_index_ok
  from pg_catalog.pg_index index_row
  join pg_catalog.pg_class index_class on index_class.oid = index_row.indexrelid
  where index_class.relname = 'customer_related_review_snapshots_one_active_idx'
    and index_row.indrelid = 'public.customer_related_review_snapshots'::regclass;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_related_review_snapshots'
      and column_name = 'superseded_at'
      and data_type = 'timestamp with time zone'
      and is_nullable = 'YES'
  ) or v_status_check not like '%superseded%'
    or v_ready_check not like '%superseded%'
    or v_lifecycle_check not like '%superseded_at%'
    or v_active_index_ok is distinct from true then
    raise exception 'Snapshot lifecycle catalog contract failed';
  end if;
end
$test$;

insert into public.customer_related_review_snapshots (
  snapshot_id, rule_key, key_id, status, captured_at, built_at, activated_at,
  superseded_at, manifest_sha256, valid_source_count, confirmed_count,
  related_count, group_count, anomaly_count, active_profiles_without_metrics_count
) values (
  '00000000-0000-4000-8000-000000000922',
  'RELATED_REVIEW_MCP_EAP_V1', 'reversible-lifecycle-test', 'superseded',
  '2026-09-22 00:00:00+00', '2026-09-22 00:01:00+00',
  '2026-09-22 00:02:00+00', '2026-09-22 00:03:00+00', repeat('a', 64),
  2, 1, 1, 1, 0, 0
);

do $test$
begin
  if not exists (
    select 1 from public.customer_related_review_snapshots
    where snapshot_id = '00000000-0000-4000-8000-000000000922'
      and status = 'superseded'
      and activated_at is not null
      and superseded_at is not null
  ) then
    raise exception 'Superseded fixture was not accepted';
  end if;

  begin
    insert into public.customer_related_review_snapshots (
      snapshot_id, rule_key, key_id, status, captured_at, built_at, activated_at,
      manifest_sha256, valid_source_count, confirmed_count, related_count,
      group_count, anomaly_count, active_profiles_without_metrics_count
    ) values (
      '00000000-0000-4000-8000-000000000923',
      'RELATED_REVIEW_MCP_EAP_V1', 'invalid-lifecycle-test', 'superseded',
      now(), now(), now(), repeat('b', 64), 1, 1, 0, 0, 0, 0
    );
    raise exception 'Superseded snapshot without superseded_at unexpectedly inserted';
  exception when check_violation then null;
  end;

  if exists (
    (select snapshot_id, status, activated_at, updated_at
     from rr_snapshot_lifecycle_active_before
     except
     select snapshot_id, status, activated_at, updated_at
     from public.customer_related_review_snapshots
     where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active')
    union all
    (select snapshot_id, status, activated_at, updated_at
     from public.customer_related_review_snapshots
     where rule_key = 'RELATED_REVIEW_MCP_EAP_V1' and status = 'active'
     except
     select snapshot_id, status, activated_at, updated_at
     from rr_snapshot_lifecycle_active_before)
  ) then
    raise exception 'Existing active snapshot changed during lifecycle harness';
  end if;
end
$test$;

select
  true as superseded_status_accepted,
  true as lifecycle_constraints_ok,
  true as one_active_unique_index_ok,
  true as existing_active_unchanged;

rollback;

do $postcheck$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_related_review_snapshots'
      and column_name = 'superseded_at'
  ) or exists (
    select 1 from public.customer_related_review_snapshots
    where snapshot_id in (
      '00000000-0000-4000-8000-000000000922',
      '00000000-0000-4000-8000-000000000923'
    )
  ) then
    raise exception 'Reversible lifecycle cleanup failed';
  end if;
end
$postcheck$;

select
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_related_review_snapshots'
      and column_name = 'superseded_at'
  ) as lifecycle_schema_rolled_back,
  not exists (
    select 1 from public.customer_related_review_snapshots
    where snapshot_id in (
      '00000000-0000-4000-8000-000000000922',
      '00000000-0000-4000-8000-000000000923'
    )
  ) as lifecycle_fixtures_rolled_back;
