-- Transactional administrative deletion for one explicitly confirmed process.
-- Prepared for manual review. Do not apply before approval.

begin;

create or replace function public.delete_process_permanently(
  p_process_id uuid,
  p_confirmation_name text
)
returns table (process_id uuid, process_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_process_name text;
begin
  if p_process_id is null or nullif(btrim(p_confirmation_name), '') is null then
    raise exception 'Process id and exact confirmation name are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('delete_process_permanently:' || p_process_id::text, 0));

  select processes.name into v_process_name
  from public.processes
  where processes.id = p_process_id
  for update;

  if not found then
    raise exception 'Process not found';
  end if;

  if p_confirmation_name is distinct from v_process_name then
    raise exception 'Confirmation name does not match process name';
  end if;

  delete from public.process_versions where process_versions.process_id = p_process_id;
  delete from public.process_documents where process_documents.process_id = p_process_id;
  delete from public.process_role_profiles where process_role_profiles.process_id = p_process_id;
  delete from public.processes where processes.id = p_process_id;

  if found then
    return query select p_process_id, v_process_name;
  end if;

  raise exception 'Process could not be deleted';
end;
$$;

revoke all on function public.delete_process_permanently(uuid, text) from public;
revoke execute on function public.delete_process_permanently(uuid, text) from anon;
revoke execute on function public.delete_process_permanently(uuid, text) from authenticated;
grant execute on function public.delete_process_permanently(uuid, text) to service_role;

commit;