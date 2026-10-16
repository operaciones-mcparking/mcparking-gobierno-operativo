\set ON_ERROR_STOP on

begin read only;
set local statement_timeout = '15000ms';
set local lock_timeout = '1000ms';

with checks as (
  select
    c.relname as view_name,
    coalesce(c.reloptions @> array['security_invoker=true'], false) as security_invoker,
    coalesce(c.reloptions @> array['security_barrier=true'], false) as security_barrier,
    not has_table_privilege('anon', c.oid, 'SELECT') as anon_blocked,
    has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
    has_table_privilege('service_role', c.oid, 'SELECT') as service_role_select
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname in ('v_role_assignments', 'organizational_roles')
)
select
  count(*) = 2 as both_views_present,
  bool_and(security_invoker) as all_security_invoker,
  bool_and(security_barrier) as all_security_barrier,
  bool_and(anon_blocked) as anon_blocked,
  bool_and(authenticated_select) as authenticated_contract_present,
  bool_and(service_role_select) as service_contract_present
from checks;

select tablename, policyname, roles, cmd, qual
from pg_catalog.pg_policies
where schemaname = 'public'
  and (
    (tablename = 'areas' and policyname = 'admin_areas_select')
    or (tablename = 'companies' and policyname = 'admin_companies_select')
  )
order by tablename;

-- Role-behavior acceptance criteria for an isolated/staging execution:
-- anon: SELECT is denied by the view ACL.
-- authenticated non-admin: SELECT succeeds and returns zero rows.
-- authenticated active admin: result matches the pre-migration view exactly.
-- service_role: result matches the pre-migration view exactly.

rollback;
