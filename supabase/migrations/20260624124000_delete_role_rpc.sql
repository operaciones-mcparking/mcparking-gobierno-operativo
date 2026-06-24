create or replace function public.delete_role_for_mvp(target_role_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  role_exists boolean;
begin
  select exists (
    select 1
    from public.roles
    where id = target_role_id
  )
  into role_exists;

  if not role_exists then
    return false;
  end if;

  delete from public.person_roles
  where role_id = target_role_id;

  delete from public.process_roles
  where role_id = target_role_id;

  update public.systems
  set owner_role_id = null
  where owner_role_id = target_role_id;

  update public.risks
  set role_id = null
  where role_id = target_role_id;

  update public.controls
  set owner_role_id = null
  where owner_role_id = target_role_id;

  delete from public.roles
  where id = target_role_id;

  return not exists (
    select 1
    from public.roles
    where id = target_role_id
  );
end;
$$;

grant execute on function public.delete_role_for_mvp(uuid) to anon, authenticated;
