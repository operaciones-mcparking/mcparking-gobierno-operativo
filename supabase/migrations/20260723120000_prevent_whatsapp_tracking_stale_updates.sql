-- Prevent stale or regressive mutable-row updates for WhatsApp tracking imports.
-- This migration does not modify tracking data by itself; it replaces only the append RPC.
-- A same-message update is allowed only when updated_at_source is not older and tracking_status does not move backwards.
create or replace function public.append_recovery_whatsapp_tracking_import_rows(
  p_batch_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.recovery_import_batches%rowtype;
  v_rows_received integer := 0;
  v_valid_input_rows integer := 0;
  v_internal_duplicate_rows integer := 0;
  v_source_duplicate_rows integer := 0;
  v_message_duplicate_rows integer := 0;
  v_row_hash_duplicate_rows integer := 0;
  v_conflict_rows integer := 0;
  v_invalid_rows integer := 0;
  v_inserted_rows integer := 0;
  v_updated_rows integer := 0;
  v_message_sent_rows integer := 0;
  v_tracking_status_counts jsonb := '{}'::jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_batch_id is null then
    raise exception 'batch_id is required' using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;

  select *
  into v_batch
  from public.recovery_import_batches
  where id = p_batch_id
    and import_type = 'whatsapp_tracking_csv'
  for update;

  if not found then
    raise exception 'tracking import batch not found' using errcode = '22023';
  end if;

  if v_batch.status <> 'importing' then
    raise exception 'tracking import batch is not importing' using errcode = '22023';
  end if;

  v_rows_received := jsonb_array_length(p_rows);

  with input_rows as (
    select
      row_number() over () as input_position,
      nullif(trim(source_id), '') as source_id,
      nullif(trim(message_id), '') as message_id,
      nullif(trim(business_phone_normalized), '') as business_phone_normalized,
      nullif(trim(client_phone_normalized), '') as client_phone_normalized,
      nullif(trim(message_category), '') as message_category,
      nullif(trim(charge_type), '') as charge_type,
      sent_at,
      delivered_at,
      read_at,
      failed_at,
      nullif(trim(tracking_status), '') as tracking_status,
      created_at_source,
      updated_at_source,
      nullif(trim(row_hash), '') as row_hash
    from jsonb_to_recordset(p_rows) as row_data (
      business_phone_normalized text,
      charge_type text,
      client_phone_normalized text,
      created_at_source timestamptz,
      delivered_at timestamptz,
      failed_at timestamptz,
      message_category text,
      message_id text,
      read_at timestamptz,
      row_hash text,
      sent_at timestamptz,
      source_id text,
      tracking_status text,
      updated_at_source timestamptz
    )
  ),
  valid_input as (
    select *
    from input_rows
    where source_id is not null
      and message_id is not null
      and tracking_status in ('read', 'delivered', 'sent', 'failed', 'unknown')
  ),
  source_ranked as (
    select
      valid_input.*,
      row_number() over (
        partition by source_id
        order by input_position
      ) as source_row_number
    from valid_input
  ),
  first_source as (
    select *
    from source_ranked
    where source_row_number = 1
  ),
  message_ranked as (
    select
      first_source.*,
      row_number() over (
        partition by message_id
        order by input_position
      ) as message_row_number
    from first_source
  ),
  first_input as (
    select *
    from message_ranked
    where message_row_number = 1
  ),
  checked_rows as (
    select
      first_input.*,
      existing_source.id as existing_source_id,
      existing_source.row_hash as existing_source_row_hash,
      existing_message.id as existing_message_id,
      existing_message.row_hash as existing_message_row_hash,
      existing_message.tracking_status as existing_message_tracking_status,
      existing_message.updated_at_source as existing_message_updated_at_source,
      existing_hash.id as existing_hash_id
    from first_input
    left join lateral (
      select
        existing_source_row.id,
        existing_source_row.row_hash
      from public.recovery_whatsapp_tracking_import existing_source_row
      where existing_source_row.source_id = first_input.source_id
        and (
          existing_source_row.batch_id = p_batch_id
          or exists (
            select 1
            from public.recovery_import_batches existing_source_batch
            where existing_source_batch.id = existing_source_row.batch_id
              and existing_source_batch.status = 'imported'
          )
        )
      order by existing_source_row.created_at desc
      limit 1
    ) existing_source on true
    left join lateral (
      select
        existing_message_row.id,
        existing_message_row.row_hash,
        existing_message_row.tracking_status,
        existing_message_row.updated_at_source
      from public.recovery_whatsapp_tracking_import existing_message_row
      where existing_message_row.message_id = first_input.message_id
        and (
          existing_message_row.batch_id = p_batch_id
          or exists (
            select 1
            from public.recovery_import_batches existing_message_batch
            where existing_message_batch.id = existing_message_row.batch_id
              and existing_message_batch.status = 'imported'
          )
        )
      order by existing_message_row.created_at desc
      limit 1
    ) existing_message on true
    left join lateral (
      select existing_hash_row.id
      from public.recovery_whatsapp_tracking_import existing_hash_row
      where first_input.row_hash is not null
        and existing_hash_row.row_hash = first_input.row_hash
        and (
          existing_hash_row.batch_id = p_batch_id
          or exists (
            select 1
            from public.recovery_import_batches existing_hash_batch
            where existing_hash_batch.id = existing_hash_row.batch_id
              and existing_hash_batch.status = 'imported'
          )
        )
      order by existing_hash_row.created_at desc
      limit 1
    ) existing_hash on true
  ),
  updateable_rows as (
    select *
    from checked_rows
    where existing_message_id is not null
      and existing_message_row_hash is distinct from row_hash
      and (existing_source_id is null or existing_source_id = existing_message_id)
      and (existing_hash_id is null or existing_hash_id = existing_message_id)
      and (
        (existing_message_updated_at_source is not null and updated_at_source is not null and updated_at_source >= existing_message_updated_at_source)
        or (existing_message_updated_at_source is null and updated_at_source is not null)
        or (existing_message_updated_at_source is null and updated_at_source is null)
      )
      and (
        case tracking_status
          when 'read' then 4
          when 'delivered' then 3
          when 'failed' then 2
          when 'sent' then 1
          else 0
        end
      ) >= (
        case existing_message_tracking_status
          when 'read' then 4
          when 'delivered' then 3
          when 'failed' then 2
          when 'sent' then 1
          else 0
        end
      )
  ),
  updated_rows as (
    update public.recovery_whatsapp_tracking_import target
    set
      message_category = updateable_rows.message_category,
      charge_type = updateable_rows.charge_type,
      sent_at = updateable_rows.sent_at,
      delivered_at = updateable_rows.delivered_at,
      read_at = updateable_rows.read_at,
      failed_at = updateable_rows.failed_at,
      tracking_status = updateable_rows.tracking_status,
      updated_at_source = updateable_rows.updated_at_source,
      row_hash = updateable_rows.row_hash
    from updateable_rows
    where target.id = updateable_rows.existing_message_id
    returning target.tracking_status, target.sent_at
  ),
  insertable_rows as (
    select *
    from checked_rows
    where existing_source_id is null
      and existing_message_id is null
      and existing_hash_id is null
  ),
  inserted_rows as (
    insert into public.recovery_whatsapp_tracking_import (
      batch_id,
      source_id,
      message_id,
      business_phone_normalized,
      client_phone_normalized,
      message_category,
      charge_type,
      sent_at,
      delivered_at,
      read_at,
      failed_at,
      tracking_status,
      created_at_source,
      updated_at_source,
      row_hash
    )
    select
      p_batch_id,
      source_id,
      message_id,
      business_phone_normalized,
      client_phone_normalized,
      message_category,
      charge_type,
      sent_at,
      delivered_at,
      read_at,
      failed_at,
      tracking_status,
      created_at_source,
      updated_at_source,
      row_hash
    from insertable_rows
    returning tracking_status, sent_at
  ),
  affected_rows as (
    select tracking_status, sent_at from inserted_rows
    union all
    select tracking_status, sent_at from updated_rows
  ),
  affected_status_counts as (
    select
      coalesce(jsonb_object_agg(tracking_status, status_count), '{}'::jsonb) as tracking_status_counts
    from (
      select tracking_status, count(*)::integer as status_count
      from affected_rows
      group by tracking_status
    ) grouped_statuses
  ),
  stats as (
    select
      (select count(*) from valid_input)::integer as valid_input_rows,
      (
        (select count(*) from source_ranked where source_row_number > 1)
        +
        (select count(*) from message_ranked where message_row_number > 1)
      )::integer as internal_duplicate_rows,
      (
        select count(*)
        from checked_rows
        where existing_source_id is not null
          and existing_source_row_hash is not distinct from row_hash
      )::integer as source_duplicate_rows,
      (
        select count(*)
        from checked_rows
        where existing_message_id is not null
          and not exists (
            select 1
            from updateable_rows
            where updateable_rows.input_position = checked_rows.input_position
          )
          and not (
            existing_message_row_hash is distinct from row_hash
            and (
              (existing_source_id is not null and existing_source_id <> existing_message_id)
              or (existing_hash_id is not null and existing_hash_id <> existing_message_id)
            )
          )
      )::integer as message_duplicate_rows,
      (
        select count(*)
        from checked_rows
        where existing_source_id is null
          and existing_message_id is null
          and existing_hash_id is not null
      )::integer as row_hash_duplicate_rows,
      (
        select count(*)
        from checked_rows
        where (
          existing_message_id is not null
          and existing_message_row_hash is distinct from row_hash
          and (
            (existing_source_id is not null and existing_source_id <> existing_message_id)
            or (existing_hash_id is not null and existing_hash_id <> existing_message_id)
          )
        )
        or (
          existing_message_id is null
          and existing_source_id is not null
          and existing_source_row_hash is distinct from row_hash
        )
      )::integer as conflict_rows,
      (select count(*) from inserted_rows)::integer as inserted_rows,
      (select count(*) from updated_rows)::integer as updated_rows,
      -- For tracking imports, message_sent_rows means rows with an actual sent_at timestamp.
      (
        select count(*)
        from affected_rows
        where sent_at is not null
      )::integer as message_sent_rows,
      (select tracking_status_counts from affected_status_counts) as tracking_status_counts
  )
  select
    valid_input_rows,
    internal_duplicate_rows,
    source_duplicate_rows,
    message_duplicate_rows,
    row_hash_duplicate_rows,
    conflict_rows,
    inserted_rows,
    updated_rows,
    message_sent_rows,
    tracking_status_counts
  into
    v_valid_input_rows,
    v_internal_duplicate_rows,
    v_source_duplicate_rows,
    v_message_duplicate_rows,
    v_row_hash_duplicate_rows,
    v_conflict_rows,
    v_inserted_rows,
    v_updated_rows,
    v_message_sent_rows,
    v_tracking_status_counts
  from stats;

  v_invalid_rows := greatest(v_rows_received - v_valid_input_rows, 0);

  update public.recovery_import_batches
  set
    inserted_rows = coalesce(inserted_rows, 0) + v_inserted_rows,
    updated_rows = coalesce(updated_rows, 0) + v_updated_rows,
    skipped_duplicate_rows = coalesce(skipped_duplicate_rows, 0) + v_internal_duplicate_rows + v_source_duplicate_rows + v_message_duplicate_rows + v_row_hash_duplicate_rows,
    source_duplicate_rows = coalesce(source_duplicate_rows, 0) + v_source_duplicate_rows,
    message_duplicate_rows = coalesce(message_duplicate_rows, 0) + v_message_duplicate_rows,
    conflict_rows = coalesce(conflict_rows, 0) + v_conflict_rows,
    invalid_rows = coalesce(invalid_rows, 0) + v_invalid_rows,
    message_sent_rows = coalesce(message_sent_rows, 0) + v_message_sent_rows
  where id = p_batch_id;

  return jsonb_build_object(
    'ok', true,
    'batchId', p_batch_id,
    'rowsReceived', v_rows_received,
    'insertedRows', v_inserted_rows,
    'updatedRows', v_updated_rows,
    'skippedDuplicateRows', v_internal_duplicate_rows + v_source_duplicate_rows + v_message_duplicate_rows + v_row_hash_duplicate_rows,
    'sourceDuplicateRows', v_source_duplicate_rows,
    'messageDuplicateRows', v_message_duplicate_rows,
    'conflictRows', v_conflict_rows,
    'invalidRows', v_invalid_rows,
    'messageSentRows', v_message_sent_rows,
    'trackingStatusCounts', v_tracking_status_counts
  );
end;
$$;

comment on function public.append_recovery_whatsapp_tracking_import_rows(uuid, jsonb) is
  'Appends one normalized chunk of WhatsApp tracking rows. Existing message_id rows with changed hashes update mutable tracking fields only when the incoming row is not stale or regressive, and are reported as updatedRows.';
revoke all on function public.append_recovery_whatsapp_tracking_import_rows(uuid, jsonb) from public;
revoke execute on function public.append_recovery_whatsapp_tracking_import_rows(uuid, jsonb) from anon;
grant execute on function public.append_recovery_whatsapp_tracking_import_rows(uuid, jsonb) to authenticated;
