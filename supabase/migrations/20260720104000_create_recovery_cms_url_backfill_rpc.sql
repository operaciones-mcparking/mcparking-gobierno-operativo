-- Controlled cms_url backfill for historical recovery carts.
-- Updates only existing rows and only when cms_url is currently empty.
-- Does not change emails, phones, dates, statuses, message ids or row hashes.

create or replace function public.backfill_recovery_incomplete_booking_cms_urls(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows_total integer := 0;
  v_rows_with_cms_url integer := 0;
  v_skipped_missing_cms_url integer := 0;
  v_skipped_missing_key integer := 0;
  v_not_found_rows integer := 0;
  v_already_had_cms_url_rows integer := 0;
  v_ambiguous_booking_rows integer := 0;
  v_updated_rows integer := 0;
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;

  v_rows_total := jsonb_array_length(p_rows);

  with input_rows as (
    select
      row_number() over () as input_position,
      nullif(trim(source_id), '') as source_id,
      nullif(trim(booking_id), '') as booking_id,
      nullif(trim(cms_url), '') as cms_url
    from jsonb_to_recordset(p_rows) as row_data (
      source_id text,
      booking_id text,
      cms_url text
    )
  ),
  input_stats as (
    select
      count(*) filter (where cms_url is not null)::integer as rows_with_cms_url,
      count(*) filter (where cms_url is null)::integer as skipped_missing_cms_url,
      count(*) filter (
        where cms_url is not null
          and source_id is null
          and booking_id is null
      )::integer as skipped_missing_key
    from input_rows
  ),
  eligible_rows as (
    select *
    from input_rows
    where cms_url is not null
      and (source_id is not null or booking_id is not null)
  ),
  resolved_rows as (
    select
      eligible_rows.*,
      source_match.id as source_target_id,
      source_match.cms_url as source_target_cms_url,
      coalesce(source_match.match_count, 0) as source_match_count,
      booking_match.target_id as booking_target_id,
      booking_match.target_cms_url as booking_target_cms_url,
      coalesce(booking_match.match_count, 0) as booking_match_count,
      case
        when coalesce(source_match.match_count, 0) > 0 then source_match.id
        when coalesce(source_match.match_count, 0) = 0 and coalesce(booking_match.match_count, 0) = 1 then booking_match.target_id
        else null
      end as target_id,
      case
        when coalesce(source_match.match_count, 0) > 0 then source_match.cms_url
        when coalesce(source_match.match_count, 0) = 0 and coalesce(booking_match.match_count, 0) = 1 then booking_match.target_cms_url
        else null
      end as target_cms_url
    from eligible_rows
    left join lateral (
      select
        source_row.id,
        source_row.cms_url,
        count(*) over ()::integer as match_count
      from public.recovery_incomplete_bookings_import source_row
      where eligible_rows.source_id is not null
        and source_row.source_id = eligible_rows.source_id
      order by source_row.created_at desc
      limit 1
    ) source_match on true
    left join lateral (
      select
        count(*)::integer as match_count,
        (array_agg(booking_row.id order by booking_row.created_at desc))[1] as target_id,
        (array_agg(booking_row.cms_url order by booking_row.created_at desc))[1] as target_cms_url
      from public.recovery_incomplete_bookings_import booking_row
      where eligible_rows.booking_id is not null
        and booking_row.booking_id = eligible_rows.booking_id
    ) booking_match on true
  ),
  rows_to_update as (
    select distinct on (target_id)
      target_id,
      cms_url
    from resolved_rows
    where target_id is not null
      and nullif(trim(coalesce(target_cms_url, '')), '') is null
    order by target_id, input_position
  ),
  updated_rows as (
    update public.recovery_incomplete_bookings_import target_row
    set cms_url = rows_to_update.cms_url
    from rows_to_update
    where target_row.id = rows_to_update.target_id
      and nullif(trim(coalesce(target_row.cms_url, '')), '') is null
    returning target_row.id
  ),
  resolved_stats as (
    select
      count(*) filter (
        where target_id is null
          and not (source_match_count = 0 and booking_id is not null and booking_match_count > 1)
      )::integer as not_found_rows,
      count(*) filter (
        where target_id is not null
          and nullif(trim(coalesce(target_cms_url, '')), '') is not null
      )::integer as already_had_cms_url_rows,
      count(*) filter (
        where source_match_count = 0
          and booking_id is not null
          and booking_match_count > 1
      )::integer as ambiguous_booking_rows
    from resolved_rows
  )
  select
    input_stats.rows_with_cms_url,
    input_stats.skipped_missing_cms_url,
    input_stats.skipped_missing_key,
    resolved_stats.not_found_rows,
    resolved_stats.already_had_cms_url_rows,
    resolved_stats.ambiguous_booking_rows,
    (select count(*)::integer from updated_rows)
  into
    v_rows_with_cms_url,
    v_skipped_missing_cms_url,
    v_skipped_missing_key,
    v_not_found_rows,
    v_already_had_cms_url_rows,
    v_ambiguous_booking_rows,
    v_updated_rows
  from input_stats
  cross join resolved_stats;

  return jsonb_build_object(
    'ok', true,
    'rowsTotal', v_rows_total,
    'rowsWithCmsUrl', coalesce(v_rows_with_cms_url, 0),
    'updatedRows', coalesce(v_updated_rows, 0),
    'skippedMissingCmsUrl', coalesce(v_skipped_missing_cms_url, 0),
    'skippedMissingKey', coalesce(v_skipped_missing_key, 0),
    'notFoundRows', coalesce(v_not_found_rows, 0),
    'alreadyHadCmsUrlRows', coalesce(v_already_had_cms_url_rows, 0),
    'ambiguousBookingRows', coalesce(v_ambiguous_booking_rows, 0)
  );
end;
$$;

comment on function public.backfill_recovery_incomplete_booking_cms_urls(jsonb) is
  'Admin-only controlled backfill for sensitive cms_url values on existing recovery incomplete bookings. Does not insert rows or modify other fields.';

revoke all on function public.backfill_recovery_incomplete_booking_cms_urls(jsonb) from public;
revoke execute on function public.backfill_recovery_incomplete_booking_cms_urls(jsonb) from anon;
grant execute on function public.backfill_recovery_incomplete_booking_cms_urls(jsonb) to authenticated;