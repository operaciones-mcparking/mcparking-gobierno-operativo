begin;

do $$
begin
  if to_regclass('ops_orchestrator.orchestrator_jobs') is null then
    raise exception 'Missing table ops_orchestrator.orchestrator_jobs';
  end if;
end;
$$;

create or replace function public.orchestrator_list_jobs_page(
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns setof ops_orchestrator.orchestrator_jobs
language sql
security definer
set search_path = ''
as $$
  select j.*
  from ops_orchestrator.orchestrator_jobs as j
  where
    (p_before_created_at is null and p_before_id is null)
    or (
      p_before_created_at is not null
      and p_before_id is not null
      and (
        j.created_at < p_before_created_at
        or (j.created_at = p_before_created_at and j.id < p_before_id)
      )
    )
  order by j.created_at desc, j.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function public.orchestrator_list_jobs_page(integer, timestamptz, uuid) from public;
revoke execute on function public.orchestrator_list_jobs_page(integer, timestamptz, uuid) from anon;
revoke execute on function public.orchestrator_list_jobs_page(integer, timestamptz, uuid) from authenticated;
grant execute on function public.orchestrator_list_jobs_page(integer, timestamptz, uuid) to service_role;

create or replace function public.orchestrator_get_job_by_id(p_job_id uuid)
returns setof ops_orchestrator.orchestrator_jobs
language sql
security definer
set search_path = ''
as $$
  select j.*
  from ops_orchestrator.orchestrator_jobs as j
  where j.id = p_job_id
  limit 1;
$$;

revoke all on function public.orchestrator_get_job_by_id(uuid) from public;
revoke execute on function public.orchestrator_get_job_by_id(uuid) from anon;
revoke execute on function public.orchestrator_get_job_by_id(uuid) from authenticated;
grant execute on function public.orchestrator_get_job_by_id(uuid) to service_role;

commit;