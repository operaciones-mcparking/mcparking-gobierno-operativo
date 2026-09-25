begin;

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

commit;
