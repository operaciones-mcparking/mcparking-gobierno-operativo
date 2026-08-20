-- Repairs recovery purchase convergence for normalized fields already included in row_hash.
-- Prepared for manual review and application; this migration is not applied automatically.

alter table public.recovery_import_row_changes
  add column if not exists previous_location_code text,
  add column if not exists current_location_code text,
  add column if not exists previous_arrival_date date,
  add column if not exists current_arrival_date date,
  add column if not exists previous_departure_date date,
  add column if not exists current_departure_date date,
  add column if not exists previous_duration_days integer,
  add column if not exists current_duration_days integer;

-- customer_id is intentionally represented only by the changed_fields name.
-- Persisting its previous/current raw values would expand event-table PII.

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
  v_updated_rows integer := 0;
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
      'updatedRows', 0,
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
      existing_source.customer_id as existing_source_customer_id,
      existing_source.location_code as existing_source_location_code,
      existing_source.arrival_date as existing_source_arrival_date,
      existing_source.departure_date as existing_source_departure_date,
      existing_source.duration_days as existing_source_duration_days,
      existing_source.booking_created_at as existing_source_booking_created_at,
      existing_source.booking_number as existing_source_booking_number,
      existing_source.booking_status as existing_source_booking_status,
      existing_source.paying_status as existing_source_paying_status,
      existing_source.is_valid_purchase as existing_source_is_valid_purchase,
      existing_source.price as existing_source_price,
      existing_source.parking_code as existing_source_parking_code,
      existing_source.email_normalized as existing_source_email_normalized,
      existing_source.phone_normalized as existing_source_phone_normalized,
      existing_booking.id as existing_booking_id
    from first_input
    left join lateral (
      select
        existing_source_row.id,
        existing_source_row.row_hash,
        existing_source_row.customer_id,
        existing_source_row.location_code,
        existing_source_row.arrival_date,
        existing_source_row.departure_date,
        existing_source_row.duration_days,
        existing_source_row.booking_created_at,
        existing_source_row.booking_number,
        existing_source_row.booking_status,
        existing_source_row.paying_status,
        existing_source_row.is_valid_purchase,
        existing_source_row.price,
        existing_source_row.parking_code,
        existing_source_row.email_normalized,
        existing_source_row.phone_normalized
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
  classified_rows as (
    select
      checked_rows.*,
      (
        existing_source_row_hash is distinct from row_hash
        or existing_source_customer_id is distinct from customer_id
        or existing_source_location_code is distinct from location_code
        or existing_source_arrival_date is distinct from arrival_date
        or existing_source_departure_date is distinct from departure_date
        or existing_source_duration_days is distinct from duration_days
        or existing_source_booking_created_at is distinct from booking_created_at
        or existing_source_booking_number is distinct from booking_number
        or existing_source_booking_status is distinct from booking_status
        or existing_source_paying_status is distinct from paying_status
        or existing_source_is_valid_purchase is distinct from is_valid_purchase
        or existing_source_price is distinct from price
        or existing_source_parking_code is distinct from parking_code
        or existing_source_email_normalized is distinct from email_normalized
        or existing_source_phone_normalized is distinct from phone_normalized
      ) as has_mutable_changes
    from checked_rows
  ),
  updateable_rows as (
    select *
    from classified_rows
    where existing_source_id is not null
      and has_mutable_changes
      and (existing_booking_id is null or existing_booking_id = existing_source_id)
  ),
  updated_rows as (
    update public.recovery_bookings_import target
    set
      customer_id = updateable_rows.customer_id,
      location_code = updateable_rows.location_code,
      arrival_date = updateable_rows.arrival_date,
      departure_date = updateable_rows.departure_date,
      duration_days = updateable_rows.duration_days,
      booking_number = updateable_rows.booking_number,
      booking_created_at = updateable_rows.booking_created_at,
      email_normalized = updateable_rows.email_normalized,
      phone_normalized = updateable_rows.phone_normalized,
      booking_status = updateable_rows.booking_status,
      paying_status = updateable_rows.paying_status,
      is_valid_purchase = updateable_rows.is_valid_purchase,
      price = updateable_rows.price,
      parking_code = updateable_rows.parking_code,
      row_hash = updateable_rows.row_hash
    from updateable_rows
    where target.id = updateable_rows.existing_source_id
    returning
      target.id,
      updateable_rows.source_booking_id,
      updateable_rows.existing_source_customer_id is distinct from target.customer_id as customer_id_changed,
      updateable_rows.existing_source_location_code as previous_location_code,
      target.location_code as current_location_code,
      updateable_rows.existing_source_arrival_date as previous_arrival_date,
      target.arrival_date as current_arrival_date,
      updateable_rows.existing_source_departure_date as previous_departure_date,
      target.departure_date as current_departure_date,
      updateable_rows.existing_source_duration_days as previous_duration_days,
      target.duration_days as current_duration_days,
      updateable_rows.existing_source_row_hash as previous_row_hash,
      target.row_hash as current_row_hash,
      updateable_rows.existing_source_booking_created_at as previous_booking_created_at,
      target.booking_created_at as current_booking_created_at,
      updateable_rows.existing_source_booking_number is distinct from target.booking_number as booking_number_changed,
      updateable_rows.existing_source_booking_status as previous_booking_status,
      target.booking_status as current_booking_status,
      updateable_rows.existing_source_paying_status as previous_paying_status,
      target.paying_status as current_paying_status,
      updateable_rows.existing_source_is_valid_purchase as previous_is_valid_purchase,
      target.is_valid_purchase as current_is_valid_purchase,
      updateable_rows.existing_source_price as previous_price,
      target.price as current_price,
      updateable_rows.existing_source_parking_code as previous_parking_code,
      target.parking_code as current_parking_code,
      public.recovery_import_safe_identity_hash(updateable_rows.existing_source_email_normalized) as previous_identity_email_hash,
      public.recovery_import_safe_identity_hash(target.email_normalized) as current_identity_email_hash,
      public.recovery_import_safe_identity_hash(updateable_rows.existing_source_phone_normalized) as previous_identity_phone_hash,
      public.recovery_import_safe_identity_hash(target.phone_normalized) as current_identity_phone_hash
  ),
  insertable_rows as (
    select *
    from classified_rows
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
    returning
      id,
      source_booking_id,
      row_hash,
      location_code,
      arrival_date,
      departure_date,
      duration_days,
      booking_created_at,
      booking_status,
      paying_status,
      is_valid_purchase,
      price,
      parking_code,
      email_normalized,
      phone_normalized
  ),
  inserted_change_events as (
    insert into public.recovery_import_row_changes (
      batch_id, source, operation, entity_id, natural_key_hash, current_row_hash, changed_fields,
      current_location_code, current_arrival_date, current_departure_date, current_duration_days,
      current_booking_created_at, current_booking_status, current_paying_status, current_is_valid_purchase,
      current_price, current_parking_code, current_identity_email_hash, current_identity_phone_hash
    )
    select
      v_batch_id, 'purchases', 'inserted', inserted_rows.id,
      public.recovery_import_safe_identity_hash(inserted_rows.source_booking_id), inserted_rows.row_hash,
      array['customer_id','location_code','arrival_date','departure_date','duration_days','booking_created_at','booking_number','booking_status','paying_status','is_valid_purchase','price','parking_code','identity_email_hash','identity_phone_hash','row_hash']::text[],
      inserted_rows.location_code, inserted_rows.arrival_date, inserted_rows.departure_date, inserted_rows.duration_days,
      inserted_rows.booking_created_at, inserted_rows.booking_status, inserted_rows.paying_status,
      inserted_rows.is_valid_purchase, inserted_rows.price, inserted_rows.parking_code,
      public.recovery_import_safe_identity_hash(inserted_rows.email_normalized),
      public.recovery_import_safe_identity_hash(inserted_rows.phone_normalized)
    from inserted_rows
    on conflict (batch_id, source, entity_id, operation) do nothing
    returning id
  ),
  updated_change_events as (
    insert into public.recovery_import_row_changes (
      batch_id, source, operation, entity_id, natural_key_hash, previous_row_hash, current_row_hash, changed_fields,
      previous_location_code, current_location_code, previous_arrival_date, current_arrival_date,
      previous_departure_date, current_departure_date, previous_duration_days, current_duration_days,
      previous_booking_created_at, current_booking_created_at, previous_booking_status, current_booking_status,
      previous_paying_status, current_paying_status, previous_is_valid_purchase, current_is_valid_purchase,
      previous_price, current_price, previous_parking_code, current_parking_code,
      previous_identity_email_hash, current_identity_email_hash, previous_identity_phone_hash, current_identity_phone_hash
    )
    select
      v_batch_id, 'purchases', 'updated', updated_rows.id,
      public.recovery_import_safe_identity_hash(updated_rows.source_booking_id),
      updated_rows.previous_row_hash, updated_rows.current_row_hash,
      array_remove(array[
        case when updated_rows.customer_id_changed then 'customer_id' end,
        case when updated_rows.previous_location_code is distinct from updated_rows.current_location_code then 'location_code' end,
        case when updated_rows.previous_arrival_date is distinct from updated_rows.current_arrival_date then 'arrival_date' end,
        case when updated_rows.previous_departure_date is distinct from updated_rows.current_departure_date then 'departure_date' end,
        case when updated_rows.previous_duration_days is distinct from updated_rows.current_duration_days then 'duration_days' end,
        case when updated_rows.previous_booking_created_at is distinct from updated_rows.current_booking_created_at then 'booking_created_at' end,
        case when updated_rows.booking_number_changed then 'booking_number' end,
        case when updated_rows.previous_booking_status is distinct from updated_rows.current_booking_status then 'booking_status' end,
        case when updated_rows.previous_paying_status is distinct from updated_rows.current_paying_status then 'paying_status' end,
        case when updated_rows.previous_is_valid_purchase is distinct from updated_rows.current_is_valid_purchase then 'is_valid_purchase' end,
        case when updated_rows.previous_price is distinct from updated_rows.current_price then 'price' end,
        case when updated_rows.previous_parking_code is distinct from updated_rows.current_parking_code then 'parking_code' end,
        case when updated_rows.previous_identity_email_hash is distinct from updated_rows.current_identity_email_hash then 'identity_email_hash' end,
        case when updated_rows.previous_identity_phone_hash is distinct from updated_rows.current_identity_phone_hash then 'identity_phone_hash' end,
        case when updated_rows.previous_row_hash is distinct from updated_rows.current_row_hash then 'row_hash' end
      ]::text[], null),
      updated_rows.previous_location_code, updated_rows.current_location_code,
      updated_rows.previous_arrival_date, updated_rows.current_arrival_date,
      updated_rows.previous_departure_date, updated_rows.current_departure_date,
      updated_rows.previous_duration_days, updated_rows.current_duration_days,
      updated_rows.previous_booking_created_at, updated_rows.current_booking_created_at,
      updated_rows.previous_booking_status, updated_rows.current_booking_status,
      updated_rows.previous_paying_status, updated_rows.current_paying_status,
      updated_rows.previous_is_valid_purchase, updated_rows.current_is_valid_purchase,
      updated_rows.previous_price, updated_rows.current_price,
      updated_rows.previous_parking_code, updated_rows.current_parking_code,
      updated_rows.previous_identity_email_hash, updated_rows.current_identity_email_hash,
      updated_rows.previous_identity_phone_hash, updated_rows.current_identity_phone_hash
    from updated_rows
    on conflict (batch_id, source, entity_id, operation) do nothing
    returning id
  ),
  stats as (
    select
      (select count(*) from valid_input)::integer as valid_input_rows,
      (select count(*) from ranked_input where source_row_number > 1)::integer as internal_duplicate_rows,
      (
        select count(*)
        from classified_rows
        where existing_source_id is not null
          and not has_mutable_changes
      )::integer as source_duplicate_rows,
      (
        select count(*)
        from classified_rows
        where existing_source_id is null
          and existing_booking_id is not null
      )::integer as booking_duplicate_rows,
      (
        select count(*)
        from classified_rows
        where existing_source_id is not null
          and has_mutable_changes
          and existing_booking_id is not null
          and existing_booking_id <> existing_source_id
      )::integer as conflict_rows,
      (select count(*) from inserted_rows)::integer as inserted_rows,
      (select count(*) from updated_rows)::integer as updated_rows,
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
    updated_rows,
    inserted_amount
  into
    v_valid_input_rows,
    v_internal_duplicate_rows,
    v_source_duplicate_rows,
    v_booking_duplicate_rows,
    v_conflict_rows,
    v_inserted_rows,
    v_updated_rows,
    v_inserted_amount
  from stats;

  v_invalid_rows := greatest(v_rows_received - v_valid_input_rows, 0);

  update public.recovery_import_batches
  set
    status = 'imported',
    confirmed_at = now(),
    inserted_rows = v_inserted_rows,
    updated_rows = v_updated_rows,
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
    'updatedRows', v_updated_rows,
    'skippedDuplicateRows', v_internal_duplicate_rows + v_source_duplicate_rows + v_booking_duplicate_rows,
    'conflictRows', v_conflict_rows,
    'invalidRows', v_invalid_rows,
    'insertedAmount', v_inserted_amount
  );
end;
$$;

comment on function public.import_recovery_purchases(text, bigint, text, jsonb, jsonb) is
  'Transactionally imports normalized recovery purchase CSV rows into staging tables. Existing source_booking_id rows with changed hashes or divergent mutable values converge to the normalized incoming row and are reported as updatedRows. Validates active admin access and returns only aggregate counts.';

revoke all on function public.import_recovery_purchases(text, bigint, text, jsonb, jsonb) from public;
revoke execute on function public.import_recovery_purchases(text, bigint, text, jsonb, jsonb) from anon;
grant execute on function public.import_recovery_purchases(text, bigint, text, jsonb, jsonb) to authenticated;
