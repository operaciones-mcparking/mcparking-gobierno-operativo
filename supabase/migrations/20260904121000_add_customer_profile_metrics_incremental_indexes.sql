create index concurrently if not exists customer_booking_profile_links_updated_cursor_idx
  on public.customer_booking_profile_links(updated_at, id);

create index concurrently if not exists customer_source_bookings_okp_metrics_updated_cursor_idx
  on public.customer_source_bookings_okp(updated_at, source_row_id);

create index concurrently if not exists customer_source_bookings_mcp_eap_updated_cursor_idx
  on public.customer_source_bookings_mcp_eap(updated_at, source_row_id);

create index concurrently if not exists customer_profiles_updated_cursor_idx
  on public.customer_profiles(updated_at, id);
