begin;

do $$
begin
  if to_regclass('public.customer_source_bookings_okp') is null then
    raise exception 'Required table public.customer_source_bookings_okp does not exist';
  end if;
end;
$$;

create or replace function public.import_customer_source_bookings_okp_m2m(
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict_rows integer := 0;
  v_existing public.customer_source_bookings_okp%rowtype;
  v_input public.customer_source_bookings_okp%rowtype;
  v_inserted_rows integer := 0;
  v_row jsonb;
  v_unchanged_rows integer := 0;
  v_updated_rows integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 500 then
    raise exception 'p_rows must contain between 1 and 500 rows';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_source_bookings_okp_sync', 0)
  );

  for v_row in select value from pg_catalog.jsonb_array_elements(p_rows)
  loop
    v_input := pg_catalog.jsonb_populate_record(
      null::public.customer_source_bookings_okp,
      v_row
    );

    if v_input.source is distinct from 'OKP'
      or v_input.source_row_id is null
      or v_input.row_hash is null
      or v_input.row_hash !~ '^[0-9a-f]{64}$'
    then
      raise exception 'Invalid normalized OKP row';
    end if;

    if (
      select pg_catalog.count(*)
      from pg_catalog.jsonb_array_elements(p_rows) duplicate_row
      where duplicate_row->>'source_row_id' = v_input.source_row_id::text
    ) > 1 then
      v_conflict_rows := v_conflict_rows + 1;
      continue;
    end if;

    select *
    into v_existing
    from public.customer_source_bookings_okp
    where source = 'OKP'
      and source_row_id = v_input.source_row_id
    for update;

    if not found then
      insert into public.customer_source_bookings_okp (
        actual_checkin_at, actual_checkout_at, coupon_amount, coupon_code,
        discount_amount, email_normalized, email_raw, is_confirmed,
        is_inactive, is_pack, is_paid, j2_paquetes_raw, pack_code,
        pack_paid_days, pack_payload, pack_reference, parking_normalized,
        passenger_count, phone_normalized, phone_raw, planned_arrival_at,
        planned_departure_at, plate_normalized, plate_raw, row_hash, source,
        source_booking_code, source_created_at, source_row_id, source_site_id,
        source_total_amount, source_updated_at, status_raw,
        valor_reserva_amount, valor_reserva_raw
      ) values (
        v_input.actual_checkin_at, v_input.actual_checkout_at, v_input.coupon_amount, v_input.coupon_code,
        v_input.discount_amount, v_input.email_normalized, v_input.email_raw, v_input.is_confirmed,
        v_input.is_inactive, v_input.is_pack, v_input.is_paid, v_input.j2_paquetes_raw, v_input.pack_code,
        v_input.pack_paid_days, v_input.pack_payload, v_input.pack_reference, v_input.parking_normalized,
        v_input.passenger_count, v_input.phone_normalized, v_input.phone_raw, v_input.planned_arrival_at,
        v_input.planned_departure_at, v_input.plate_normalized, v_input.plate_raw, v_input.row_hash, v_input.source,
        v_input.source_booking_code, v_input.source_created_at, v_input.source_row_id, v_input.source_site_id,
        v_input.source_total_amount, v_input.source_updated_at, v_input.status_raw,
        v_input.valor_reserva_amount, v_input.valor_reserva_raw
      );
      v_inserted_rows := v_inserted_rows + 1;
    elsif v_existing.row_hash = v_input.row_hash then
      v_unchanged_rows := v_unchanged_rows + 1;
    else
      update public.customer_source_bookings_okp
      set actual_checkin_at = v_input.actual_checkin_at,
          actual_checkout_at = v_input.actual_checkout_at,
          coupon_amount = v_input.coupon_amount,
          coupon_code = v_input.coupon_code,
          discount_amount = v_input.discount_amount,
          email_normalized = v_input.email_normalized,
          email_raw = v_input.email_raw,
          is_confirmed = v_input.is_confirmed,
          is_inactive = v_input.is_inactive,
          is_pack = v_input.is_pack,
          is_paid = v_input.is_paid,
          j2_paquetes_raw = v_input.j2_paquetes_raw,
          pack_code = v_input.pack_code,
          pack_paid_days = v_input.pack_paid_days,
          pack_payload = v_input.pack_payload,
          pack_reference = v_input.pack_reference,
          parking_normalized = v_input.parking_normalized,
          passenger_count = v_input.passenger_count,
          phone_normalized = v_input.phone_normalized,
          phone_raw = v_input.phone_raw,
          planned_arrival_at = v_input.planned_arrival_at,
          planned_departure_at = v_input.planned_departure_at,
          plate_normalized = v_input.plate_normalized,
          plate_raw = v_input.plate_raw,
          row_hash = v_input.row_hash,
          source_booking_code = v_input.source_booking_code,
          source_created_at = v_input.source_created_at,
          source_site_id = v_input.source_site_id,
          source_total_amount = v_input.source_total_amount,
          source_updated_at = v_input.source_updated_at,
          status_raw = v_input.status_raw,
          valor_reserva_amount = v_input.valor_reserva_amount,
          valor_reserva_raw = v_input.valor_reserva_raw,
          source_synced_at = pg_catalog.clock_timestamp(),
          updated_at = pg_catalog.clock_timestamp()
      where source = 'OKP'
        and source_row_id = v_input.source_row_id;
      v_updated_rows := v_updated_rows + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'conflictRows', v_conflict_rows,
    'insertedRows', v_inserted_rows,
    'unchangedRows', v_unchanged_rows,
    'updatedRows', v_updated_rows
  );
end;
$$;

comment on function public.import_customer_source_bookings_okp_m2m(jsonb) is
  'Atomically converges normalized OKP source rows. Service-role only.';

revoke all on function public.import_customer_source_bookings_okp_m2m(jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.import_customer_source_bookings_okp_m2m(jsonb)
to service_role;

commit;