create or replace function public.is_app_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.user_id = auth.uid()
      and up.app_role = 'admin'::public.app_role
      and up.status = 'active'::public.record_status
  );
$$;

grant execute on function public.is_app_admin() to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_admin_all'
  ) then
    create policy "user_profiles_admin_all"
      on public.user_profiles
      for all
      to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_site_access'
      and policyname = 'user_site_access_admin_all'
  ) then
    create policy "user_site_access_admin_all"
      on public.user_site_access
      for all
      to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'auth_email_allowlist'
      and policyname = 'auth_email_allowlist_admin_all'
  ) then
    create policy "auth_email_allowlist_admin_all"
      on public.auth_email_allowlist
      for all
      to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'auth_domain_allowlist'
      and policyname = 'auth_domain_allowlist_admin_all'
  ) then
    create policy "auth_domain_allowlist_admin_all"
      on public.auth_domain_allowlist
      for all
      to authenticated
      using (public.is_app_admin())
      with check (public.is_app_admin());
  end if;
end $$;
