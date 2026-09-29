const RULE = "RELATED_REVIEW_MCP_EAP_V1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ReadyAuditError extends Error {
  constructor(code) {
    super(code);
    this.name = "ReadyAuditError";
    this.code = code;
  }
}

function check(value, code) {
  if (!value) throw new ReadyAuditError(code);
}

const COUNTS_SQL = `
  select
    (select count(*)::text from public.customer_related_review_groups
      where snapshot_id = $1) as group_count,
    (select count(*)::text from public.customer_related_review_members
      where snapshot_id = $1) as member_count,
    (select count(*)::text from public.customer_analytical_booking_assignments
      where snapshot_id = $1) as assignment_count,
    (select count(*)::text from public.customer_related_review_metrics
      where snapshot_id = $1) as metrics_count,
    (select count(*)::text from public.customer_related_review_group_analytics
      where snapshot_id = $1) as analytics_count,
    (select count(*)::text from public.customer_related_review_contact_candidates
      where snapshot_id = $1) as contact_candidate_count,
    (select count(*)::text from public.customer_analytical_booking_assignments
      where snapshot_id = $1 and representation_type = 'confirmed_customer') as confirmed_count,
    (select count(*)::text from public.customer_analytical_booking_assignments
      where snapshot_id = $1 and representation_type = 'related_review') as related_count
`;

const ANALYTICS_AUDIT_SQL = `
  with expected_contacts as materialized (
    select member.group_id, 'email'::text as type, booking.email_normalized as normalized_value
    from public.customer_related_review_members member
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = member.source and booking.source_row_id = member.source_row_id
    where member.snapshot_id = $1 and nullif(booking.email_normalized, '') is not null
    group by member.group_id, booking.email_normalized
    union all
    select member.group_id, 'phone', booking.phone_normalized
    from public.customer_related_review_members member
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = member.source and booking.source_row_id = member.source_row_id
    where member.snapshot_id = $1 and nullif(booking.phone_normalized, '') is not null
    group by member.group_id, booking.phone_normalized
  ), actual_contacts as materialized (
    select group_id, type, normalized_value
    from public.customer_related_review_contact_candidates
    where snapshot_id = $1
  ), contact_difference as materialized (
    (select * from expected_contacts except select * from actual_contacts)
    union all
    (select * from actual_contacts except select * from expected_contacts)
  )
  select
    (select count(*)::text
      from public.customer_related_review_groups group_row
      full join public.customer_related_review_group_analytics analytics
        on analytics.snapshot_id = group_row.snapshot_id and analytics.group_id = group_row.group_id
      where coalesce(group_row.snapshot_id, analytics.snapshot_id) = $1
        and (group_row.group_id is null or analytics.group_id is null
          or analytics.total_valid_bookings <> group_row.booking_count
          or analytics.boleta_booking_count + analytics.pack_booking_count
            <> analytics.total_valid_bookings)) as bad_analytics,
    (select count(*)::text from contact_difference) as bad_contact_candidate_keys,
    (select count(*)::text
      from public.customer_related_review_contact_candidates candidate
      where candidate.snapshot_id = $1
        and (candidate.eligibility_status not in ('REVIEW', 'BLOCKED')
          or candidate.current_group_membership is not true
          or candidate.relation <> 'observed_in_group')) as bad_contact_candidate_contract
`;

