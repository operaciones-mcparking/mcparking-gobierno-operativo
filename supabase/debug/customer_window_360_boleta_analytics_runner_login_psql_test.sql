-- READ ONLY except advisory lock state, which is session-scoped and explicitly released.
-- Run with the dedicated LOGIN after private password provisioning.
\set ON_ERROR_STOP on

do $contract$
declare
  forbidden text;
begin
  if current_user <> 'customer_360_boleta_analytics_runner_login'
    or session_user <> 'customer_360_boleta_analytics_runner_login'
    or not pg_catalog.pg_has_role(current_user,
      'customer_360_boleta_analytics_runner', 'USAGE') then
    raise exception 'Dedicated LOGIN identity or capability mismatch';
  end if;
  if not pg_catalog.has_database_privilege(current_user,
      pg_catalog.current_database(), 'CONNECT')
    or not pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE')
    or exists (
      select 1
      from pg_catalog.pg_database database
      cross join lateral pg_catalog.aclexplode(coalesce(database.datacl,
        pg_catalog.acldefault('d', database.datdba))) acl
      where database.datname = pg_catalog.current_database()
        and acl.privilege_type = 'TEMPORARY'
        and acl.grantee in (
          (select role.oid from pg_catalog.pg_roles role where role.rolname = current_user),
          (select role.oid from pg_catalog.pg_roles role
            where role.rolname = 'customer_360_boleta_analytics_runner')
        )
    ) then
    raise exception 'Dedicated LOGIN database/schema privilege contract mismatch';
  end if;
  if not pg_catalog.has_function_privilege(current_user,
      'public.customer_window_refresh_boleta_analytics_v1_m2m(uuid[],integer,text)', 'EXECUTE')
    or not pg_catalog.has_function_privilege(current_user,
      'public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean)', 'EXECUTE')
    or pg_catalog.has_function_privilege(current_user,
      'public.customer_window_calculate_boleta_analytics_v1(uuid[])', 'EXECUTE')
    or pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
    or pg_catalog.pg_has_role(current_user, 'service_role', 'USAGE') then
    raise exception 'Dedicated LOGIN privilege contract mismatch';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'customer_related_review_%'
      and pg_catalog.has_function_privilege(current_user, procedure.oid, 'EXECUTE')
  ) then
    raise exception 'Dedicated LOGIN can execute a Related Review function';
  end if;
  foreach forbidden in array array[
    'customer_profiles', 'customer_booking_profile_links',
    'customer_source_bookings_mcp_eap', 'customer_source_bookings_okp',
    'customer_profile_boleta_analytics',
    'customer_profile_boleta_discount_codes',
    'customer_profile_boleta_analytics_incremental_state'
  ] loop
    if pg_catalog.has_table_privilege(current_user,
      pg_catalog.format('public.%I', forbidden), 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Forbidden table privilege exists on %', forbidden;
    end if;
  end loop;
end
$contract$;

select public.customer_window_boleta_analytics_v1_refresh_status_m2m(false) is not null
  as status_rpc_ok;

select
  pg_catalog.has_database_privilege(current_user, pg_catalog.current_database(), 'TEMP')
    as effective_temp,
  exists (
    select 1 from pg_catalog.pg_database database
    cross join lateral pg_catalog.aclexplode(coalesce(database.datacl,
      pg_catalog.acldefault('d', database.datdba))) acl
    where database.datname = pg_catalog.current_database()
      and acl.grantee = 0 and acl.privilege_type = 'TEMPORARY'
  ) as temp_via_public;

select pg_catalog.pg_try_advisory_lock(
  pg_catalog.hashtextextended('customer_window_boleta_analytics_v1_refresh', 0)
) as advisory_lock_acquired \gset

select :'advisory_lock_acquired'::boolean as advisory_lock_acquired;

select pg_catalog.pg_advisory_unlock(
  pg_catalog.hashtextextended('customer_window_boleta_analytics_v1_refresh', 0)
) as advisory_lock_released;

select true as login_psql_probe_ok;
