-- READ ONLY. Run as an administrative role after LOGIN/password provisioning.
with roles as (
  select role.oid, role.rolname, role.rolcanlogin, role.rolinherit,
    role.rolsuper, role.rolcreatedb, role.rolcreaterole, role.rolreplication,
    role.rolbypassrls
  from pg_catalog.pg_roles role
  where role.rolname in (
    'customer_360_boleta_analytics_runner',
    'customer_360_boleta_analytics_runner_login'
  )
), membership as (
  select capability.rolname as capability_role, login.rolname as login_role,
    member.admin_option, member.inherit_option, member.set_option
  from pg_catalog.pg_auth_members member
  join pg_catalog.pg_roles capability on capability.oid = member.roleid
  join pg_catalog.pg_roles login on login.oid = member.member
  where capability.rolname = 'customer_360_boleta_analytics_runner'
    and login.rolname = 'customer_360_boleta_analytics_runner_login'
)
select
  (select count(*) from roles) = 2 as roles_exist,
  (select not rolcanlogin and not rolsuper and not rolbypassrls
     and not rolcreatedb and not rolcreaterole and not rolreplication
   from roles where rolname = 'customer_360_boleta_analytics_runner') as capability_attributes_ok,
  (select rolcanlogin and rolinherit and not rolsuper and not rolbypassrls
     and not rolcreatedb and not rolcreaterole and not rolreplication
   from roles where rolname = 'customer_360_boleta_analytics_runner_login') as login_attributes_ok,
  (select count(*) from membership) = 1 as membership_count_ok,
  coalesce((select not admin_option from membership), false) as membership_admin_disabled,
  coalesce((select inherit_option from membership), false) as membership_inherit_enabled,
  coalesce((select not set_option from membership), false) as membership_set_disabled,
  pg_catalog.has_database_privilege('customer_360_boleta_analytics_runner_login',
    pg_catalog.current_database(), 'CONNECT') as database_connect,
  not exists (
    select 1
    from pg_catalog.pg_database database
    cross join lateral pg_catalog.aclexplode(coalesce(database.datacl,
      pg_catalog.acldefault('d', database.datdba))) acl
    where database.datname = pg_catalog.current_database()
      and acl.privilege_type = 'TEMPORARY'
      and acl.grantee in (
        (select oid from roles where rolname = 'customer_360_boleta_analytics_runner'),
        (select oid from roles where rolname = 'customer_360_boleta_analytics_runner_login')
      )
  ) as database_temp_not_explicit,
  exists (
    select 1
    from pg_catalog.pg_database database
    cross join lateral pg_catalog.aclexplode(coalesce(database.datacl,
      pg_catalog.acldefault('d', database.datdba))) acl
    where database.datname = pg_catalog.current_database()
      and acl.grantee = 0 and acl.privilege_type = 'TEMPORARY'
  ) as database_temp_via_public,
  pg_catalog.has_schema_privilege('customer_360_boleta_analytics_runner_login',
    'public', 'USAGE') as schema_usage,
  pg_catalog.has_function_privilege('customer_360_boleta_analytics_runner_login',
    'public.customer_window_refresh_boleta_analytics_v1_m2m(uuid[],integer,text)', 'EXECUTE')
    as refresh_execute,
  pg_catalog.has_function_privilege('customer_360_boleta_analytics_runner_login',
    'public.customer_window_boleta_analytics_v1_refresh_status_m2m(boolean)', 'EXECUTE')
    as status_execute,
  not pg_catalog.has_function_privilege('customer_360_boleta_analytics_runner_login',
    'public.customer_window_calculate_boleta_analytics_v1(uuid[])', 'EXECUTE')
    as calculator_execute_denied,
  not pg_catalog.has_table_privilege('customer_360_boleta_analytics_runner_login',
    'public.customer_profile_boleta_analytics', 'SELECT,INSERT,UPDATE,DELETE')
    as analytics_table_access_denied,
  not pg_catalog.has_schema_privilege('customer_360_boleta_analytics_runner_login',
    'public', 'CREATE') as schema_create_denied,
  not pg_catalog.pg_has_role('customer_360_boleta_analytics_runner_login',
    'service_role', 'USAGE') as service_role_membership_denied,
  not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'customer_related_review_%'
      and pg_catalog.has_function_privilege(
        'customer_360_boleta_analytics_runner_login', procedure.oid, 'EXECUTE')
  ) as related_review_execute_denied;
