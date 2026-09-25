-- Reversible schema-only harness. Run as migration owner in one session.
-- If a statement fails and the editor stops, issue ROLLBACK manually.
-- No production source/identity rows are inserted or modified.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '45s';
set local idle_in_transaction_session_timeout = '60s';

-- BEGIN EMBEDDED MIGRATION BODY
create table public.customer_related_review_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  rule_key text not null,
  key_id text not null,
  status text not null default 'building',
  captured_at timestamptz not null default now(),
  built_at timestamptz,
  activated_at timestamptz,
  manifest_sha256 text,
  valid_source_count bigint,
  confirmed_count bigint,
  related_count bigint,
  group_count bigint,
  anomaly_count bigint,
  active_profiles_without_metrics_count bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_related_review_snapshots_rule_check
    check (rule_key = 'RELATED_REVIEW_MCP_EAP_V1'),
  constraint customer_related_review_snapshots_key_check
    check (length(btrim(key_id)) > 0),
  constraint customer_related_review_snapshots_status_check
    check (status in ('building', 'ready', 'active', 'failed')),
  constraint customer_related_review_snapshots_hash_check
    check (manifest_sha256 is null or manifest_sha256 ~ '^[0-9a-f]{64}$'),
  constraint customer_related_review_snapshots_counts_check
    check (
      (valid_source_count is null or valid_source_count >= 0)
      and (confirmed_count is null or confirmed_count >= 0)
      and (related_count is null or related_count >= 0)
      and (group_count is null or group_count >= 0)
      and (anomaly_count is null or anomaly_count >= 0)
      and (active_profiles_without_metrics_count is null
        or active_profiles_without_metrics_count >= 0)
    ),
  constraint customer_related_review_snapshots_ready_check
    check (
      status not in ('ready', 'active') or (
        built_at is not null and manifest_sha256 is not null
        and valid_source_count is not null and confirmed_count is not null
        and related_count is not null and group_count is not null
        and anomaly_count = 0
        and active_profiles_without_metrics_count is not null
        and active_profiles_without_metrics_count = 0
        and valid_source_count = confirmed_count + related_count
      )
    )
);

create unique index customer_related_review_snapshots_one_active_idx
  on public.customer_related_review_snapshots(rule_key)
  where status = 'active';
create index customer_related_review_snapshots_rule_created_idx
  on public.customer_related_review_snapshots(rule_key, created_at desc);

create table public.customer_related_review_groups (
  snapshot_id uuid not null references public.customer_related_review_snapshots(snapshot_id)
    on delete cascade,
  group_id text not null,
  key_kind text not null,
  booking_count integer not null,
  profile_count integer not null,
  email_count integer not null,
  phone_count integer not null,
  source_customer_count integer not null,
  conflict_count integer not null,
  candidate_count integer not null,
  v1_booking_count integer not null,
  v2_booking_count integer not null,
  has_exact_email_phone_corroboration boolean not null,
  has_source_customer_email_corroboration boolean not null,
  constraint customer_related_review_groups_pkey primary key (snapshot_id, group_id),
  constraint customer_related_review_groups_id_check
    check (group_id ~ '^[0-9a-f]{64}$'),
  constraint customer_related_review_groups_kind_check
    check (key_kind in ('EXACT_EMAIL', 'NO_EMAIL_SOURCE_ROW')),
  constraint customer_related_review_groups_counts_check
    check (
      booking_count >= 1 and profile_count >= 1 and profile_count <= booking_count
      and phone_count >= 0 and source_customer_count >= 0
      and conflict_count >= 0 and candidate_count >= 0
      and conflict_count + candidate_count = booking_count
      and v1_booking_count >= 0 and v2_booking_count >= 0
      and v1_booking_count + v2_booking_count <= booking_count
    ),
  constraint customer_related_review_groups_email_check
    check (
      (key_kind = 'EXACT_EMAIL' and email_count = 1)
      or (key_kind = 'NO_EMAIL_SOURCE_ROW' and email_count = 0 and booking_count = 1)
    )
);

create index customer_related_review_groups_kind_idx
  on public.customer_related_review_groups(snapshot_id, key_kind);

