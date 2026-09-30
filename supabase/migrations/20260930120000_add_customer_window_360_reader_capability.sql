do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'customer_window_360_reader') then
    create role customer_window_360_reader
      nologin
      nosuperuser
      inherit
      nocreatedb
      nocreaterole
      noreplication
      nobypassrls;
  end if;
end
$$;

grant connect on database postgres to customer_window_360_reader;
grant usage on schema public to customer_window_360_reader;
revoke create on schema public from customer_window_360_reader;

revoke all privileges on all tables in schema public from customer_window_360_reader;
revoke all privileges on all sequences in schema public from customer_window_360_reader;
revoke execute on all functions in schema public from customer_window_360_reader;

grant execute on function public.customer_window_360_v1_get_overview(jsonb)
  to customer_window_360_reader;
grant execute on function public.customer_window_360_v1_list_bookings(jsonb,integer,integer)
  to customer_window_360_reader;
grant execute on function public.customer_window_360_v1_list_observed_contacts(jsonb,text,integer,integer)
  to customer_window_360_reader;
grant execute on function public.customer_window_360_v1_get_boleta_analytics(jsonb)
  to customer_window_360_reader;
grant execute on function public.customer_window_360_v1_get_related_group_analytics(jsonb)
  to customer_window_360_reader;
grant execute on function public.customer_window_360_v1_get_global_review_overview(jsonb)
  to customer_window_360_reader;
grant execute on function public.customer_window_360_v1_list_global_review_bookings(jsonb,integer,integer)
  to customer_window_360_reader;
grant execute on function public.customer_window_360_v1_list_global_review_contacts(jsonb,text,integer,integer)
  to customer_window_360_reader;
grant execute on function public.customer_window_360_v1_get_global_review_analytics(jsonb)
  to customer_window_360_reader;
grant execute on function public.customer_window_360_v1_get_global_review_identity(jsonb)
  to customer_window_360_reader;

comment on role customer_window_360_reader is
  'NOLOGIN capability for the read-only Customer 360 V1 RPC allowlist.';
