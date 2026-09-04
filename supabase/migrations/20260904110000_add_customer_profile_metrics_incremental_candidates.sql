begin;

create or replace function public.customer_window_get_profile_metrics_incremental_candidates_m2m(
  p_after_customer_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidate_ids uuid[];
  v_customer_ids uuid[];
  v_has_more boolean;
  v_next_cursor uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid incremental candidate limit' using errcode = '22023';
  end if;

  with missing_metrics as (
    select profile.id as customer_id
    from public.customer_profiles profile
    where profile.status = 'active'
      and (p_after_customer_id is null or profile.id > p_after_customer_id)
      and not exists (
        select 1
        from public.customer_profile_metrics metrics
        where metrics.customer_id = profile.id
      )
      and (
        exists (
          select 1
          from public.customer_booking_profile_links link
          join public.customer_source_bookings_okp booking
            on link.source = 'OKP' and booking.source_row_id = link.source_row_id
          where link.profile_id = profile.id
            and link.status = 'active'
            and (
              (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
              or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
            )
        )
        or exists (
          select 1
          from public.customer_booking_profile_links link
          join public.customer_source_bookings_mcp_eap booking
            on link.source = 'MCP_EAP' and booking.source_row_id = link.source_row_id
          where link.profile_id = profile.id
            and link.status = 'active'
            and booking.booking_status in (1, 8)
        )
      )
    order by profile.id
    limit p_limit + 1
  ),
  existing_metrics as (
    select metrics.customer_id
    from public.customer_profile_metrics metrics
    left join public.customer_profiles profile on profile.id = metrics.customer_id
    where (p_after_customer_id is null or metrics.customer_id > p_after_customer_id)
      and (
        profile.id is null
        or profile.status <> 'active'
        or exists (
          select 1
          from public.customer_booking_profile_links link
          where link.profile_id = metrics.customer_id
            and link.updated_at > metrics.updated_at
        )
        or exists (
          select 1
          from public.customer_booking_profile_links link
          join public.customer_source_bookings_okp booking
            on link.source = 'OKP' and booking.source_row_id = link.source_row_id
          where link.profile_id = metrics.customer_id
            and link.status = 'active'
            and booking.updated_at > metrics.updated_at
        )
        or exists (
          select 1
          from public.customer_booking_profile_links link
          join public.customer_source_bookings_mcp_eap booking
            on link.source = 'MCP_EAP' and booking.source_row_id = link.source_row_id
          where link.profile_id = metrics.customer_id
            and link.status = 'active'
            and booking.updated_at > metrics.updated_at
        )
        or not exists (
          select 1
          from public.customer_booking_profile_links link
          join public.customer_source_bookings_okp booking
            on link.source = 'OKP' and booking.source_row_id = link.source_row_id
          where link.profile_id = metrics.customer_id
            and link.status = 'active'
            and (
              (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
              or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
            )
          union all
          select 1
          from public.customer_booking_profile_links link
          join public.customer_source_bookings_mcp_eap booking
            on link.source = 'MCP_EAP' and booking.source_row_id = link.source_row_id
          where link.profile_id = metrics.customer_id
            and link.status = 'active'
            and booking.booking_status in (1, 8)
        )
      )
    order by metrics.customer_id
    limit p_limit + 1
  ),
  candidates as (
    select customer_id from missing_metrics
    union
    select customer_id from existing_metrics
    order by customer_id
    limit p_limit + 1
  )
  select coalesce(pg_catalog.array_agg(customer_id order by customer_id), array[]::uuid[])
  into v_candidate_ids
  from candidates;

  v_has_more := cardinality(v_candidate_ids) > p_limit;
  v_customer_ids := case when v_has_more then v_candidate_ids[1:p_limit] else v_candidate_ids end;
  if cardinality(v_customer_ids) > 0 then
    v_next_cursor := v_customer_ids[cardinality(v_customer_ids)];
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'customerIds', pg_catalog.to_jsonb(v_customer_ids),
    'count', cardinality(v_customer_ids),
    'nextCursor', v_next_cursor,
    'hasMore', v_has_more
  );
end;
$$;

create or replace function public.customer_window_get_profile_metrics_daily_candidates_m2m(
  p_after_customer_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_candidate_ids uuid[];
  v_customer_ids uuid[];
  v_has_more boolean;
  v_next_cursor uuid;
  v_today date := pg_catalog.timezone('America/Santiago', pg_catalog.now())::date;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid daily candidate limit' using errcode = '22023';
  end if;

  select coalesce(
    pg_catalog.array_agg(candidate.customer_id order by candidate.customer_id),
    array[]::uuid[]
  )
  into v_candidate_ids
  from (
    select metrics.customer_id
    from public.customer_profile_metrics metrics
    where metrics.as_of_date < v_today
      and (p_after_customer_id is null or metrics.customer_id > p_after_customer_id)
    order by metrics.customer_id
    limit p_limit + 1
  ) candidate;

  v_has_more := cardinality(v_candidate_ids) > p_limit;
  v_customer_ids := case when v_has_more then v_candidate_ids[1:p_limit] else v_candidate_ids end;
  if cardinality(v_customer_ids) > 0 then
    v_next_cursor := v_customer_ids[cardinality(v_customer_ids)];
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'customerIds', pg_catalog.to_jsonb(v_customer_ids),
    'count', cardinality(v_customer_ids),
    'nextCursor', v_next_cursor,
    'hasMore', v_has_more
  );
end;
$$;

revoke all on function public.customer_window_get_profile_metrics_incremental_candidates_m2m(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_window_get_profile_metrics_incremental_candidates_m2m(uuid, integer)
  to service_role;

revoke all on function public.customer_window_get_profile_metrics_daily_candidates_m2m(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_window_get_profile_metrics_daily_candidates_m2m(uuid, integer)
  to service_role;

comment on function public.customer_window_get_profile_metrics_incremental_candidates_m2m(uuid, integer) is
  'Returns cursor-paginated, non-PII profile IDs whose persisted metrics need structural or source-data maintenance.';
comment on function public.customer_window_get_profile_metrics_daily_candidates_m2m(uuid, integer) is
  'Returns cursor-paginated, non-PII profile IDs whose date-relative metrics are stale in America/Santiago.';

commit;
