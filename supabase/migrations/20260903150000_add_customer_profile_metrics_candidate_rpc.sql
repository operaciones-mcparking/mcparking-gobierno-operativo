begin;

create or replace function public.customer_window_get_profile_metrics_candidates_m2m(
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch_ids uuid[];
  v_customer_ids uuid[] := array[]::uuid[];
  v_has_more boolean := false;
  v_remaining integer;
  v_today date := pg_catalog.timezone('America/Santiago', pg_catalog.now())::date;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid candidate limit' using errcode = '22023';
  end if;

  v_remaining := p_limit - cardinality(v_customer_ids);
  select coalesce(pg_catalog.array_agg(candidate.profile_id order by candidate.profile_id), array[]::uuid[])
  into v_branch_ids
  from (
    select distinct link.profile_id
    from public.customer_booking_profile_links link
    join public.customer_profiles profile
      on profile.id = link.profile_id and profile.status = 'active'
    left join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
    where link.status = 'active'
      and metrics.customer_id is null
      and (
        (
          link.source = 'OKP'
          and exists (
            select 1
            from public.customer_source_bookings_okp booking
            where booking.source_row_id = link.source_row_id
              and (
                (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
                or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
              )
          )
        )
        or (
          link.source = 'MCP_EAP'
          and exists (
            select 1
            from public.customer_source_bookings_mcp_eap booking
            where booking.source_row_id = link.source_row_id
              and booking.booking_status in (1, 8)
          )
        )
      )
    order by link.profile_id
    limit v_remaining + 1
  ) candidate;

  if cardinality(v_branch_ids) > v_remaining then
    v_customer_ids := v_customer_ids || v_branch_ids[1:v_remaining];
    v_has_more := true;
  else
    v_customer_ids := v_customer_ids || v_branch_ids;
  end if;

  if not v_has_more and cardinality(v_customer_ids) < p_limit then
    v_remaining := p_limit - cardinality(v_customer_ids);
    select coalesce(pg_catalog.array_agg(candidate.profile_id order by candidate.as_of_date, candidate.profile_id), array[]::uuid[])
    into v_branch_ids
    from (
      select metrics.customer_id as profile_id, metrics.as_of_date
      from public.customer_profile_metrics metrics
      join public.customer_profiles profile
        on profile.id = metrics.customer_id and profile.status = 'active'
      where metrics.as_of_date < v_today
        and not (metrics.customer_id = any(v_customer_ids))
      order by metrics.as_of_date, metrics.customer_id
      limit v_remaining + 1
    ) candidate;

    if cardinality(v_branch_ids) > v_remaining then
      v_customer_ids := v_customer_ids || v_branch_ids[1:v_remaining];
      v_has_more := true;
    else
      v_customer_ids := v_customer_ids || v_branch_ids;
    end if;
  end if;

  if not v_has_more and cardinality(v_customer_ids) < p_limit then
    v_remaining := p_limit - cardinality(v_customer_ids);
    select coalesce(pg_catalog.array_agg(candidate.profile_id order by candidate.profile_id), array[]::uuid[])
    into v_branch_ids
    from (
      select distinct link.profile_id
      from public.customer_booking_profile_links link
      join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
      where link.updated_at > metrics.updated_at
        and not (link.profile_id = any(v_customer_ids))
      order by link.profile_id
      limit v_remaining + 1
    ) candidate;

    if cardinality(v_branch_ids) > v_remaining then
      v_customer_ids := v_customer_ids || v_branch_ids[1:v_remaining];
      v_has_more := true;
    else
      v_customer_ids := v_customer_ids || v_branch_ids;
    end if;
  end if;

  if not v_has_more and cardinality(v_customer_ids) < p_limit then
    v_remaining := p_limit - cardinality(v_customer_ids);
    select coalesce(pg_catalog.array_agg(candidate.profile_id order by candidate.profile_id), array[]::uuid[])
    into v_branch_ids
    from (
      select distinct link.profile_id
      from public.customer_booking_profile_links link
      join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
      join public.customer_source_bookings_okp booking
        on link.source = 'OKP' and booking.source_row_id = link.source_row_id
      where link.status = 'active'
        and booking.updated_at > metrics.updated_at
        and not (link.profile_id = any(v_customer_ids))
      order by link.profile_id
      limit v_remaining + 1
    ) candidate;

    if cardinality(v_branch_ids) > v_remaining then
      v_customer_ids := v_customer_ids || v_branch_ids[1:v_remaining];
      v_has_more := true;
    else
      v_customer_ids := v_customer_ids || v_branch_ids;
    end if;
  end if;

  if not v_has_more and cardinality(v_customer_ids) < p_limit then
    v_remaining := p_limit - cardinality(v_customer_ids);
    select coalesce(pg_catalog.array_agg(candidate.profile_id order by candidate.profile_id), array[]::uuid[])
    into v_branch_ids
    from (
      select distinct link.profile_id
      from public.customer_booking_profile_links link
      join public.customer_profile_metrics metrics on metrics.customer_id = link.profile_id
      join public.customer_source_bookings_mcp_eap booking
        on link.source = 'MCP_EAP' and booking.source_row_id = link.source_row_id
      where link.status = 'active'
        and booking.updated_at > metrics.updated_at
        and not (link.profile_id = any(v_customer_ids))
      order by link.profile_id
      limit v_remaining + 1
    ) candidate;

    if cardinality(v_branch_ids) > v_remaining then
      v_customer_ids := v_customer_ids || v_branch_ids[1:v_remaining];
      v_has_more := true;
    else
      v_customer_ids := v_customer_ids || v_branch_ids;
    end if;
  end if;

  if not v_has_more and cardinality(v_customer_ids) < p_limit then
    v_remaining := p_limit - cardinality(v_customer_ids);
    select coalesce(pg_catalog.array_agg(candidate.profile_id order by candidate.profile_id), array[]::uuid[])
    into v_branch_ids
    from (
      select metrics.customer_id as profile_id
      from public.customer_profile_metrics metrics
      left join public.customer_profiles profile on profile.id = metrics.customer_id
      where not (metrics.customer_id = any(v_customer_ids))
        and (
          profile.id is null
          or profile.status <> 'active'
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
      limit v_remaining + 1
    ) candidate;

    if cardinality(v_branch_ids) > v_remaining then
      v_customer_ids := v_customer_ids || v_branch_ids[1:v_remaining];
      v_has_more := true;
    else
      v_customer_ids := v_customer_ids || v_branch_ids;
    end if;
  end if;

  if cardinality(v_customer_ids) = p_limit then
    v_has_more := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'customerIds', pg_catalog.to_jsonb(v_customer_ids),
    'count', cardinality(v_customer_ids),
    'hasMore', v_has_more
  );
end;
$$;

revoke all on function public.customer_window_get_profile_metrics_candidates_m2m(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_window_get_profile_metrics_candidates_m2m(integer)
  to service_role;

comment on function public.customer_window_get_profile_metrics_candidates_m2m(integer) is
  'Returns a bounded, non-PII batch of profile IDs requiring Customer Window metric refresh.';

commit;
