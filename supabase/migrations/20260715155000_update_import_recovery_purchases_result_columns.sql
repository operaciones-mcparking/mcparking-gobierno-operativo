-- Transactional import RPC for validated recovery purchases CSV rows.
-- The app must validate the CSV and build normalized rows server-side before
-- calling this function. This RPC never stores raw CSV content or raw PII.

create or replace function public.import_recovery_purchases(
  p_file_name text,
  p_file_size bigint,
  p_file_hash text,
  p_summary jsonb,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_existing_batch_id uuid;
  v_file_name text := nullif(trim(p_file_name), '');
  v_file_hash text := nullif(trim(p_file_hash), '');
  v_rows_received integer := 0;
  v_valid_input_rows integer := 0;
  v_internal_duplicate_rows integer := 0;
  v_source_duplicate_rows integer := 0;
  v_booking_duplicate_rows integer := 0;
  v_conflict_rows integer := 0;
  v_invalid_rows integer := 0;
  v_inserted_rows integer := 0;
  v_inserted_amount numeric(12,2) := 0;
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_file_name is null then
    raise exception 'file_name is required' using errcode = '22023';
  end if;

  if p_file_size is null or p_file_size < 0 then
    raise exception 'file_size must be a non-negative number' using errcode = '22023';
  end if;

  if v_file_hash is null then
    raise exception 'file_hash is required' using errcode = '22023';
  end if;

  if p_summary is null or jsonb_typeof(p_summary) <> 'object' then
    raise exception 'summary must be a JSON object' using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;

  -- Serialize imports in the MVP to avoid duplicate races across concurrent CSV confirmations.
  perform pg_advisory_xact_lock(20260715123000);

  v_rows_received := jsonb_array_length(p_rows);

  select rib.id
  into v_existing_batch_id
  from public.recovery_import_batches rib
  where rib.file_hash = v_file_hash
    and rib.status = 'imported'
  order by rib.created_at desc
  limit 1;

  if v_existing_batch_id is not null then
    return jsonb_build_object(
      'ok', true,
      'batchId', v_existing_batch_id,
      'fileAlreadyImported', true,
      'rowsTotal', coalesce((p_summary->>'rows')::integer, v_rows_received),
      'rowsReceived', v_rows_received,
      'insertedRows', 0,
      'skippedDuplicateRows', v_rows_received,
      'conflictRows', 0,
      'invalidRows', 0,
      'insertedAmount', 0
    );
  end if;

  insert into public.recovery_import_batches (
    import_type,
    file_name,
    file_size,
    file_hash,
    status,
    rows_total,
    columns_total,
    valid_purchase_rows,
    valid_purchase_amount,
    missing_mandatory_columns,
    booking_status_counts,
    duplicate_id_groups,
    duplicate_booking_number_groups,
    created_by
  )
  values (
    'purchases_csv',
    v_file_name,
    p_file_size,
    v_file_hash,
    'importing',
    coalesce((p_summary->>'rows')::integer, v_rows_received),
    coalesce((p_summary->>'columns')::integer, 0),
    coalesce((p_summary->>'validPurchaseRows')::integer, 0),
    coalesce((p_summary->>'validPurchaseAmount')::numeric, 0),
    coalesce(p_summary->'missingMandatoryColumns', '[]'::jsonb),
    coalesce(p_summary->'bookingStatusCounts', '{}'::jsonb),
    coalesce((p_summary->>'duplicateIdGroups')::integer, 0),
    coalesce((p_summary->>'duplicateBookingNumberGroups')::integer, 0),
    auth.uid()
  )
  returning id into v_batch_id;

  with input_rows as (
    select
      row_number() over () as input_position,
      nullif(trim(source_booking_id), '') as source_booking_id,
      nullif(trim(customer_id), '') as customer_id,
      nullif(trim(email_normalized), '') as email_normalized,
      nullif(trim(phone_normalized), '') as phone_normalized,
      booking_created_at,
      booking_status,
      nullif(trim(paying_status), '') as paying_status,
      price,
      coalesce(is_valid_purchase, false) as is_valid_purchase,
      nullif(trim(booking_number), '') as booking_number,
      nullif(trim(parking_code), '') as parking_code,
      nullif(trim(location_code), '') as location_code,
      arrival_date,
      departure_date,
      duration_days,
      nullif(trim(row_hash), '') as row_hash
    from jsonb_to_recordset(p_rows) as row_data (
      arrival_date date,
      booking_created_at timestamptz,
      booking_number text,
      booking_status integer,
      customer_id text,
      departure_date date,
      duration_days integer,
      email_normalized text,
      is_valid_purchase boolean,
      location_code text,
      parking_code text,
      paying_status text,
      phone_normalized text,
      price numeric,
      row_hash text,
      source_booking_id text
    )
  ),
  valid_input as (
    select *
    from input_rows
    where source_booking_id is not null
      and booking_status is not null
  ),
  ranked_input as (
    select
      valid_input.*,
      row_number() over (
        partition by source_booking_id
        order by input_position
      ) as source_row_number
    from valid_input
  ),
  first_input as (
    select *
    from ranked_input
    where source_row_number = 1
  ),
  checked_rows as (
    select
      first_input.*,
      existing_source.id as existing_source_id,
      existing_source.row_hash as existing_source_row_hash,
      existing_booking.id as existing_booking_id
    from first_input
    left join lateral (
      select
        existing_source_row.id,
        existing_source_row.row_hash
      from public.recovery_bookings_import existing_source_row
      where existing_source_row.source_booking_id = first_input.source_booking_id
        and exists (
          select 1
          from public.recovery_import_batches existing_source_batch
          where existing_source_batch.id = existing_source_row.batch_id
            and existing_source_batch.status = 'imported'
        )
      order by existing_source_row.created_at desc
      limit 1
    ) existing_source on true
    left join lateral (
      select existing_booking_row.id
      from public.recovery_bookings_import existing_booking_row
      where first_input.booking_number is not null
        and existing_booking_row.booking_number = first_input.booking_number
        and exists (
          select 1
          from public.recovery_import_batches existing_booking_batch
          where existing_booking_batch.id = existing_booking_row.batch_id
            and existing_booking_batch.status = 'imported'
        )
      order by existing_booking_row.created_at desc
      limit 1
    ) existing_booking on true
  ),
  insertable_rows as (
    select *
    from checked_rows
    where existing_source_id is null
      and existing_booking_id is null
  ),
  inserted_rows as (
    insert into public.recovery_bookings_import (
      batch_id,
      source_booking_id,
      customer_id,
      email_normalized,
      phone_normalized,
      booking_created_at,
      booking_status,
      paying_status,
      price,
      is_valid_purchase,
      booking_number,
      parking_code,
      location_code,
      arrival_date,
      departure_date,
      duration_days,
      row_hash
    )
    select
      v_batch_id,
      source_booking_id,
      customer_id,
      email_normalized,
      phone_normalized,
      booking_created_at,
      booking_status,
      paying_status,
      price,
      is_valid_purchase,
      booking_number,
      parking_code,
      location_code,
      arrival_date,
      departure_date,
      duration_days,
      row_hash
    from insertable_rows
    returning price, is_valid_purchase
  ),
  stats as (
    select
      (select count(*) from valid_input)::integer as valid_input_rows,
      (select count(*) from ranked_input where source_row_number > 1)::integer as internal_duplicate_rows,
      (
        select count(*)
        from checked_rows
        where existing_source_id is not null
          and existing_source_row_hash is not distinct from row_hash
      )::integer as source_duplicate_rows,
      (
        select count(*)
        from checked_rows
        where existing_source_id is null
          and existing_booking_id is not null
      )::integer as booking_duplicate_rows,
      (
        select count(*)
        from checked_rows
        where existing_source_id is not null
          and existing_source_row_hash is distinct from row_hash
      )::integer as conflict_rows,
      (select count(*) from inserted_rows)::integer as inserted_rows,
      coalesce(
        (
          select sum(price)
          from inserted_rows
          where is_valid_purchase
        ),
        0
      )::numeric(12,2) as inserted_amount
  )
  select
    valid_input_rows,
    internal_duplicate_rows,
    source_duplicate_rows,
    booking_duplicate_rows,
    conflict_rows,
    inserted_rows,
    inserted_amount
  into
    v_valid_input_rows,
    v_internal_duplicate_rows,
    v_source_duplicate_rows,
    v_booking_duplicate_rows,
    v_conflict_rows,
    v_inserted_rows,
    v_inserted_amount
  from stats;

  v_invalid_rows := greatest(v_rows_received - v_valid_input_rows, 0);

  update public.recovery_import_batches
  set
    status = 'imported',
    confirmed_at = now(),
    inserted_rows = v_inserted_rows,
    skipped_duplicate_rows = v_internal_duplicate_rows + v_source_duplicate_rows + v_booking_duplicate_rows,
    conflict_rows = v_conflict_rows,
    invalid_rows = v_invalid_rows,
    inserted_amount = v_inserted_amount
  where id = v_batch_id;

  return jsonb_build_object(
    'ok', true,
    'batchId', v_batch_id,
    'fileAlreadyImported', false,
    'rowsTotal', coalesce((p_summary->>'rows')::integer, v_rows_received),
    'rowsReceived', v_rows_received,
    'insertedRows', v_inserted_rows,
    'skippedDuplicateRows', v_internal_duplicate_rows + v_source_duplicate_rows + v_booking_duplicate_rows,
    'conflictRows', v_conflict_rows,
    'invalidRows', v_invalid_rows,
    'insertedAmount', v_inserted_amount
  );
end;
$$;

comment on function public.import_recovery_purchases(text, bigint, text, jsonb, jsonb) is
  'Transactionally imports normalized recovery purchase CSV rows into staging tables. Validates active admin access and returns only aggregate counts.';

revoke all on function public.import_recovery_purchases(text, bigint, text, jsonb, jsonb) from public;
revoke execute on function public.import_recovery_purchases(text, bigint, text, jsonb, jsonb) from anon;
grant execute on function public.import_recovery_purchases(text, bigint, text, jsonb, jsonb) to authenticated;
