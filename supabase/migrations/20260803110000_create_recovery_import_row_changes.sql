-- Recovery import row change events for precise snapshot invalidation.
-- This migration is prepared for review only; it is not applied automatically.

create table if not exists public.recovery_import_row_changes (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.recovery_import_batches(id) on delete cascade,
  source text not null,
  operation text not null,
  entity_id uuid not null,
  natural_key_hash text,
  previous_row_hash text,
  current_row_hash text,
  changed_fields text[] not null default '{}'::text[],
  previous_form_datetime timestamptz,
  current_form_datetime timestamptz,
  previous_intended_arrival_at timestamptz,
  current_intended_arrival_at timestamptz,
  previous_intended_arrival_date date,
  current_intended_arrival_date date,
  previous_intended_departure_at timestamptz,
  current_intended_departure_at timestamptz,
  previous_intended_departure_date date,
  current_intended_departure_date date,
  previous_intended_days integer,
  current_intended_days integer,
  previous_message_sent boolean,
  current_message_sent boolean,
  previous_updated_at_source timestamptz,
  current_updated_at_source timestamptz,
  previous_parking_code text,
  current_parking_code text,
  previous_type text,
  current_type text,
  previous_booking_created_at timestamptz,
  current_booking_created_at timestamptz,
  previous_booking_status integer,
  current_booking_status integer,
  previous_paying_status text,
  current_paying_status text,
  previous_is_valid_purchase boolean,
  current_is_valid_purchase boolean,
  previous_price numeric(12,2),
  current_price numeric(12,2),
  previous_identity_email_hash text,
  current_identity_email_hash text,
  previous_identity_phone_hash text,
  current_identity_phone_hash text,
  created_at timestamptz not null default now(),
  snapshot_processed_at timestamptz,
  snapshot_processing_error_code text,
  constraint recovery_import_row_changes_source_check
    check (source in ('carts', 'purchases')),
  constraint recovery_import_row_changes_operation_check
    check (operation in ('inserted', 'updated')),
  constraint recovery_import_row_changes_changed_fields_no_nulls_check
    check (array_position(changed_fields, null) is null),
  constraint recovery_import_row_changes_changed_fields_nonempty_check
    check (cardinality(changed_fields) > 0),
  constraint recovery_import_row_changes_snapshot_error_code_check
    check (snapshot_processing_error_code is null or length(trim(snapshot_processing_error_code)) > 0),
  constraint recovery_import_row_changes_idempotency_unique
    unique (batch_id, source, entity_id, operation)
);

create index if not exists recovery_import_row_changes_batch_id_idx
  on public.recovery_import_row_changes(batch_id);

create index if not exists recovery_import_row_changes_source_operation_idx
  on public.recovery_import_row_changes(source, operation, created_at desc);

create index if not exists recovery_import_row_changes_snapshot_pending_idx
  on public.recovery_import_row_changes(source, created_at)
  where snapshot_processed_at is null;

create index if not exists recovery_import_row_changes_entity_idx
  on public.recovery_import_row_changes(source, entity_id);

alter table public.recovery_import_row_changes enable row level security;

revoke all on table public.recovery_import_row_changes from public;
revoke all on table public.recovery_import_row_changes from anon;
revoke all on table public.recovery_import_row_changes from authenticated;
grant select, insert, update, delete on table public.recovery_import_row_changes to service_role;

comment on table public.recovery_import_row_changes is
  'Internal non-PII row-level import change events used to determine which recovery weeks need snapshot recalculation.';

