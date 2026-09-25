begin;

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

commit;
