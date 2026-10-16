begin;

do $$
declare
  target_table text;
  target_tables constant text[] := array[
    'controls',
    'countries',
    'people',
    'person_roles',
    'process_roles',
    'process_systems',
    'processes',
    'risks',
    'roles',
    'sites',
    'subprocesses',
    'systems'
  ];
begin
  foreach target_table in array target_tables
  loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise exception 'Expected table public.% does not exist', target_table;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = target_table
        and c.relkind in ('r', 'p')
        and c.relrowsecurity
    ) then
      raise exception 'Expected RLS to be enabled on public.%', target_table;
    end if;

    -- Preserve the existing public read policy and the anon SELECT contract.
    execute format(
      'drop policy if exists %I on public.%I',
      'mvp_' || target_table || '_write',
      target_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      'admin_' || target_table || '_insert',
      target_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_app_admin())',
      'admin_' || target_table || '_insert',
      target_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      'admin_' || target_table || '_update',
      target_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin())',
      'admin_' || target_table || '_update',
      target_table
    );

    execute format(
      'drop policy if exists %I on public.%I',
      'admin_' || target_table || '_delete',
      target_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_app_admin())',
      'admin_' || target_table || '_delete',
      target_table
    );

    -- Remove direct and inherited PUBLIC privileges, then restore read only for anon.
    execute format(
      'revoke all privileges on table public.%I from public, anon',
      target_table
    );
    execute format(
      'grant select on table public.%I to anon',
      target_table
    );

    -- Preserve the current application and server-side contracts explicitly.
    execute format(
      'grant select, insert, update, delete on table public.%I to authenticated, service_role',
      target_table
    );
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(target_tables)
      and p.cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      and p.roles && array['public', 'anon']::name[]
  ) then
    raise exception 'An anonymous/public write policy remains on an organizational table';
  end if;
end
$$;

commit;
