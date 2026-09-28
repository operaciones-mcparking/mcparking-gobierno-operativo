-- Productive provisioning: review and approve separately after migration 160000.
-- Password assignment must use psql \password and is never stored in this file.
begin;

do $preflight$
begin
  if exists (select 1 from pg_catalog.pg_roles
             where rolname = 'customer_360_boleta_analytics_runner_login') then
    raise exception 'LOGIN already exists; stop without changing it';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'customer_360_boleta_analytics_runner'
      and not rolcanlogin and not rolsuper and not rolbypassrls
      and not rolcreatedb and not rolcreaterole and not rolreplication
  ) then
    raise exception 'Installed BOLETA capability role contract missing';
  end if;
end
$preflight$;

create role customer_360_boleta_analytics_runner_login
  login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
  password null;

do $membership$
begin
  if pg_catalog.current_setting('server_version_num')::integer >= 160000 then
    execute 'grant customer_360_boleta_analytics_runner
      to customer_360_boleta_analytics_runner_login
      with inherit true, set false, admin false';
  else
    execute 'grant customer_360_boleta_analytics_runner
      to customer_360_boleta_analytics_runner_login';
  end if;
end
$membership$;

do $contract$
declare
  login_oid oid;
  capability_oid oid;
  options_ok boolean;
begin
  select oid into login_oid from pg_catalog.pg_roles
  where rolname = 'customer_360_boleta_analytics_runner_login'
    and rolcanlogin and rolinherit and not rolsuper and not rolbypassrls
    and not rolcreatedb and not rolcreaterole and not rolreplication;
  select oid into capability_oid from pg_catalog.pg_roles
  where rolname = 'customer_360_boleta_analytics_runner';
  if login_oid is null or capability_oid is null
    or (select count(*) from pg_catalog.pg_auth_members where member = login_oid) <> 1
    or not exists (
      select 1 from pg_catalog.pg_auth_members
      where roleid = capability_oid and member = login_oid and not admin_option
    )
    or not pg_catalog.pg_has_role(login_oid, capability_oid, 'USAGE') then
    raise exception 'LOGIN attributes or membership mismatch';
  end if;
  if pg_catalog.current_setting('server_version_num')::integer >= 160000 then
    execute 'select inherit_option and not set_option
      from pg_catalog.pg_auth_members where roleid = $1 and member = $2'
      into strict options_ok using capability_oid, login_oid;
    if options_ok is not true then
      raise exception 'Membership INHERIT/SET options mismatch';
    end if;
  end if;
end
$contract$;

commit;
