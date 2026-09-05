begin;

alter table public.customer_source_bookings_mcp_eap
  drop constraint customer_source_bookings_mcp_eap_booking_status_check;

comment on column public.customer_source_bookings_mcp_eap.booking_status is
  'Current integer BookingStatus from mcp_Buchungen. Only values 1 and 8 are commercially valid.';

create or replace function public.import_customer_source_bookings_mcp_eap_m2m(
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict_rows integer := 0;
  v_deactivated_rows integer := 0;
  v_existing public.customer_source_bookings_mcp_eap%rowtype;
  v_existing_is_valid boolean;
  v_ignored_invalid_rows integer := 0;
  v_input public.customer_source_bookings_mcp_eap%rowtype;
  v_input_is_valid boolean;
  v_inserted_rows integer := 0;
  v_invalid_rows integer := 0;
  v_reactivated_rows integer := 0;
  v_row jsonb;
  v_rows_received integer;
  v_unchanged_rows integer := 0;
  v_updated_rows integer := 0;
begin
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = '22023';
  end if;

  v_rows_received := pg_catalog.jsonb_array_length(p_rows);
  if v_rows_received < 1 or v_rows_received > 500 then
    raise exception 'p_rows must contain between 1 and 500 rows' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_source_bookings_mcp_eap_sync', 0)
  );

  for v_row in select value from pg_catalog.jsonb_array_elements(p_rows)
  loop
    begin
      v_input := pg_catalog.jsonb_populate_record(
        null::public.customer_source_bookings_mcp_eap,
        v_row
      );
    exception when others then
      v_invalid_rows := v_invalid_rows + 1;
      continue;
    end;

    if v_input.source is distinct from 'MCP_EAP'
      or v_input.source_row_id is null
      or v_input.source_row_id <= 0
      or v_input.source_booking_code is null
      or v_input.source_customer_id is null
      or v_input.source_created_at is null
      or v_input.booking_status is null
      or v_input.website_source not in (1, 2, 4)
      or v_input.row_hash is null
      or v_input.row_hash !~ '^[0-9a-f]{64}$'
    then
      v_invalid_rows := v_invalid_rows + 1;
      continue;
    end if;

    if (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(p_rows) duplicate_row
      where duplicate_row->>'source_row_id' = v_input.source_row_id::text
    ) > 1 then
      v_conflict_rows := v_conflict_rows + 1;
      continue;
    end if;

    v_input_is_valid := v_input.booking_status in (1, 8);

    select source_row.*
    into v_existing
    from public.customer_source_bookings_mcp_eap source_row
    where source_row.source = 'MCP_EAP'
      and source_row.source_row_id = v_input.source_row_id
    for update;

    if not found then
      if not v_input_is_valid then
        v_ignored_invalid_rows := v_ignored_invalid_rows + 1;
        continue;
      end if;

      insert into public.customer_source_bookings_mcp_eap (
        source, source_row_id, source_booking_code, source_customer_id,
        phone_raw, phone_normalized, email_raw, email_normalized,
        plate_raw, plate_normalized, source_created_at, planned_arrival_at,
        planned_departure_at, booking_status, paying_status, website_source,
        parking_code_raw, brand_normalized, parking_normalized,
        source_total_amount, booking_paid, promotion_code,
        promotion_discount_amount, duration_days, passenger_count,
        sub_days_used, is_pack, row_hash
      ) values (
        v_input.source, v_input.source_row_id, v_input.source_booking_code, v_input.source_customer_id,
        v_input.phone_raw, v_input.phone_normalized, v_input.email_raw, v_input.email_normalized,
        v_input.plate_raw, v_input.plate_normalized, v_input.source_created_at, v_input.planned_arrival_at,
        v_input.planned_departure_at, v_input.booking_status, v_input.paying_status, v_input.website_source,
        v_input.parking_code_raw, v_input.brand_normalized, v_input.parking_normalized,
        v_input.source_total_amount, v_input.booking_paid, v_input.promotion_code,
        v_input.promotion_discount_amount, v_input.duration_days, v_input.passenger_count,
        v_input.sub_days_used, v_input.is_pack, v_input.row_hash
      );
      v_inserted_rows := v_inserted_rows + 1;
      continue;
    end if;

    v_existing_is_valid := v_existing.booking_status in (1, 8);

    if v_existing.row_hash = v_input.row_hash then
      v_unchanged_rows := v_unchanged_rows + 1;
      continue;
    end if;

    update public.customer_source_bookings_mcp_eap target
    set source_booking_code = v_input.source_booking_code,
        source_customer_id = v_input.source_customer_id,
        phone_raw = v_input.phone_raw,
        phone_normalized = v_input.phone_normalized,
        email_raw = v_input.email_raw,
        email_normalized = v_input.email_normalized,
        plate_raw = v_input.plate_raw,
        plate_normalized = v_input.plate_normalized,
        source_created_at = v_input.source_created_at,
        planned_arrival_at = v_input.planned_arrival_at,
        planned_departure_at = v_input.planned_departure_at,
        booking_status = v_input.booking_status,
        paying_status = v_input.paying_status,
        website_source = v_input.website_source,
        parking_code_raw = v_input.parking_code_raw,
        brand_normalized = v_input.brand_normalized,
        parking_normalized = v_input.parking_normalized,
        source_total_amount = v_input.source_total_amount,
        booking_paid = v_input.booking_paid,
        promotion_code = v_input.promotion_code,
        promotion_discount_amount = v_input.promotion_discount_amount,
        duration_days = v_input.duration_days,
        passenger_count = v_input.passenger_count,
        sub_days_used = v_input.sub_days_used,
        is_pack = v_input.is_pack,
        row_hash = v_input.row_hash,
        source_synced_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where target.source = 'MCP_EAP'
      and target.source_row_id = v_input.source_row_id;

    if v_existing_is_valid and not v_input_is_valid then
      v_deactivated_rows := v_deactivated_rows + 1;
    elsif not v_existing_is_valid and v_input_is_valid then
      v_reactivated_rows := v_reactivated_rows + 1;
    else
      v_updated_rows := v_updated_rows + 1;
    end if;
  end loop;

  if v_rows_received <> v_inserted_rows + v_updated_rows + v_unchanged_rows
    + v_deactivated_rows + v_reactivated_rows + v_ignored_invalid_rows
    + v_invalid_rows + v_conflict_rows
  then
    raise exception 'MCP/EAP import accounting mismatch';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'rowsReceived', v_rows_received,
    'insertedRows', v_inserted_rows,
    'updatedRows', v_updated_rows,
    'unchangedRows', v_unchanged_rows,
    'deactivatedRows', v_deactivated_rows,
    'reactivatedRows', v_reactivated_rows,
    'ignoredInvalidRows', v_ignored_invalid_rows,
    'invalidRows', v_invalid_rows,
    'conflictRows', v_conflict_rows
  );
end;
$$;

revoke all on function public.import_customer_source_bookings_mcp_eap_m2m(jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.import_customer_source_bookings_mcp_eap_m2m(jsonb)
  to service_role;

commit;
