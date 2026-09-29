-- Customer 360 related-group analytics V1: production-safe read plans.
-- Run only after migration 20260929120000 and one snapshot refresh.
-- EXPLAIN only: no ANALYZE and no writes.

explain (verbose, costs, buffers false)
select analytics.*
from public.customer_related_review_group_analytics analytics
where analytics.snapshot_id = (
    select snapshot.snapshot_id
    from public.customer_related_review_snapshots snapshot
    where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
      and snapshot.status = 'active'
  )
  and analytics.group_id = '0363e4a41881f900abfcb369a919b09d206254056fd8294c54a65282211c89c6';

explain (verbose, costs, buffers false)
select candidate.*
from public.customer_related_review_contact_candidates candidate
where candidate.snapshot_id = (
    select snapshot.snapshot_id
    from public.customer_related_review_snapshots snapshot
    where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
      and snapshot.status = 'active'
  )
  and candidate.group_id = '0363e4a41881f900abfcb369a919b09d206254056fd8294c54a65282211c89c6'
order by candidate.type, candidate.normalized_value;

explain (verbose, costs, buffers false)
select analytics.*
from public.customer_related_review_group_analytics analytics
where analytics.snapshot_id = (
    select snapshot.snapshot_id
    from public.customer_related_review_snapshots snapshot
    where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
      and snapshot.status = 'active'
  )
  and analytics.group_id = 'a66967aa08987583c662db3c13dc2cdca9c9a6c6b65506aa94ee6882a69253d3';

explain (verbose, costs, buffers false)
select candidate.*
from public.customer_related_review_contact_candidates candidate
where candidate.snapshot_id = (
    select snapshot.snapshot_id
    from public.customer_related_review_snapshots snapshot
    where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
      and snapshot.status = 'active'
  )
  and candidate.group_id = 'a66967aa08987583c662db3c13dc2cdca9c9a6c6b65506aa94ee6882a69253d3'
order by candidate.type, candidate.normalized_value;

-- Storage measurement: expected one analytics row per group and one candidate per
-- distinct observed normalized contact. This query is read-only.
select
  pg_catalog.count(*) as analytics_rows,
  pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(
    'public.customer_related_review_group_analytics'::regclass
  )) as analytics_total_size
from public.customer_related_review_group_analytics;

select
  pg_catalog.count(*) as candidate_rows,
  pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(
    'public.customer_related_review_contact_candidates'::regclass
  )) as candidates_total_size
from public.customer_related_review_contact_candidates;