create table public.customer_related_review_members (
  snapshot_id uuid not null,
  source text not null,
  source_row_id bigint not null,
  group_id text not null,
  booking_link_id uuid not null references public.customer_booking_profile_links(id),
  profile_id uuid not null references public.customer_profiles(id),
  link_status text not null,
  resolver_version text not null,
  relationship_type text not null,
  reason_code text,
  constraint customer_related_review_members_pkey
    primary key (snapshot_id, source, source_row_id),
  constraint customer_related_review_members_link_unique
    unique (snapshot_id, booking_link_id),
  constraint customer_related_review_members_group_fkey
    foreign key (snapshot_id, group_id)
    references public.customer_related_review_groups(snapshot_id, group_id)
    on delete cascade,
  constraint customer_related_review_members_source_fkey
    foreign key (source, source_row_id)
    references public.customer_source_bookings_mcp_eap(source, source_row_id),
  constraint customer_related_review_members_source_check
    check (source = 'MCP_EAP' and source_row_id > 0),
  constraint customer_related_review_members_status_check
    check (link_status in ('conflict', 'candidate')),
  constraint customer_related_review_members_type_check
    check (relationship_type in ('EXACT_EMAIL', 'NO_EMAIL_SOURCE_ROW')),
  constraint customer_related_review_members_resolver_check
    check (length(btrim(resolver_version)) > 0),
  constraint customer_related_review_members_reason_check
    check (reason_code is null or length(btrim(reason_code)) > 0)
);

create index customer_related_review_members_group_idx
  on public.customer_related_review_members(snapshot_id, group_id);
create index customer_related_review_members_profile_idx
  on public.customer_related_review_members(snapshot_id, profile_id);

create table public.customer_analytical_booking_assignments (
  snapshot_id uuid not null references public.customer_related_review_snapshots(snapshot_id)
    on delete cascade,
  source text not null,
  source_row_id bigint not null,
  booking_link_id uuid not null references public.customer_booking_profile_links(id),
  representation_type text not null,
  customer_id uuid references public.customer_profiles(id),
  related_group_id text,
  constraint customer_analytical_booking_assignments_pkey
    primary key (snapshot_id, source, source_row_id),
  constraint customer_analytical_booking_assignments_link_unique
    unique (snapshot_id, booking_link_id),
  constraint customer_analytical_booking_assignments_source_fkey
    foreign key (source, source_row_id)
    references public.customer_source_bookings_mcp_eap(source, source_row_id),
  constraint customer_analytical_booking_assignments_group_fkey
    foreign key (snapshot_id, related_group_id)
    references public.customer_related_review_groups(snapshot_id, group_id),
  constraint customer_analytical_booking_assignments_source_check
    check (source = 'MCP_EAP' and source_row_id > 0),
  constraint customer_analytical_booking_assignments_representation_check
    check (
      (representation_type = 'confirmed_customer'
        and customer_id is not null and related_group_id is null)
      or (representation_type = 'related_review'
        and related_group_id is not null and customer_id is null)
    )
);

create index customer_analytical_booking_assignments_customer_idx
  on public.customer_analytical_booking_assignments(
    snapshot_id, representation_type, customer_id);
create index customer_analytical_booking_assignments_group_idx
  on public.customer_analytical_booking_assignments(snapshot_id, related_group_id);

create table public.customer_related_review_metrics (
  snapshot_id uuid not null,
  group_id text not null,
  total_reservations bigint not null,
  first_purchase_at timestamp without time zone not null,
  last_purchase_at timestamp without time zone not null,
  computed_at timestamptz not null default now(),
  constraint customer_related_review_metrics_pkey primary key (snapshot_id, group_id),
  constraint customer_related_review_metrics_group_fkey
    foreign key (snapshot_id, group_id)
    references public.customer_related_review_groups(snapshot_id, group_id)
    on delete cascade,
  constraint customer_related_review_metrics_count_check
    check (total_reservations >= 1),
  constraint customer_related_review_metrics_dates_check
    check (first_purchase_at <= last_purchase_at)
);

alter table public.customer_related_review_snapshots enable row level security;
alter table public.customer_related_review_groups enable row level security;
alter table public.customer_related_review_members enable row level security;
alter table public.customer_analytical_booking_assignments enable row level security;
alter table public.customer_related_review_metrics enable row level security;

-- service_role remains revoked until the future builder is authorized separately.
revoke all on table public.customer_related_review_snapshots from public, anon, authenticated, service_role;
revoke all on table public.customer_related_review_groups from public, anon, authenticated, service_role;
revoke all on table public.customer_related_review_members from public, anon, authenticated, service_role;
revoke all on table public.customer_analytical_booking_assignments from public, anon, authenticated, service_role;
revoke all on table public.customer_related_review_metrics from public, anon, authenticated, service_role;

