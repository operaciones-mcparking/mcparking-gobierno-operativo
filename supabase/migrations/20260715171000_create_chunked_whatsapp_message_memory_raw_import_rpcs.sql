-- Chunked import RPCs for sensitive n8n WhatsApp Message Memory raw Message rows.
-- These functions keep one logical batch per file while allowing the app to
-- append raw-message rows in smaller chunks. They store Message text in the
-- admin-only raw staging table, but never return message_text, text_summary,
-- raw phones, raw CSV content, payloads or row bodies.

create or replace function public.start_recovery_whatsapp_message_memory_raw_import(
  p_file_name text,
  p_file_size bigint,
  p_file_hash text,
  p_summary jsonb
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

  select rib.id
  into v_existing_batch_id
  from public.recovery_import_batches rib
  where rib.file_hash = v_file_hash
    and rib.import_type = 'whatsapp_message_memory_raw_csv'
    and rib.status = 'imported'
  order by rib.created_at desc
  limit 1;

  if v_existing_batch_id is not null then
    return jsonb_build_object(
      'ok', true,
      'batchId', v_existing_batch_id,
      'fileAlreadyImported', true,
      'status', 'imported'
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
    missing_mandatory_columns,
    booking_status_counts,
    inserted_rows,
    skipped_duplicate_rows,
    conflict_rows,
    invalid_rows,
    created_by
  )
  values (
    'whatsapp_message_memory_raw_csv',
    v_file_name,
    p_file_size,
    v_file_hash,
    'importing',
    coalesce((p_summary->>'rows')::integer, (p_summary->>'rowsTotal')::integer, 0),
    coalesce((p_summary->>'columns')::integer, (p_summary->>'columnsTotal')::integer, 0),
    coalesce(p_summary->'missingMandatory', p_summary->'missingMandatoryColumns', '[]'::jsonb),
    coalesce(p_summary->'messageBoundTypeCounts', p_summary->'statusCounts', '{}'::jsonb),
    0,
    0,
    0,
    0,
    auth.uid()
  )
  returning id into v_batch_id;

  return jsonb_build_object(
    'ok', true,
    'batchId', v_batch_id,
    'fileAlreadyImported', false,
    'status', 'importing'
  );
end;
$$;

comment on function public.start_recovery_whatsapp_message_memory_raw_import(text, bigint, text, jsonb) is
  'Starts a chunked WhatsApp Message Memory raw Message import batch. Returns an existing imported batch for duplicate file hashes without returning message text.';

create or replace function public.append_recovery_whatsapp_message_memory_raw_import_rows(
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
  v_row_hash_duplicate_rows integer := 0;
  v_conflict_rows integer := 0;
  v_invalid_rows integer := 0;
  v_inserted_rows integer := 0;
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
    and import_type = 'whatsapp_message_memory_raw_csv'
  for update;

  if not found then
    raise exception 'message memory raw import batch not found' using errcode = '22023';
  end if;

  if v_batch.status <> 'importing' then
    raise exception 'message memory raw import batch is not importing' using errcode = '22023';
  end if;

  v_rows_received := jsonb_array_length(p_rows);

  with input_rows as (
    select
      row_number() over () as input_position,
      nullif(trim(conversation_id), '') as conversation_id,
      nullif(trim(api_phone_normalized), '') as api_phone_normalized,
      nullif(trim(wa_id_normalized), '') as wa_id_normalized,
      message_at,
      nullif(trim(message_bound_type), '') as message_bound_type,
      nullif(trim(message_type), '') as message_type,
      nullif(trim(intent_category), '') as intent_category,
      nullif(trim(message_sentiment), '') as message_sentiment,
      nullif(trim(chat_state), '') as chat_state,
      nullif(trim(message_text), '') as message_text,
      nullif(trim(row_hash), '') as row_hash
    from jsonb_to_recordset(p_rows) as row_data (
      api_phone_normalized text,
      chat_state text,
      conversation_id text,
      intent_category text,
      message_at timestamptz,
      message_bound_type text,
      message_sentiment text,
      message_text text,
      message_type text,
      row_hash text,
      wa_id_normalized text
    )
  ),
  valid_input as (
    select *
    from input_rows
    where conversation_id is not null
      and wa_id_normalized is not null
      and message_at is not null
      and message_text is not null
      and row_hash is not null
  ),
  row_hash_ranked as (
    select
      valid_input.*,
      row_number() over (
        partition by row_hash
        order by input_position
      ) as row_hash_row_number
    from valid_input
  ),
  first_input as (
    select *
    from row_hash_ranked
    where row_hash_row_number = 1
  ),
  checked_rows as (
    select
      first_input.*,
      existing_hash.id as existing_hash_id
    from first_input
    left join lateral (
      select existing_hash_row.id
      from public.recovery_whatsapp_message_memory_raw_import existing_hash_row
      where existing_hash_row.row_hash = first_input.row_hash
      limit 1
    ) existing_hash on true
  ),
  insertable_rows as (
    select *
    from checked_rows
    where existing_hash_id is null
  ),
  inserted_rows as (
    insert into public.recovery_whatsapp_message_memory_raw_import (
      batch_id,
      conversation_id,
      api_phone_normalized,
      wa_id_normalized,
      message_at,
      message_bound_type,
      message_type,
      intent_category,
      message_sentiment,
      chat_state,
      message_text,
      row_hash
    )
    select
      p_batch_id,
      conversation_id,
      api_phone_normalized,
      wa_id_normalized,
      message_at,
      message_bound_type,
      message_type,
      intent_category,
      message_sentiment,
      chat_state,
      message_text,
      row_hash
    from insertable_rows
    returning id
  ),
  stats as (
    select
      (select count(*) from valid_input)::integer as valid_input_rows,
      (select count(*) from row_hash_ranked where row_hash_row_number > 1)::integer as internal_duplicate_rows,
      (select count(*) from checked_rows where existing_hash_id is not null)::integer as row_hash_duplicate_rows,
      0::integer as conflict_rows,
      (select count(*) from inserted_rows)::integer as inserted_rows
  )
  select
    valid_input_rows,
    internal_duplicate_rows,
    row_hash_duplicate_rows,
    conflict_rows,
    inserted_rows
  into
    v_valid_input_rows,
    v_internal_duplicate_rows,
    v_row_hash_duplicate_rows,
    v_conflict_rows,
    v_inserted_rows
  from stats;

  v_invalid_rows := greatest(v_rows_received - v_valid_input_rows, 0);

  update public.recovery_import_batches
  set
    inserted_rows = coalesce(inserted_rows, 0) + v_inserted_rows,
    skipped_duplicate_rows = coalesce(skipped_duplicate_rows, 0) + v_internal_duplicate_rows + v_row_hash_duplicate_rows,
    conflict_rows = coalesce(conflict_rows, 0) + v_conflict_rows,
    invalid_rows = coalesce(invalid_rows, 0) + v_invalid_rows
  where id = p_batch_id;

  return jsonb_build_object(
    'ok', true,
    'batchId', p_batch_id,
    'rowsReceived', v_rows_received,
    'insertedRows', v_inserted_rows,
    'skippedDuplicateRows', v_internal_duplicate_rows + v_row_hash_duplicate_rows,
    'conflictRows', v_conflict_rows,
    'invalidRows', v_invalid_rows,
    'status', 'importing'
  );
end;
$$;

comment on function public.append_recovery_whatsapp_message_memory_raw_import_rows(uuid, jsonb) is
  'Appends one sensitive raw Message chunk to an importing recovery batch and returns safe aggregate counts only.';

create or replace function public.finish_recovery_whatsapp_message_memory_raw_import(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.recovery_import_batches%rowtype;
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_batch_id is null then
    raise exception 'batch_id is required' using errcode = '22023';
  end if;

  update public.recovery_import_batches
  set
    status = 'imported',
    confirmed_at = now()
  where id = p_batch_id
    and import_type = 'whatsapp_message_memory_raw_csv'
    and status = 'importing'
  returning * into v_batch;

  if not found then
    raise exception 'message memory raw import batch not found or not importing' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'ok', true,
    'batchId', v_batch.id,
    'status', v_batch.status,
    'insertedRows', coalesce(v_batch.inserted_rows, 0),
    'skippedDuplicateRows', coalesce(v_batch.skipped_duplicate_rows, 0),
    'conflictRows', coalesce(v_batch.conflict_rows, 0),
    'invalidRows', coalesce(v_batch.invalid_rows, 0)
  );
end;
$$;

comment on function public.finish_recovery_whatsapp_message_memory_raw_import(uuid) is
  'Finishes a chunked WhatsApp Message Memory raw Message import batch and returns safe aggregate counters.';

create or replace function public.fail_recovery_whatsapp_message_memory_raw_import(
  p_batch_id uuid,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.recovery_import_batches%rowtype;
begin
  if not public.is_app_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_batch_id is null then
    raise exception 'batch_id is required' using errcode = '22023';
  end if;

  update public.recovery_import_batches
  set
    status = 'failed',
    error_message = left(coalesce(p_error_message, 'Import failed'), 1000)
  where id = p_batch_id
    and import_type = 'whatsapp_message_memory_raw_csv'
    and status in ('importing', 'failed')
  returning * into v_batch;

  if not found then
    raise exception 'message memory raw import batch not found' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'ok', true,
    'batchId', v_batch.id,
    'status', v_batch.status
  );
end;
$$;

comment on function public.fail_recovery_whatsapp_message_memory_raw_import(uuid, text) is
  'Marks a chunked WhatsApp Message Memory raw Message import batch as failed with a truncated safe error message.';

revoke all on function public.start_recovery_whatsapp_message_memory_raw_import(text, bigint, text, jsonb) from public;
revoke execute on function public.start_recovery_whatsapp_message_memory_raw_import(text, bigint, text, jsonb) from anon;
grant execute on function public.start_recovery_whatsapp_message_memory_raw_import(text, bigint, text, jsonb) to authenticated;

revoke all on function public.append_recovery_whatsapp_message_memory_raw_import_rows(uuid, jsonb) from public;
revoke execute on function public.append_recovery_whatsapp_message_memory_raw_import_rows(uuid, jsonb) from anon;
grant execute on function public.append_recovery_whatsapp_message_memory_raw_import_rows(uuid, jsonb) to authenticated;

revoke all on function public.finish_recovery_whatsapp_message_memory_raw_import(uuid) from public;
revoke execute on function public.finish_recovery_whatsapp_message_memory_raw_import(uuid) from anon;
grant execute on function public.finish_recovery_whatsapp_message_memory_raw_import(uuid) to authenticated;

revoke all on function public.fail_recovery_whatsapp_message_memory_raw_import(uuid, text) from public;
revoke execute on function public.fail_recovery_whatsapp_message_memory_raw_import(uuid, text) from anon;
grant execute on function public.fail_recovery_whatsapp_message_memory_raw_import(uuid, text) to authenticated;
