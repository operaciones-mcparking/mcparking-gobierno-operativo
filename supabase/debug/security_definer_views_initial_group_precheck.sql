\set ON_ERROR_STOP on

begin read only;
set local statement_timeout = '15000ms';
set local lock_timeout = '1000ms';

select
  c.relname as view_name,
  pg_get_userbyid(c.relowner) as owner,
  c.reloptions,
  c.relacl,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_role_select,
  pg_get_viewdef(c.oid, true) as definition
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname in ('v_role_assignments', 'organizational_roles')
order by c.relname;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_role_select
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('areas', 'companies', 'people', 'person_roles', 'roles')
order by c.relname;

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in ('areas', 'companies', 'people', 'person_roles', 'roles')
order by tablename, policyname;

rollback;