const GROUP_AUDIT_SQL = `
  with expected as materialized (
    select member.group_id, count(*)::integer as booking_count,
      count(distinct member.profile_id)::integer as profile_count,
      count(distinct nullif(booking.email_normalized, ''))::integer as email_count,
      count(distinct nullif(booking.phone_normalized, ''))::integer as phone_count,
      count(distinct booking.source_customer_id)::integer as source_customer_count,
      count(*) filter (where member.link_status = 'conflict')::integer as conflict_count,
      count(*) filter (where member.link_status = 'candidate')::integer as candidate_count,
      count(*) filter (where member.resolver_version = 'customer_identity_v1')::integer as v1_count,
      count(*) filter (where member.resolver_version = 'customer_identity_v2')::integer as v2_count,
      min(booking.source_created_at) as first_purchase_at,
      max(booking.source_created_at) as last_purchase_at
    from public.customer_related_review_members member
    join public.customer_source_bookings_mcp_eap booking
      on booking.source = member.source and booking.source_row_id = member.source_row_id
    where member.snapshot_id = $1
    group by member.group_id
  ), group_comparison as materialized (
    select expected.group_id as expected_group_id, grp.group_id as actual_group_id,
      expected.*, grp.key_kind, grp.booking_count as actual_booking_count,
      grp.profile_count as actual_profile_count, grp.email_count as actual_email_count,
      grp.phone_count as actual_phone_count,
      grp.source_customer_count as actual_source_customer_count,
      grp.conflict_count as actual_conflict_count, grp.candidate_count as actual_candidate_count,
      grp.v1_booking_count as actual_v1_count, grp.v2_booking_count as actual_v2_count
    from expected full join (
      select * from public.customer_related_review_groups where snapshot_id = $1
    ) grp using (group_id)
  ), metric_comparison as materialized (
    select expected.group_id as expected_group_id, metric.group_id as actual_group_id,
      expected.booking_count, expected.first_purchase_at, expected.last_purchase_at,
      metric.total_reservations, metric.first_purchase_at as actual_first_purchase_at,
      metric.last_purchase_at as actual_last_purchase_at
    from expected full join (
      select * from public.customer_related_review_metrics where snapshot_id = $1
    ) metric using (group_id)
  )
  select
    (select count(*)::text from group_comparison comparison
      where expected_group_id is null or actual_group_id is null
        or actual_booking_count <> booking_count or actual_profile_count <> profile_count
        or actual_email_count <> email_count or actual_phone_count <> phone_count
        or actual_source_customer_count <> source_customer_count
        or actual_conflict_count <> conflict_count or actual_candidate_count <> candidate_count
        or actual_v1_count <> v1_count or actual_v2_count <> v2_count
        or v1_count + v2_count <> booking_count) as bad_group_aggregates,
    (select count(*)::text from group_comparison comparison
      where expected_group_id is null or actual_group_id is null
        or (key_kind = 'EXACT_EMAIL' and actual_email_count <> 1)
        or (key_kind = 'NO_EMAIL_SOURCE_ROW'
          and (actual_booking_count <> 1 or actual_email_count <> 0))) as bad_group_purity,
    (select count(*)::text from metric_comparison comparison
      where expected_group_id is null or actual_group_id is null
        or total_reservations <> booking_count
        or actual_first_purchase_at <> first_purchase_at
        or actual_last_purchase_at <> last_purchase_at) as bad_metrics
`;

export const LEGACY_OVERLAP_SQL = `
  select count(*)::text as overlap_count
  from public.customer_analytical_booking_assignments assignment
  join public.customer_related_review_members member
    on member.snapshot_id = assignment.snapshot_id
   and member.source = assignment.source and member.source_row_id = assignment.source_row_id
  where assignment.snapshot_id = $1 and assignment.representation_type = 'confirmed_customer'
`;

export const OVERLAP_SQL = `
  select count(*)::text as overlap_count
  from (
    select signal.source, signal.source_row_id
    from (
      select member.source, member.source_row_id, 1::smallint as side
      from public.customer_related_review_members member
      where member.snapshot_id = $1
      union all
      select assignment.source, assignment.source_row_id, 2::smallint as side
      from public.customer_analytical_booking_assignments assignment
      where assignment.snapshot_id = $1
        and assignment.representation_type = 'confirmed_customer'
    ) signal
    group by signal.source, signal.source_row_id
    having min(signal.side) = 1 and max(signal.side) = 2
  ) overlap
`;