comment on table public.customer_related_review_snapshots is
  'Private, rebuildable MCP/EAP related-review snapshot metadata. No identity assertion.';
comment on table public.customer_related_review_groups is
  'Private, derived exact-email relation groups. No raw identity values.';
comment on table public.customer_related_review_members is
  'Private, derived pending-booking membership; never a profile merge.';
comment on table public.customer_analytical_booking_assignments is
  'Private, exclusive analytical representation per MCP/EAP booking and snapshot.';
comment on table public.customer_related_review_metrics is
  'Private metrics derived from related-review members, not customer_profile_metrics.';
-- END EMBEDDED MIGRATION BODY

-- Raw catalog inventory: column types/nullability, constraints, indexes, RLS, owner and ACL.
with expected(name) as (
  values ('customer_related_review_snapshots'),
    ('customer_related_review_groups'),
    ('customer_related_review_members'),
    ('customer_analytical_booking_assignments'),
    ('customer_related_review_metrics')
)
select expected.name as table_name, c.oid is not null as table_exists,
  pg_catalog.pg_get_userbyid(c.relowner) as owner_name,
  c.relrowsecurity as rls_enabled,
  coalesce((
    select pg_catalog.jsonb_object_agg(a.attname,
      pg_catalog.jsonb_build_object(
        'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull))
    from pg_catalog.pg_attribute a
    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  ), '{}'::jsonb) as columns_and_types,
  coalesce((
    select pg_catalog.jsonb_object_agg(k.conname, pg_catalog.pg_get_constraintdef(k.oid))
    from pg_catalog.pg_constraint k where k.conrelid = c.oid
  ), '{}'::jsonb) as constraints,
  coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(i.indexrelid)
      order by i.indexrelid)
    from pg_catalog.pg_index i where i.indrelid = c.oid
  ), '[]'::jsonb) as indexes,
  not exists (
    select 1
    from pg_catalog.aclexplode(coalesce(
      c.relacl, pg_catalog.acldefault('r', c.relowner))) acl
    where acl.grantee = 0
  ) as public_revoked,
  not pg_catalog.has_table_privilege('anon', c.oid,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    as anon_privileges_revoked,
  not pg_catalog.has_table_privilege('authenticated', c.oid,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    as authenticated_privileges_revoked,
  not pg_catalog.has_table_privilege('service_role', c.oid,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    as service_role_grants_deferred
from expected
left join pg_catalog.pg_class c
  on c.oid = pg_catalog.to_regclass('public.' || expected.name)
order by expected.name;

-- Selected type and nullability contract.
with expected(table_name, column_name, data_type, not_null) as (
  values
    ('customer_related_review_snapshots', 'snapshot_id', 'uuid', true),
    ('customer_related_review_snapshots', 'status', 'text', true),
    ('customer_related_review_snapshots', 'manifest_sha256', 'text', false),
    ('customer_related_review_groups', 'snapshot_id', 'uuid', true),
    ('customer_related_review_groups', 'group_id', 'text', true),
    ('customer_related_review_members', 'source_row_id', 'bigint', true),
    ('customer_related_review_members', 'booking_link_id', 'uuid', true),
    ('customer_related_review_members', 'profile_id', 'uuid', true),
    ('customer_analytical_booking_assignments', 'source_row_id', 'bigint', true),
    ('customer_analytical_booking_assignments', 'customer_id', 'uuid', false),
    ('customer_analytical_booking_assignments', 'related_group_id', 'text', false),
    ('customer_related_review_metrics', 'total_reservations', 'bigint', true),
    ('customer_related_review_metrics', 'first_purchase_at',
      'timestamp without time zone', true),
    ('customer_related_review_metrics', 'last_purchase_at',
      'timestamp without time zone', true)
)
select expected.*, a.attnum is not null as exists,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as actual_type,
  a.attnotnull as actual_not_null,
  a.attnum is not null
    and pg_catalog.format_type(a.atttypid, a.atttypmod) = expected.data_type
    and a.attnotnull = expected.not_null as type_contract_ok
from expected
left join pg_catalog.pg_class c
  on c.oid = pg_catalog.to_regclass('public.' || expected.table_name)
left join pg_catalog.pg_attribute a
  on a.attrelid = c.oid and a.attname = expected.column_name
order by expected.table_name, expected.column_name;

-- Assert core catalog guards before synthetic fixtures.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_catalog.pg_class c
  where c.oid = any(array[
    'public.customer_related_review_snapshots'::regclass,
    'public.customer_related_review_groups'::regclass,
    'public.customer_related_review_members'::regclass,
    'public.customer_analytical_booking_assignments'::regclass,
    'public.customer_related_review_metrics'::regclass
  ]) and c.relkind = 'r' and c.relrowsecurity;
  if v_count <> 5 then raise exception 'Expected five RLS-enabled tables'; end if;

  select count(*) into v_count
  from pg_catalog.pg_constraint k
  where (k.conrelid, k.contype) in (
    ('public.customer_related_review_snapshots'::regclass, 'p'),
    ('public.customer_related_review_groups'::regclass, 'p'),
    ('public.customer_related_review_members'::regclass, 'p'),
    ('public.customer_analytical_booking_assignments'::regclass, 'p'),
    ('public.customer_related_review_metrics'::regclass, 'p')
  );
  if v_count <> 5 then raise exception 'Missing primary key'; end if;

  if exists (
    with expected(table_name, pk_count, unique_count, fk_count, check_count,
      index_count) as (
      values
        ('customer_related_review_snapshots', 1, 0, 0, 6, 3),
        ('customer_related_review_groups', 1, 0, 1, 4, 2),
        ('customer_related_review_members', 1, 1, 4, 5, 4),
        ('customer_analytical_booking_assignments', 1, 1, 5, 2, 4),
        ('customer_related_review_metrics', 1, 0, 1, 2, 1)
    )
    select 1 from expected e
    join pg_catalog.pg_class c
      on c.oid = pg_catalog.to_regclass('public.' || e.table_name)
    where (select count(*) from pg_catalog.pg_constraint k
        where k.conrelid = c.oid and k.contype = 'p') <> e.pk_count
      or (select count(*) from pg_catalog.pg_constraint k
        where k.conrelid = c.oid and k.contype = 'u') <> e.unique_count
      or (select count(*) from pg_catalog.pg_constraint k
        where k.conrelid = c.oid and k.contype = 'f') <> e.fk_count
      or (select count(*) from pg_catalog.pg_constraint k
        where k.conrelid = c.oid and k.contype = 'c') <> e.check_count
      or (select count(*) from pg_catalog.pg_index i
        where i.indrelid = c.oid and i.indisready and i.indisvalid and i.indislive)
        <> e.index_count
  ) then raise exception 'Constraint or index count mismatch'; end if;

  if exists (
    with expected(table_name, constraint_type, local_columns,
      referenced_table, referenced_columns) as (
      values
        ('customer_related_review_members', 'f', array['snapshot_id', 'group_id'],
          'customer_related_review_groups', array['snapshot_id', 'group_id']),
        ('customer_analytical_booking_assignments', 'f',
          array['snapshot_id', 'related_group_id'],
          'customer_related_review_groups', array['snapshot_id', 'group_id']),
        ('customer_related_review_members', 'f', array['source', 'source_row_id'],
          'customer_source_bookings_mcp_eap', array['source', 'source_row_id']),
        ('customer_analytical_booking_assignments', 'f',
          array['source', 'source_row_id'],
          'customer_source_bookings_mcp_eap', array['source', 'source_row_id']),
        ('customer_related_review_members', 'u',
          array['snapshot_id', 'booking_link_id'], null, null),
        ('customer_analytical_booking_assignments', 'u',
          array['snapshot_id', 'booking_link_id'], null, null)
    )
    select 1 from expected e
    where (
      select count(*)
      from pg_catalog.pg_constraint k
      where k.conrelid = pg_catalog.to_regclass('public.' || e.table_name)
        and k.contype = e.constraint_type::"char"
        and (e.referenced_table is null
          or k.confrelid = pg_catalog.to_regclass('public.' || e.referenced_table))
        and array(
          select a.attname::text
          from pg_catalog.unnest(k.conkey) with ordinality as key(attnum, position)
          join pg_catalog.pg_attribute a
            on a.attrelid = k.conrelid and a.attnum = key.attnum
          order by key.position
        ) = e.local_columns
        and (e.referenced_table is null or array(
          select a.attname::text
          from pg_catalog.unnest(k.confkey) with ordinality as key(attnum, position)
          join pg_catalog.pg_attribute a
            on a.attrelid = k.confrelid and a.attnum = key.attnum
          order by key.position
        ) = e.referenced_columns)
    ) <> 1
  ) then raise exception 'Critical FK or UNIQUE column contract mismatch'; end if;

  if exists (
    with expected(table_name, column_name, data_type, not_null) as (
      values
        ('customer_related_review_snapshots', 'snapshot_id', 'uuid', true),
        ('customer_related_review_snapshots', 'status', 'text', true),
        ('customer_related_review_snapshots', 'manifest_sha256', 'text', false),
        ('customer_related_review_groups', 'snapshot_id', 'uuid', true),
        ('customer_related_review_groups', 'group_id', 'text', true),
        ('customer_related_review_members', 'source_row_id', 'bigint', true),
        ('customer_related_review_members', 'booking_link_id', 'uuid', true),
        ('customer_related_review_members', 'profile_id', 'uuid', true),
        ('customer_analytical_booking_assignments', 'source_row_id', 'bigint', true),
        ('customer_analytical_booking_assignments', 'customer_id', 'uuid', false),
        ('customer_analytical_booking_assignments', 'related_group_id', 'text', false),
        ('customer_related_review_metrics', 'total_reservations', 'bigint', true),
        ('customer_related_review_metrics', 'first_purchase_at',
          'timestamp without time zone', true),
        ('customer_related_review_metrics', 'last_purchase_at',
          'timestamp without time zone', true)
    )
    select 1 from expected e
    left join pg_catalog.pg_class c
      on c.oid = pg_catalog.to_regclass('public.' || e.table_name)
    left join pg_catalog.pg_attribute a
      on a.attrelid = c.oid and a.attname = e.column_name
    where a.attnum is null
      or pg_catalog.format_type(a.atttypid, a.atttypmod) <> e.data_type
      or a.attnotnull is distinct from e.not_null
  ) then raise exception 'Column type or nullability mismatch'; end if;

  if not exists (
    select 1 from pg_catalog.pg_index i
    join pg_catalog.pg_class idx on idx.oid = i.indexrelid
    where idx.relname = 'customer_related_review_snapshots_one_active_idx'
      and i.indrelid = 'public.customer_related_review_snapshots'::regclass
      and i.indisunique and i.indisready and i.indisvalid and i.indislive
      and pg_catalog.pg_get_expr(i.indpred, i.indrelid) like '%status%active%'
  ) then raise exception 'Missing valid partial active uniqueness'; end if;

  if exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = any(array[
      'public.customer_related_review_snapshots'::regclass,
      'public.customer_related_review_groups'::regclass,
      'public.customer_related_review_members'::regclass,
      'public.customer_analytical_booking_assignments'::regclass,
      'public.customer_related_review_metrics'::regclass
    ])
    and (exists (
      select 1 from pg_catalog.aclexplode(coalesce(
        c.relacl, pg_catalog.acldefault('r', c.relowner))) acl
      where acl.grantee = 0
    ) or pg_catalog.has_table_privilege('anon', c.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or pg_catalog.has_table_privilege('authenticated', c.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or pg_catalog.has_table_privilege('service_role', c.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
  ) then raise exception 'Unexpected public/browser/service_role table privilege'; end if;
end $$;

-- Fixtures use only newly created tables. They are rolled back.
insert into public.customer_related_review_snapshots
  (snapshot_id, rule_key, key_id)
values
  ('00000000-0000-4000-8000-000000000001',
    'RELATED_REVIEW_MCP_EAP_V1', 'test-only-key'),
  ('00000000-0000-4000-8000-000000000002',
    'RELATED_REVIEW_MCP_EAP_V1', 'test-only-key');

insert into public.customer_related_review_groups
  (snapshot_id, group_id, key_kind, booking_count, profile_count, email_count,
    phone_count, source_customer_count, conflict_count, candidate_count,
    v1_booking_count, v2_booking_count, has_exact_email_phone_corroboration,
    has_source_customer_email_corroboration)
values
  ('00000000-0000-4000-8000-000000000001', repeat('a', 64), 'EXACT_EMAIL',
    1, 1, 1, 1, 1, 1, 0, 1, 0, false, false);

-- Valid assignment shape reaches an FK because no source/link fixture is created.
-- Invalid XOR fails its CHECK before any FK lookup.
do $$
begin
  begin
    insert into public.customer_analytical_booking_assignments
      (snapshot_id, source, source_row_id, booking_link_id, representation_type,
        related_group_id)
    values
      ('00000000-0000-4000-8000-000000000001', 'MCP_EAP',
        9223372036854775806, '00000000-0000-4000-8000-000000000003',
        'related_review', repeat('a', 64));
    raise exception 'Valid XOR fixture unexpectedly inserted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.customer_analytical_booking_assignments
      (snapshot_id, source, source_row_id, booking_link_id, representation_type)
    values
      ('00000000-0000-4000-8000-000000000001', 'MCP_EAP',
        9223372036854775806, '00000000-0000-4000-8000-000000000003',
        'confirmed_customer');
    raise exception 'Invalid XOR unexpectedly inserted';
  exception when check_violation then null;
  end;

  begin
    insert into public.customer_related_review_metrics
      (snapshot_id, group_id, total_reservations, first_purchase_at, last_purchase_at)
    values
      ('00000000-0000-4000-8000-000000000002', repeat('a', 64), 1,
        '2026-09-01 00:00:00', '2026-09-01 00:00:00');
    raise exception 'Cross-snapshot group reference unexpectedly inserted';
  exception when foreign_key_violation then null;
  end;
end $$;

update public.customer_related_review_snapshots
set status = 'active', built_at = now(), activated_at = now(),
  manifest_sha256 = repeat('b', 64), valid_source_count = 1,
  confirmed_count = 0, related_count = 1, group_count = 1,
  anomaly_count = 0, active_profiles_without_metrics_count = 0
where snapshot_id = '00000000-0000-4000-8000-000000000001';

do $$
begin
  begin
    insert into public.customer_related_review_snapshots
      (snapshot_id, rule_key, key_id, status, built_at, manifest_sha256,
        valid_source_count, confirmed_count, related_count, group_count,
        anomaly_count, active_profiles_without_metrics_count)
    values
      ('00000000-0000-4000-8000-000000000005', 'RELATED_REVIEW_MCP_EAP_V1',
        'test-only-key', 'ready', now(), repeat('d', 64),
        1, 0, 1, 1, 0, 7);
    raise exception 'Ready snapshot with missing profile metrics unexpectedly inserted';
  exception when check_violation then null;
  end;
end $$;

do $$
begin
  begin
    insert into public.customer_related_review_snapshots
      (snapshot_id, rule_key, key_id, status, built_at, activated_at,
        manifest_sha256, valid_source_count, confirmed_count, related_count,
        group_count, anomaly_count, active_profiles_without_metrics_count)
    values
      ('00000000-0000-4000-8000-000000000004', 'RELATED_REVIEW_MCP_EAP_V1',
        'test-only-key', 'active', now(), now(), repeat('c', 64),
        1, 0, 1, 1, 0, 0);
    raise exception 'Duplicate active snapshot unexpectedly inserted';
  exception when unique_violation then null;
  end;
end $$;

select count(*) = 2 as synthetic_snapshot_count_ok,
  count(*) filter (where status = 'active') = 1 as one_active_snapshot_ok
from public.customer_related_review_snapshots;

-- Member and duplicate-assignment runtime fixtures require valid source/link/profile
-- rows. Their PK/UNIQUE/FK definitions are inspected above; no production row is used.
-- If an editor aborts before this line, issue ROLLBACK manually in that session.
rollback;

-- This postcheck runs after rollback and does not write or invoke a builder.
select pg_catalog.to_regclass('public.customer_related_review_snapshots') is null
    as snapshots_removed,
  pg_catalog.to_regclass('public.customer_related_review_groups') is null
    as groups_removed,
  pg_catalog.to_regclass('public.customer_related_review_members') is null
    as members_removed,
  pg_catalog.to_regclass('public.customer_analytical_booking_assignments') is null
    as assignments_removed,
  pg_catalog.to_regclass('public.customer_related_review_metrics') is null
    as metrics_removed;

do $$
begin
  if pg_catalog.to_regclass('public.customer_related_review_snapshots') is not null
    or pg_catalog.to_regclass('public.customer_related_review_groups') is not null
    or pg_catalog.to_regclass('public.customer_related_review_members') is not null
    or pg_catalog.to_regclass('public.customer_analytical_booking_assignments') is not null
    or pg_catalog.to_regclass('public.customer_related_review_metrics') is not null
  then raise exception 'Reversible schema cleanup failed'; end if;
end $$;
