begin;

create or replace function public.customer_window_get_profile_metrics_bootstrap_candidates_m2m(
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
    raise exception 'Invalid bootstrap candidate limit' using errcode = '22023';
  end if;

  select coalesce(
    pg_catalog.array_agg(candidate.customer_id order by candidate.customer_id),
    array[]::uuid[]
  )
  into v_candidate_ids
  from (
    select profile.id as customer_id
    from public.customer_profiles profile
    where profile.status = 'active'
      and (p_after_customer_id is null or profile.id > p_after_customer_id)
      and exists (
        select 1
        from public.customer_booking_profile_links link
        where link.profile_id = profile.id
          and link.status = 'active'
      )
      and not exists (
        select 1
        from public.customer_profile_metrics metrics
        where metrics.customer_id = profile.id
      )
    order by profile.id
    limit p_limit + 1
  ) candidate;

  v_has_more := cardinality(v_candidate_ids) > p_limit;
  if v_has_more then
    v_customer_ids := v_candidate_ids[1:p_limit];
  else
    v_customer_ids := v_candidate_ids;
  end if;

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

revoke all on function public.customer_window_get_profile_metrics_bootstrap_candidates_m2m(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_window_get_profile_metrics_bootstrap_candidates_m2m(uuid, integer)
  to service_role;

comment on function public.customer_window_get_profile_metrics_bootstrap_candidates_m2m(uuid, integer) is
  'Returns a cursor-paginated, non-PII batch of active profiles with confirmed booking links and no metrics row.';

commit;