export async function auditReadySnapshotWithClient(client, snapshotId,
  { hashManifestFn, onPhase, onPhaseFinished, now = () => Date.now() } = {}) {
  check(typeof snapshotId === "string" && UUID.test(snapshotId), "invalid_snapshot_id");
  check(client && typeof client.query === "function", "invalid_audit_client");
  check(typeof hashManifestFn === "function", "invalid_manifest_auditor");
  let phase = "contract";
  let phaseStartedAt = now();
  const startPhase = (nextPhase) => {
    phase = nextPhase;
    phaseStartedAt = now();
    try { onPhase?.(phase); } catch { /* Observability cannot change audit behavior. */ }
  };
  const finishPhase = () => {
    const durationMs = Math.max(0, now() - phaseStartedAt);
    try { onPhaseFinished?.(phase, durationMs); } catch {
      /* Observability cannot change audit behavior. */
    }
  };
  try {
    startPhase("contract");
    const snapshot = (await client.query(`
      select snapshot_id::text as snapshot_id, status, rule_key, key_id, manifest_sha256,
        valid_source_count::text as valid_source_count,
        confirmed_count::text as confirmed_count, related_count::text as related_count,
        group_count::text as group_count, anomaly_count::text as anomaly_count,
        active_profiles_without_metrics_count::text as active_profiles_without_metrics_count,
        built_at::text as built_at
      from public.customer_related_review_snapshots where snapshot_id = $1::uuid
    `, [snapshotId])).rows[0];
    check(snapshot?.snapshot_id === snapshotId, "snapshot_not_found");
    check(snapshot.status === "ready", "snapshot_not_ready");
    check(snapshot.rule_key === RULE && typeof snapshot.key_id === "string"
      && snapshot.key_id.trim().length > 0 && snapshot.key_id === snapshot.key_id.trim()
      && /^[0-9a-f]{64}$/.test(snapshot.manifest_sha256) && snapshot.built_at != null
      && [snapshot.valid_source_count, snapshot.confirmed_count, snapshot.related_count,
        snapshot.group_count, snapshot.anomaly_count,
        snapshot.active_profiles_without_metrics_count]
        .every((value) => typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)),
    "snapshot_contract_invalid");
    finishPhase();

    startPhase("counts");
    const counts = (await client.query(COUNTS_SQL, [snapshotId])).rows[0];
    check(counts, "counts_missing");
    const countsMatch = BigInt(snapshot.valid_source_count)
        === BigInt(snapshot.confirmed_count) + BigInt(snapshot.related_count)
      && counts.confirmed_count === snapshot.confirmed_count
      && counts.related_count === snapshot.related_count
      && counts.assignment_count === snapshot.valid_source_count
      && counts.member_count === snapshot.related_count
      && counts.group_count === snapshot.group_count
      && counts.metrics_count === snapshot.group_count
      && counts.analytics_count === snapshot.group_count
      && snapshot.anomaly_count === "0"
      && snapshot.active_profiles_without_metrics_count === "0";
    check(countsMatch, "snapshot_count_mismatch");
    finishPhase();

    startPhase("groups_metrics");
    const groups = (await client.query(GROUP_AUDIT_SQL, [snapshotId])).rows[0];
    check(groups && groups.bad_group_aggregates === "0" && groups.bad_group_purity === "0",
      "group_reconciliation_failed");
    check(groups.bad_metrics === "0", "metric_reconciliation_failed");
    finishPhase();

    startPhase("groups_analytics");
    const analytics = (await client.query(ANALYTICS_AUDIT_SQL, [snapshotId])).rows[0];
    check(analytics && analytics.bad_analytics === "0"
      && analytics.bad_contact_candidate_keys === "0"
      && analytics.bad_contact_candidate_contract === "0",
    "group_analytics_reconciliation_failed");
    finishPhase();

    startPhase("overlap");
    const overlap = (await client.query(OVERLAP_SQL, [snapshotId])).rows[0];
    check(overlap?.overlap_count === "0", "confirmed_related_overlap");
    finishPhase();

    startPhase("manifest");
    const manifest = await hashManifestFn(client, snapshotId, snapshot.key_id);
    check(manifest === snapshot.manifest_sha256, "manifest_mismatch");
    finishPhase();
    return {
      result: {
        ok: true,
        snapshotId,
        status: "ready",
        manifestMatch: true,
        countsMatch: true,
        anomalyCount: 0,
        containsPii: false,
      },
      snapshot,
    };
  } catch (error) {
    if (error && typeof error === "object") {
      error.auditPhase = phase;
      error.auditPhaseDurationMs = Math.max(0, now() - phaseStartedAt);
    }
    throw error;
  }
}
