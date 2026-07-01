-- Harden RBAC read access after moving /admin to authenticated server-side admin checks.
-- This migration does not change RBAC schema or data. It removes broad authenticated
-- reads from sensitive RBAC tables and sensitive reporting views.

-- The admin policies already created in the RBAC base migration use public.is_app_admin().
-- Keep those policies as the allowed path for /admin, and remove broad read policies.
drop policy if exists "permissions_read_authenticated" on public.permissions;
drop policy if exists "access_roles_read_authenticated" on public.access_roles;
drop policy if exists "access_role_permissions_read_authenticated" on public.access_role_permissions;
drop policy if exists "user_access_assignments_read_authenticated" on public.user_access_assignments;
drop policy if exists "permission_overrides_read_authenticated" on public.permission_overrides;

-- Ensure admin access remains available for the RBAC tables after broad reads are removed.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'permissions' and policyname = 'permissions_admin_all'
  ) then
    create policy "permissions_admin_all"
      on public.permissions for all to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'access_roles' and policyname = 'access_roles_admin_all'
  ) then
    create policy "access_roles_admin_all"
      on public.access_roles for all to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'access_role_permissions' and policyname = 'access_role_permissions_admin_all'
  ) then
    create policy "access_role_permissions_admin_all"
      on public.access_role_permissions for all to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_access_assignments' and policyname = 'user_access_assignments_admin_all'
  ) then
    create policy "user_access_assignments_admin_all"
      on public.user_access_assignments for all to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'permission_overrides' and policyname = 'permission_overrides_admin_all'
  ) then
    create policy "permission_overrides_admin_all"
      on public.permission_overrides for all to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;
end $$;

-- These views expose effective permissions, admin users, assignments and access scopes.
-- Sensitive RBAC views must not be exposed directly to anon/authenticated clients.
-- Access should go through server-side admin checks or a narrower API.
revoke select on public.v_person_access_assignments from anon, authenticated;
revoke select on public.v_person_effective_permissions from anon, authenticated;
revoke select on public.v_access_by_country from anon, authenticated;
revoke select on public.v_access_by_company from anon, authenticated;
revoke select on public.v_access_by_site from anon, authenticated;
revoke select on public.v_global_access_users from anon, authenticated;
revoke select on public.v_admin_access_users from anon, authenticated;

-- Also remove any execute grants that would let a normal client ask for a person's
-- effective permissions directly. Re-grant intentionally in a later migration only
-- if there is a server-side wrapper or a narrower user-self policy.
revoke execute on function public.person_effective_permissions(uuid) from anon, authenticated;