create or replace function public.recovery_import_safe_identity_hash(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(lower(trim(p_value)), '') is null then null
    else encode(extensions.digest(lower(trim(p_value)), 'sha256'), 'hex')
  end;
$$;

revoke all on function public.recovery_import_safe_identity_hash(text) from public;
revoke execute on function public.recovery_import_safe_identity_hash(text) from anon;
revoke execute on function public.recovery_import_safe_identity_hash(text) from authenticated;
grant execute on function public.recovery_import_safe_identity_hash(text) to service_role;

comment on function public.recovery_import_safe_identity_hash(text) is
  'Internal deterministic SHA-256 hash for normalized recovery import identifiers. It is pseudonymization, not anonymization.';

-- Adds controlled mutable updates for recovery incomplete bookings imports.
-- Existing source_id rows with changed hashes update only safe mutable fields.
-- This migration is intentionally not applied by Codex during implementation.

alter table public.recovery_import_batches
  add column if not exists updated_rows integer default 0;

comment on column public.recovery_import_batches.updated_rows is
  'Rows updated during mutable recovery imports when an existing source identifier receives safer newer mutable fields.';

create or replace function public.import_recovery_incomplete_bookings(
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
  v_message_duplicate_rows integer := 0;
  v_conflict_rows integer := 0;
  v_invalid_rows integer := 0;
  v_inserted_rows integer := 0;
  v_updated_rows integer := 0;
  v_inserted_abandoned_rows integer := 0;
  v_inserted_canceled_rows integer := 0;
  v_message_sent_rows integer := 0;
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

  -- Serialize imports to avoid duplicate/update races across concurrent CSV confirmations.
  perform pg_advisory_xact_lock(20260715133000);

  v_rows_received := jsonb_array_length(p_rows);

  select rib.id
  into v_existing_batch_id
  from public.recovery_import_batches rib
  where rib.file_hash = v_file_hash
    and rib.import_type = 'incomplete_bookings_csv'
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
      'sourceDuplicateRows', 0,
      'bookingDuplicateRows', 0,
      'messageDuplicateRows', 0,
      'conflictRows', 0,
      'invalidRows', 0,
      'insertedAbandonedRows', 0,
      'insertedCanceledRows', 0,
      'messageSentRows', 0
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
    'incomplete_bookings_csv',
    v_file_name,
    p_file_size,
    v_file_hash,
    'importing',
    coalesce((p_summary->>'rows')::integer, v_rows_received),
    coalesce((p_summary->>'columns')::integer, 0),
    0,
    0,
    coalesce(p_summary->'missingRequiredColumns', '[]'::jsonb),
    coalesce(p_summary->'typeCounts', '{}'::jsonb),
    coalesce((p_summary->>'duplicateIdGroups')::integer, 0),
    coalesce((p_summary->>'duplicateBookingIdGroups')::integer, 0),
    auth.uid()
  )
  returning id into v_batch_id;

  with input_rows as (
    select
      row_number() over () as input_position,
      nullif(trim(source_id), '') as source_id,
      nullif(trim(booking_id), '') as booking_id,
      nullif(trim(email_normalized), '') as email_normalized,
      nullif(trim(phone_normalized), '') as phone_normalized,
      nullif(trim(cms_url), '') as cms_url,
      nullif(trim(type), '') as type,
      nullif(trim(parking_code), '') as parking_code,
      form_datetime,
      intended_arrival_date,
      intended_departure_date,
      intended_days,
      intended_arrival_at,
      intended_departure_at,
      message_sent,
      nullif(trim(message_id), '') as message_id,
      created_at_source,
      updated_at_source,
      nullif(trim(row_hash), '') as row_hash
    from jsonb_to_recordset(p_rows) as row_data (
      booking_id text,
      created_at_source timestamptz,
      cms_url text,
      email_normalized text,
      form_datetime timestamptz,
      intended_arrival_date date,
      intended_departure_date date,
      intended_days integer,
      intended_arrival_at timestamptz,
      intended_departure_at timestamptz,
      message_id text,
      message_sent boolean,
      parking_code text,
      phone_normalized text,
      row_hash text,
      source_id text,
      type text,
      updated_at_source timestamptz
    )
  ),
  valid_input as (
    select *
    from input_rows
    where source_id is not null
      and booking_id is not null
      and type in ('abandoned', 'canceled')
  ),
  ranked_input as (
    select
      valid_input.*,
      row_number() over (
        partition by source_id
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
      existing_source.form_datetime as existing_source_form_datetime,
      existing_source.intended_arrival_at as existing_source_intended_arrival_at,
      existing_source.intended_arrival_date as existing_source_intended_arrival_date,
      existing_source.intended_departure_at as existing_source_intended_departure_at,
      existing_source.intended_departure_date as existing_source_intended_departure_date,
      existing_source.intended_days as existing_source_intended_days,
      existing_source.message_sent as existing_source_message_sent,
      existing_source.message_id as existing_source_message_id,
      existing_source.updated_at_source as existing_source_updated_at_source,
      existing_source.cms_url as existing_source_cms_url,
      existing_source.parking_code as existing_source_parking_code,
      existing_source.type as existing_source_type,
      existing_source.email_normalized as existing_source_email_normalized,
      existing_source.phone_normalized as existing_source_phone_normalized,
      existing_booking.id as existing_booking_id,
      existing_message.id as existing_message_id
    from first_input
    left join lateral (
      select
        existing_source_row.id,
        existing_source_row.row_hash,
        existing_source_row.form_datetime,
        existing_source_row.intended_arrival_at,
        existing_source_row.intended_arrival_date,
        existing_source_row.intended_departure_at,
        existing_source_row.intended_departure_date,
        existing_source_row.intended_days,
        existing_source_row.message_sent,
        existing_source_row.message_id,
        existing_source_row.updated_at_source,
        existing_source_row.cms_url,
        existing_source_row.parking_code,
        existing_source_row.type,
        existing_source_row.email_normalized,
        existing_source_row.phone_normalized
      from public.recovery_incomplete_bookings_import existing_source_row
      where existing_source_row.source_id = first_input.source_id
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
      from public.recovery_incomplete_bookings_import existing_booking_row
      where existing_booking_row.booking_id = first_input.booking_id
        and exists (
          select 1
          from public.recovery_import_batches existing_booking_batch
          where existing_booking_batch.id = existing_booking_row.batch_id
            and existing_booking_batch.status = 'imported'
        )
      order by existing_booking_row.created_at desc
      limit 1
    ) existing_booking on true
    left join lateral (
      select existing_message_row.id
      from public.recovery_incomplete_bookings_import existing_message_row
      where first_input.message_id is not null
        and existing_message_row.message_id = first_input.message_id
        and exists (
          select 1
          from public.recovery_import_batches existing_message_batch
          where existing_message_batch.id = existing_message_row.batch_id
            and existing_message_batch.status = 'imported'
        )
      order by existing_message_row.created_at desc
      limit 1
    ) existing_message on true
  ),
  updateable_rows as (
    select *
    from checked_rows
    where existing_source_id is not null
      and existing_source_row_hash is distinct from row_hash
      and (existing_booking_id is null or existing_booking_id = existing_source_id)
      and (existing_message_id is null or existing_message_id = existing_source_id)
  ),
  updated_rows as (
    update public.recovery_incomplete_bookings_import target
    set
      message_sent = updateable_rows.message_sent,
      message_id = coalesce(updateable_rows.message_id, target.message_id),
      updated_at_source = coalesce(updateable_rows.updated_at_source, target.updated_at_source),
      cms_url = case
        when nullif(trim(target.cms_url), '') is null and updateable_rows.cms_url is not null then updateable_rows.cms_url
        else target.cms_url
      end,
      intended_arrival_date = updateable_rows.intended_arrival_date,
      intended_arrival_at = updateable_rows.intended_arrival_at,
      intended_departure_date = updateable_rows.intended_departure_date,
      intended_departure_at = updateable_rows.intended_departure_at,
      intended_days = updateable_rows.intended_days,
      row_hash = updateable_rows.row_hash
    from updateable_rows
    where target.id = updateable_rows.existing_source_id
    returning
      target.id,
      updateable_rows.source_id,
      updateable_rows.existing_source_row_hash as previous_row_hash,
      target.row_hash as current_row_hash,
      updateable_rows.existing_source_form_datetime as previous_form_datetime,
      target.form_datetime as current_form_datetime,
      updateable_rows.existing_source_intended_arrival_at as previous_intended_arrival_at,
      target.intended_arrival_at as current_intended_arrival_at,
      updateable_rows.existing_source_intended_arrival_date as previous_intended_arrival_date,
      target.intended_arrival_date as current_intended_arrival_date,
      updateable_rows.existing_source_intended_departure_at as previous_intended_departure_at,
      target.intended_departure_at as current_intended_departure_at,
      updateable_rows.existing_source_intended_departure_date as previous_intended_departure_date,
      target.intended_departure_date as current_intended_departure_date,
      updateable_rows.existing_source_intended_days as previous_intended_days,
      target.intended_days as current_intended_days,
      updateable_rows.existing_source_message_sent as previous_message_sent,
      target.message_sent as current_message_sent,
      updateable_rows.existing_source_updated_at_source as previous_updated_at_source,
      target.updated_at_source as current_updated_at_source,
      updateable_rows.existing_source_message_id is distinct from target.message_id as message_id_changed,
      updateable_rows.existing_source_cms_url is distinct from target.cms_url as cms_url_changed,
      updateable_rows.existing_source_parking_code as previous_parking_code,
      target.parking_code as current_parking_code,
      updateable_rows.existing_source_type as previous_type,
      target.type as current_type,
      public.recovery_import_safe_identity_hash(updateable_rows.existing_source_email_normalized) as previous_identity_email_hash,
      public.recovery_import_safe_identity_hash(target.email_normalized) as current_identity_email_hash,
      public.recovery_import_safe_identity_hash(updateable_rows.existing_source_phone_normalized) as previous_identity_phone_hash,
      public.recovery_import_safe_identity_hash(target.phone_normalized) as current_identity_phone_hash,
      target.type,
      target.message_sent
  ),
  insertable_rows as (
    select *
    from checked_rows
    where existing_source_id is null
      and existing_booking_id is null
      and existing_message_id is null
  ),
  inserted_rows as (
    insert into public.recovery_incomplete_bookings_import (
      batch_id,
      source_id,
      booking_id,
      email_normalized,
      phone_normalized,
      cms_url,
      type,
      parking_code,
      form_datetime,
      intended_arrival_date,
      intended_departure_date,
      intended_days,
      intended_arrival_at,
      intended_departure_at,
      message_sent,
      message_id,
      created_at_source,
      updated_at_source,
      row_hash
    )
    select
      v_batch_id,
      source_id,
      booking_id,
      email_normalized,
      phone_normalized,
      cms_url,
      type,
      parking_code,
      form_datetime,
      intended_arrival_date,
      intended_departure_date,
      intended_days,
      intended_arrival_at,
      intended_departure_at,
      message_sent,
      message_id,
      created_at_source,
      updated_at_source,
      row_hash
    from insertable_rows
    returning
      id,
      source_id,
      row_hash,
      form_datetime,
      intended_arrival_at,
      intended_arrival_date,
      intended_departure_at,
      intended_departure_date,
      intended_days,
      message_sent,
      updated_at_source,
      parking_code,
      type,
      email_normalized,
      phone_normalized
  ),
  changed_rows as (
    select type, message_sent from inserted_rows
    union all
    select type, message_sent from updated_rows
  ),
  inserted_change_events as (
    insert into public.recovery_import_row_changes (
      batch_id, source, operation, entity_id, natural_key_hash, current_row_hash, changed_fields,
      current_form_datetime, current_intended_arrival_at, current_intended_arrival_date,
      current_intended_departure_at, current_intended_departure_date, current_intended_days,
      current_message_sent, current_updated_at_source, current_parking_code, current_type,
      current_identity_email_hash, current_identity_phone_hash
    )
    select
      v_batch_id, 'carts', 'inserted', inserted_rows.id,
      public.recovery_import_safe_identity_hash(inserted_rows.source_id), inserted_rows.row_hash,
      array['form_datetime','intended_arrival_at','intended_arrival_date','intended_departure_at','intended_departure_date','intended_days','message_sent','message_id','cms_url','updated_at_source','parking_code','type','identity_email_hash','identity_phone_hash','row_hash']::text[],
      inserted_rows.form_datetime, inserted_rows.intended_arrival_at, inserted_rows.intended_arrival_date,
      inserted_rows.intended_departure_at, inserted_rows.intended_departure_date, inserted_rows.intended_days,
      inserted_rows.message_sent, inserted_rows.updated_at_source, inserted_rows.parking_code, inserted_rows.type,
      public.recovery_import_safe_identity_hash(inserted_rows.email_normalized),
      public.recovery_import_safe_identity_hash(inserted_rows.phone_normalized)
    from inserted_rows
    on conflict (batch_id, source, entity_id, operation) do nothing
    returning id
  ),
  updated_change_events as (
    insert into public.recovery_import_row_changes (
      batch_id, source, operation, entity_id, natural_key_hash, previous_row_hash, current_row_hash, changed_fields,
      previous_form_datetime, current_form_datetime, previous_intended_arrival_at, current_intended_arrival_at,
      previous_intended_arrival_date, current_intended_arrival_date,
      previous_intended_departure_at, current_intended_departure_at,
      previous_intended_departure_date, current_intended_departure_date,
      previous_intended_days, current_intended_days,
      previous_message_sent, current_message_sent,
      previous_updated_at_source, current_updated_at_source,
      previous_parking_code, current_parking_code, previous_type, current_type,
      previous_identity_email_hash, current_identity_email_hash, previous_identity_phone_hash, current_identity_phone_hash
    )
    select
      v_batch_id, 'carts', 'updated', updated_rows.id,
      public.recovery_import_safe_identity_hash(updated_rows.source_id),
      updated_rows.previous_row_hash, updated_rows.current_row_hash,
      array_remove(array[
        case when updated_rows.previous_form_datetime is distinct from updated_rows.current_form_datetime then 'form_datetime' end,
        case when updated_rows.previous_intended_arrival_at is distinct from updated_rows.current_intended_arrival_at then 'intended_arrival_at' end,
        case when updated_rows.previous_intended_arrival_date is distinct from updated_rows.current_intended_arrival_date then 'intended_arrival_date' end,
        case when updated_rows.previous_intended_departure_at is distinct from updated_rows.current_intended_departure_at then 'intended_departure_at' end,
        case when updated_rows.previous_intended_departure_date is distinct from updated_rows.current_intended_departure_date then 'intended_departure_date' end,
        case when updated_rows.previous_intended_days is distinct from updated_rows.current_intended_days then 'intended_days' end,
        case when updated_rows.previous_message_sent is distinct from updated_rows.current_message_sent then 'message_sent' end,
        case when updated_rows.message_id_changed then 'message_id' end,
        case when updated_rows.cms_url_changed then 'cms_url' end,
        case when updated_rows.previous_updated_at_source is distinct from updated_rows.current_updated_at_source then 'updated_at_source' end,
        case when updated_rows.previous_parking_code is distinct from updated_rows.current_parking_code then 'parking_code' end,
        case when updated_rows.previous_type is distinct from updated_rows.current_type then 'type' end,
        case when updated_rows.previous_identity_email_hash is distinct from updated_rows.current_identity_email_hash then 'identity_email_hash' end,
        case when updated_rows.previous_identity_phone_hash is distinct from updated_rows.current_identity_phone_hash then 'identity_phone_hash' end,
        case when updated_rows.previous_row_hash is distinct from updated_rows.current_row_hash then 'row_hash' end
      ]::text[], null),
      updated_rows.previous_form_datetime, updated_rows.current_form_datetime,
      updated_rows.previous_intended_arrival_at, updated_rows.current_intended_arrival_at,
      updated_rows.previous_intended_arrival_date, updated_rows.current_intended_arrival_date,
      updated_rows.previous_intended_departure_at, updated_rows.current_intended_departure_at,
      updated_rows.previous_intended_departure_date, updated_rows.current_intended_departure_date,
      updated_rows.previous_intended_days, updated_rows.current_intended_days,
      updated_rows.previous_message_sent, updated_rows.current_message_sent,
      updated_rows.previous_updated_at_source, updated_rows.current_updated_at_source,
      updated_rows.previous_parking_code, updated_rows.current_parking_code,
      updated_rows.previous_type, updated_rows.current_type,
      updated_rows.previous_identity_email_hash, updated_rows.current_identity_email_hash,
      updated_rows.previous_identity_phone_hash, updated_rows.current_identity_phone_hash
    from updated_rows
    where updated_rows.previous_row_hash is distinct from updated_rows.current_row_hash
    on conflict (batch_id, source, entity_id, operation) do nothing
    returning id
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
        where existing_source_id is null
          and existing_booking_id is null
          and existing_message_id is not null
      )::integer as message_duplicate_rows,
      (
        select count(*)
        from checked_rows
        where existing_source_id is not null
          and existing_source_row_hash is distinct from row_hash
          and (
            (existing_booking_id is not null and existing_booking_id <> existing_source_id)
            or (existing_message_id is not null and existing_message_id <> existing_source_id)
          )
      )::integer as conflict_rows,
      (select count(*) from inserted_rows)::integer as inserted_rows,
      (select count(*) from updated_rows)::integer as updated_rows,
      (
        select count(*)
        from inserted_rows
        where type = 'abandoned'
      )::integer as inserted_abandoned_rows,
      (
        select count(*)
        from inserted_rows
        where type = 'canceled'
      )::integer as inserted_canceled_rows,
      (
        select count(*)
        from changed_rows
        where message_sent is true
      )::integer as message_sent_rows
  )
  select
    valid_input_rows,
    internal_duplicate_rows,
    source_duplicate_rows,
    booking_duplicate_rows,
    message_duplicate_rows,
    conflict_rows,
    inserted_rows,
    updated_rows,
    inserted_abandoned_rows,
    inserted_canceled_rows,
    message_sent_rows
  into
    v_valid_input_rows,
    v_internal_duplicate_rows,
    v_source_duplicate_rows,
    v_booking_duplicate_rows,
    v_message_duplicate_rows,
    v_conflict_rows,
    v_inserted_rows,
    v_updated_rows,
    v_inserted_abandoned_rows,
    v_inserted_canceled_rows,
    v_message_sent_rows
  from stats;

  v_invalid_rows := greatest(v_rows_received - v_valid_input_rows, 0);

  update public.recovery_import_batches
  set
    status = 'imported',
    confirmed_at = now(),
    inserted_rows = v_inserted_rows,
    updated_rows = coalesce(updated_rows, 0) + v_updated_rows,
    skipped_duplicate_rows = v_internal_duplicate_rows + v_source_duplicate_rows + v_booking_duplicate_rows + v_message_duplicate_rows,
    source_duplicate_rows = v_source_duplicate_rows,
    booking_duplicate_rows = v_booking_duplicate_rows,
    message_duplicate_rows = v_message_duplicate_rows,
    conflict_rows = v_conflict_rows,
    invalid_rows = v_invalid_rows,
    inserted_abandoned_rows = v_inserted_abandoned_rows,
    inserted_canceled_rows = v_inserted_canceled_rows,
    message_sent_rows = v_message_sent_rows
  where id = v_batch_id;

  return jsonb_build_object(
    'ok', true,
    'batchId', v_batch_id,
    'fileAlreadyImported', false,
    'rowsTotal', coalesce((p_summary->>'rows')::integer, v_rows_received),
    'rowsReceived', v_rows_received,
    'insertedRows', v_inserted_rows,
    'updatedRows', v_updated_rows,
    'skippedDuplicateRows', v_internal_duplicate_rows + v_source_duplicate_rows + v_booking_duplicate_rows + v_message_duplicate_rows,
    'sourceDuplicateRows', v_source_duplicate_rows,
    'bookingDuplicateRows', v_booking_duplicate_rows,
    'messageDuplicateRows', v_message_duplicate_rows,
    'conflictRows', v_conflict_rows,
    'invalidRows', v_invalid_rows,
    'insertedAbandonedRows', v_inserted_abandoned_rows,
    'insertedCanceledRows', v_inserted_canceled_rows,
    'messageSentRows', v_message_sent_rows
  );
end;
$$;

comment on function public.import_recovery_incomplete_bookings(text, bigint, text, jsonb, jsonb) is
  'Transactionally imports normalized BackendIncompleteBookings2 rows into staging tables. Existing source_id rows with changed hashes update safe mutable cart fields and are reported as updatedRows. Validates active admin access and returns only aggregate counts.';

revoke all on function public.import_recovery_incomplete_bookings(text, bigint, text, jsonb, jsonb) from public;
revoke execute on function public.import_recovery_incomplete_bookings(text, bigint, text, jsonb, jsonb) from anon;
grant execute on function public.import_recovery_incomplete_bookings(text, bigint, text, jsonb, jsonb) to authenticated;
-- Transactional import RPC for validated recovery purchases CSV rows.
-- Adds controlled updates for mutable purchase fields when source_booking_id already exists.
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
  updateable_rows as (
    select *
    from checked_rows
    where existing_source_id is not null
      and existing_source_row_hash is distinct from row_hash
      and (existing_booking_id is null or existing_booking_id = existing_source_id)
  ),
  updated_rows as (
    update public.recovery_bookings_import target
    set
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
    returning
      id,
      source_booking_id,
      row_hash,
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
      current_booking_created_at, current_booking_status, current_paying_status, current_is_valid_purchase,
      current_price, current_parking_code, current_identity_email_hash, current_identity_phone_hash
    )
    select
      v_batch_id, 'purchases', 'inserted', inserted_rows.id,
      public.recovery_import_safe_identity_hash(inserted_rows.source_booking_id), inserted_rows.row_hash,
      array['booking_created_at','booking_number','booking_status','paying_status','is_valid_purchase','price','parking_code','identity_email_hash','identity_phone_hash','row_hash']::text[],
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
      updated_rows.previous_booking_created_at, updated_rows.current_booking_created_at,
      updated_rows.previous_booking_status, updated_rows.current_booking_status,
      updated_rows.previous_paying_status, updated_rows.current_paying_status,
      updated_rows.previous_is_valid_purchase, updated_rows.current_is_valid_purchase,
      updated_rows.previous_price, updated_rows.current_price,
      updated_rows.previous_parking_code, updated_rows.current_parking_code,
      updated_rows.previous_identity_email_hash, updated_rows.current_identity_email_hash,
      updated_rows.previous_identity_phone_hash, updated_rows.current_identity_phone_hash
    from updated_rows
    where updated_rows.previous_row_hash is distinct from updated_rows.current_row_hash
    on conflict (batch_id, source, entity_id, operation) do nothing
    returning id
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
  'Transactionally imports normalized recovery purchase CSV rows into staging tables. Existing source_booking_id rows with changed hashes update mutable purchase fields and are reported as updatedRows. Validates active admin access and returns only aggregate counts.';

revoke all on function public.import_recovery_purchases(text, bigint, text, jsonb, jsonb) from public;
revoke execute on function public.import_recovery_purchases(text, bigint, text, jsonb, jsonb) from anon;
grant execute on function public.import_recovery_purchases(text, bigint, text, jsonb, jsonb) to authenticated;
