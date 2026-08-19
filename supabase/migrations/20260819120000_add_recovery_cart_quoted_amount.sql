begin;

do $$
begin
  if to_regclass('public.recovery_incomplete_bookings_import') is null then
    raise exception 'Missing table public.recovery_incomplete_bookings_import';
  end if;

  if to_regprocedure('public.import_recovery_incomplete_bookings(text,bigint,text,jsonb,jsonb)') is null then
    raise exception 'Missing function public.import_recovery_incomplete_bookings(text,bigint,text,jsonb,jsonb)';
  end if;
end
$$;

alter table public.recovery_incomplete_bookings_import
  add column quoted_amount numeric(12,2);

comment on column public.recovery_incomplete_bookings_import.quoted_amount is
  'Quoted CLP amount derived exclusively from BackendIncompleteBookings2.bform.price. Raw bform is not stored.';

alter function public.import_recovery_incomplete_bookings(text, bigint, text, jsonb, jsonb)
  rename to import_recovery_incomplete_bookings_without_quoted_amount;

revoke all on function public.import_recovery_incomplete_bookings_without_quoted_amount(text, bigint, text, jsonb, jsonb)
  from public;
revoke execute on function public.import_recovery_incomplete_bookings_without_quoted_amount(text, bigint, text, jsonb, jsonb)
  from anon;
revoke execute on function public.import_recovery_incomplete_bookings_without_quoted_amount(text, bigint, text, jsonb, jsonb)
  from authenticated;

create function public.import_recovery_incomplete_bookings(
  p_file_name text,
  p_file_size bigint,
  p_file_hash text,
  p_summary jsonb,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_batch_id uuid;
begin
  v_result := public.import_recovery_incomplete_bookings_without_quoted_amount(
    p_file_name,
    p_file_size,
    p_file_hash,
    p_summary,
    p_rows
  );

  v_batch_id := nullif(v_result->>'batchId', '')::uuid;

  with input_rows as (
    select
      row_data.ordinality as input_position,
      nullif(trim(row_data.value->>'source_id'), '') as source_id,
      case
        when jsonb_typeof(row_data.value->'quoted_amount') = 'number'
          and (row_data.value->>'quoted_amount')::numeric >= 0
          and scale((row_data.value->>'quoted_amount')::numeric) <= 2
          and (row_data.value->>'quoted_amount')::numeric <= 9999999999.99
        then (row_data.value->>'quoted_amount')::numeric(12,2)
        else null
      end as quoted_amount
    from jsonb_array_elements(p_rows) with ordinality as row_data(value, ordinality)
  ),
  first_input as (
    select source_id, quoted_amount
    from (
      select
        input_rows.*,
        row_number() over (partition by source_id order by input_position) as source_row_number
      from input_rows
      where source_id is not null
    ) ranked
    where source_row_number = 1
  ),
  quote_changes as (
    select
      target.id,
      target.quoted_amount as previous_quoted_amount,
      first_input.quoted_amount as current_quoted_amount
    from first_input
    join public.recovery_incomplete_bookings_import target
      on target.source_id = first_input.source_id
    join public.recovery_import_row_changes changes
      on changes.batch_id = v_batch_id
      and changes.source = 'carts'
      and changes.entity_id = target.id
      and changes.operation in ('inserted', 'updated')
    where target.quoted_amount is distinct from first_input.quoted_amount
  ),
  updated_quotes as (
    update public.recovery_incomplete_bookings_import target
    set quoted_amount = quote_changes.current_quoted_amount
    from quote_changes
    where target.id = quote_changes.id
    returning target.id
  )
  update public.recovery_import_row_changes changes
  set changed_fields = case
    when 'quoted_amount' = any(changes.changed_fields) then changes.changed_fields
    else array_append(changes.changed_fields, 'quoted_amount')
  end
  from updated_quotes
  where v_batch_id is not null
    and changes.batch_id = v_batch_id
    and changes.source = 'carts'
    and changes.entity_id = updated_quotes.id
    and changes.operation in ('inserted', 'updated');

  return v_result;
end;
$$;

comment on function public.import_recovery_incomplete_bookings(text, bigint, text, jsonb, jsonb) is
  'Imports normalized BackendIncompleteBookings2 rows and persists quoted_amount derived exclusively from bform.price while preserving the existing mutable source_id contract.';

revoke all on function public.import_recovery_incomplete_bookings(text, bigint, text, jsonb, jsonb)
  from public;
revoke execute on function public.import_recovery_incomplete_bookings(text, bigint, text, jsonb, jsonb)
  from anon;
grant execute on function public.import_recovery_incomplete_bookings(text, bigint, text, jsonb, jsonb)
  to authenticated;

commit;