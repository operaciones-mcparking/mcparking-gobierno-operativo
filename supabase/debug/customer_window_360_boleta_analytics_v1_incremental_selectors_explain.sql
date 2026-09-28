begin transaction read only;

-- The definitive analytics state table does not exist before migration 160000.
-- Existing metrics state supplies production cursor analogues for read-only planning.

-- A1. customer_profiles initial stream branch.
explain (verbose, costs, buffers false)
select profile.updated_at, profile.id
from public.customer_profiles profile
where profile.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
order by profile.updated_at, profile.id
limit 85;

-- A2. customer_profiles incremental stream branch.
explain (verbose, costs, buffers false)
select profile.updated_at, profile.id
from public.customer_profiles profile
where (profile.updated_at, profile.id) > (
    (select state.watermark_updated_at
     from public.customer_profile_metrics_incremental_state state
     where state.stream_key = 'customer_profiles'),
    (select state.watermark_tiebreaker::uuid
     from public.customer_profile_metrics_incremental_state state
     where state.stream_key = 'customer_profiles')
  )
  and profile.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
order by profile.updated_at, profile.id
limit 85;

-- B1. booking links initial stream branch.
explain (verbose, costs, buffers false)
select link.updated_at, link.id, link.profile_id
from public.customer_booking_profile_links link
where link.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
order by link.updated_at, link.id
limit 85;

-- B2. booking links incremental stream branch.
explain (verbose, costs, buffers false)
select link.updated_at, link.id, link.profile_id
from public.customer_booking_profile_links link
where (link.updated_at, link.id) > (
    (select state.watermark_updated_at
     from public.customer_profile_metrics_incremental_state state
     where state.stream_key = 'booking_links'),
    (select state.watermark_tiebreaker::uuid
     from public.customer_profile_metrics_incremental_state state
     where state.stream_key = 'booking_links')
  )
  and link.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
order by link.updated_at, link.id
limit 85;

-- C1. MCP/EAP initial source branch; link resolution follows the bounded page.
explain (verbose, costs, buffers false)
with page as materialized (
  select booking.updated_at, booking.source_row_id
  from public.customer_source_bookings_mcp_eap booking
  where booking.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
  order by booking.updated_at, booking.source_row_id
  limit 85
)
select page.updated_at, page.source_row_id, link.profile_id
from page
left join public.customer_booking_profile_links link
  on link.source = 'MCP_EAP'
 and link.source_row_id = page.source_row_id
 and link.status = 'active';

-- C2. MCP/EAP incremental source branch; link resolution follows the bounded page.
explain (verbose, costs, buffers false)
with page as materialized (
  select booking.updated_at, booking.source_row_id
  from public.customer_source_bookings_mcp_eap booking
  where (booking.updated_at, booking.source_row_id) > (
      (select state.watermark_updated_at
       from public.customer_profile_metrics_incremental_state state
       where state.stream_key = 'mcp_eap'),
      (select state.watermark_tiebreaker::bigint
       from public.customer_profile_metrics_incremental_state state
       where state.stream_key = 'mcp_eap')
    )
    and booking.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
  order by booking.updated_at, booking.source_row_id
  limit 85
)
select page.updated_at, page.source_row_id, link.profile_id
from page
left join public.customer_booking_profile_links link
  on link.source = 'MCP_EAP'
 and link.source_row_id = page.source_row_id
 and link.status = 'active';

-- D1. OKP initial source branch; link resolution follows the bounded page.
explain (verbose, costs, buffers false)
with page as materialized (
  select booking.updated_at, booking.source_row_id
  from public.customer_source_bookings_okp booking
  where booking.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
  order by booking.updated_at, booking.source_row_id
  limit 85
)
select page.updated_at, page.source_row_id, link.profile_id
from page
left join public.customer_booking_profile_links link
  on link.source = 'OKP'
 and link.source_row_id = page.source_row_id
 and link.status = 'active';

-- D2. OKP incremental source branch; link resolution follows the bounded page.
explain (verbose, costs, buffers false)
with page as materialized (
  select booking.updated_at, booking.source_row_id
  from public.customer_source_bookings_okp booking
  where (booking.updated_at, booking.source_row_id) > (
      (select state.watermark_updated_at
       from public.customer_profile_metrics_incremental_state state
       where state.stream_key = 'okp'),
      (select state.watermark_tiebreaker::bigint
       from public.customer_profile_metrics_incremental_state state
       where state.stream_key = 'okp')
    )
    and booking.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
  order by booking.updated_at, booking.source_row_id
  limit 85
)
select page.updated_at, page.source_row_id, link.profile_id
from page
left join public.customer_booking_profile_links link
  on link.source = 'OKP'
 and link.source_row_id = page.source_row_id
 and link.status = 'active';

-- E. Bootstrap analogue while the new analytics table is absent.
explain (verbose, costs, buffers false)
select profile.id
from public.customer_profiles profile
where profile.status = 'active'
  and profile.merged_into_profile_id is null
  and profile.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
  and not exists (
    select 1
    from public.customer_profile_metrics metrics
    where metrics.customer_id = profile.id
  )
  and exists (
    select 1
    from public.customer_booking_profile_links link
    where link.profile_id = profile.id
      and link.status = 'active'
  )
order by profile.id
limit 85;

-- F. Daily as-of analogue; production uses the new (as_of_date, customer_id) index.
explain (verbose, costs, buffers false)
select metrics.customer_id
from public.customer_profile_metrics metrics
where metrics.as_of_date < pg_catalog.timezone('America/Santiago', pg_catalog.now())::date
order by metrics.as_of_date, metrics.customer_id
limit 85;

-- G. Dedicated bootstrap mode uses the complete p_limit (500 + one hasMore probe row).
explain (verbose, costs, buffers false)
select profile.id
from public.customer_profiles profile
where profile.status = 'active'
  and profile.merged_into_profile_id is null
  and profile.updated_at <= pg_catalog.statement_timestamp() - interval '5 minutes'
  and not exists (
    select 1
    from public.customer_profile_metrics metrics
    where metrics.customer_id = profile.id
  )
  and exists (
    select 1
    from public.customer_booking_profile_links link
    where link.profile_id = profile.id
      and link.status = 'active'
  )
order by profile.id
limit 501;

-- H. Dedicated as_of mode uses the complete p_limit and the date/customer index.
explain (verbose, costs, buffers false)
select metrics.customer_id
from public.customer_profile_metrics metrics
where metrics.as_of_date < pg_catalog.timezone('America/Santiago', pg_catalog.now())::date
order by metrics.as_of_date, metrics.customer_id
limit 501;

-- I. Cheap status path: bounded metadata only, with no operational counts.
explain (verbose, costs, buffers false)
select state.stream_key, state.watermark_updated_at, state.watermark_tiebreaker,
  state.stream_complete, state.processed_rows, state.last_batch_count,
  state.last_succeeded_at, state.updated_at
from public.customer_profile_metrics_incremental_state state
order by state.stream_key;

-- J. Opt-in expensive status proxies. These certify shape only; do not use ANALYZE.
explain (verbose, costs, buffers false)
select pg_catalog.count(*) from public.customer_profile_metrics metrics;

explain (verbose, costs, buffers false)
select pg_catalog.count(*)
from public.customer_profile_metrics metrics
where metrics.as_of_date < pg_catalog.timezone('America/Santiago', pg_catalog.statement_timestamp())::date;

rollback;
