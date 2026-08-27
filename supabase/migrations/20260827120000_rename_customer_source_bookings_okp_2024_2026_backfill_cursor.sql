begin;

alter function public.advance_customer_source_bookings_okp_2024_2026_backfill_cursor_(
  timestamp without time zone,
  bigint,
  timestamp without time zone,
  bigint
) rename to advance_okp_2024_2026_backfill_cursor_m2m;

commit;
