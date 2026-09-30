-- Provision manually only after the capability migration and production approval.
-- Assign the password later with \password in a private administrative psql session.
\set ON_ERROR_STOP on

begin;

do $preflight$
begin
  if exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'customer_window_360_reader_login'
  ) then
    raise exception 'Customer 360 LOGIN already exists; stop without changing it';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'customer_window_360_reader'
      and not rolcanlogin
      and not rolsuper
      and rolinherit
      and not rolcreatedb
      and not rolcreaterole
      and not rolreplication
      and not rolbypassrls
  ) then
    raise exception 'Certified Customer 360 capability contract is missing';
  end if;
end
$preflight$;

create role customer_window_360_reader_login
  login
  password null
  nosuperuser
  inherit
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls
  connection limit 20;

grant customer_window_360_reader
  to customer_window_360_reader_login
  with inherit true, set false, admin false;

alter role customer_window_360_reader_login
  set default_transaction_read_only = 'on';
alter role customer_window_360_reader_login
  set statement_timeout = '8s';
alter role customer_window_360_reader_login
  set lock_timeout = '2s';
alter role customer_window_360_reader_login
  set idle_in_transaction_session_timeout = '10s';

do $contract$
declare
  capability_oid oid;
  login_oid oid;
  settings text[];
begin
  select oid into login_oid
  from pg_catalog.pg_roles
  where rolname = 'customer_window_360_reader_login'
    and rolcanlogin
    and not rolsuper
    and rolinherit
    and not rolcreatedb
    and not rolcreaterole
    and not rolreplication
    and not rolbypassrls
    and rolconnlimit = 20;

  select oid into capability_oid
  from pg_catalog.pg_roles
  where rolname = 'customer_window_360_reader';

  select setconfig into settings
  from pg_catalog.pg_db_role_setting
  where setdatabase = 0 and setrole = login_oid;

  if login_oid is null
    or capability_oid is null
    or (select count(*) from pg_catalog.pg_auth_members where member = login_oid) <> 1
    or not exists (
      select 1 from pg_catalog.pg_auth_members
      where roleid = capability_oid
        and member = login_oid
        and inherit_option
        and not set_option
        and not admin_option
    )
    or settings is null
    or not settings @> array[
      'default_transaction_read_only=on',
      'statement_timeout=8s',
      'lock_timeout=2s',
      'idle_in_transaction_session_timeout=10s'
    ]::text[]
  then
    raise exception 'Customer 360 LOGIN contract mismatch';
  end if;
end
$contract$;

commit;
