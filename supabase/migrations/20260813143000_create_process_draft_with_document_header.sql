-- Create process drafts atomically with their reserved document code.
-- Prepared for manual application after the document header schema.

begin;

do $$
begin
  if to_regprocedure('public.reserve_process_code()') is null then
    raise exception 'Expected public.reserve_process_code() before creating process drafts';
  end if;

  if to_regclass('public.v_role_dictionary') is null then
    raise exception 'Expected public.v_role_dictionary before validating process owners';
  end if;

  if to_regprocedure('public.create_process_draft_with_document_header(jsonb,uuid)') is not null then
    raise exception 'Unexpected function public.create_process_draft_with_document_header(jsonb,uuid) already exists';
  end if;
end $$;

create function public.create_process_draft_with_document_header(
  p_process jsonb,
  p_owner_role_id uuid default null
)
returns table (
  process_id uuid,
  process_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_process_id uuid;
  v_process_code text;
begin
  if jsonb_typeof(p_process) <> 'object' then
    raise exception 'Process draft payload must be a JSON object';
  end if;

  if nullif(btrim(p_process->>'name'), '') is null then
    raise exception 'Process name is required';
  end if;

  if nullif(p_process->>'company_id', '') is null then
    raise exception 'Process company is required';
  end if;

  if p_owner_role_id is not null and not exists (
    select 1
    from public.v_role_dictionary role_dictionary
    where role_dictionary.role_id = p_owner_role_id
      and role_dictionary.role_status = 'active'
  ) then
    raise exception 'Selected process owner is not an active official role';
  end if;

  v_process_code := public.reserve_process_code();

  insert into public.processes (
    area_id,
    basic_kpi,
    company_id,
    country_id,
    criticality,
    description,
    documentation_status,
    effective_date,
    expected_result,
    inputs_providers,
    is_global,
    is_replicable,
    name,
    objective,
    operating_company_id,
    operating_site_id,
    outputs_clients,
    owner_company_id,
    owner_role_id,
    owner_site_id,
    pdca_act,
    pdca_check,
    pdca_do,
    pdca_plan,
    process_code,
    process_end,
    process_start,
    process_type,
    scope,
    status
  )
  values (
    nullif(p_process->>'area_id', '')::uuid,
    nullif(p_process->>'basic_kpi', ''),
    (p_process->>'company_id')::uuid,
    nullif(p_process->>'country_id', '')::uuid,
    coalesce(nullif(p_process->>'criticality', ''), 'medium')::public.criticality_level,
    nullif(p_process->>'description', ''),
    'draft'::public.documentation_status,
    nullif(p_process->>'effective_date', '')::date,
    nullif(p_process->>'expected_result', ''),
    nullif(p_process->>'inputs_providers', ''),
    false,
    false,
    btrim(p_process->>'name'),
    nullif(p_process->>'objective', ''),
    (p_process->>'company_id')::uuid,
    nullif(p_process->>'operating_site_id', '')::uuid,
    nullif(p_process->>'outputs_clients', ''),
    (p_process->>'company_id')::uuid,
    p_owner_role_id,
    nullif(p_process->>'owner_site_id', '')::uuid,
    nullif(p_process->>'pdca_act', ''),
    nullif(p_process->>'pdca_check', ''),
    nullif(p_process->>'pdca_do', ''),
    nullif(p_process->>'pdca_plan', ''),
    v_process_code,
    nullif(p_process->>'process_end', ''),
    nullif(p_process->>'process_start', ''),
    coalesce(nullif(p_process->>'process_type', ''), 'operational'),
    nullif(p_process->>'scope', ''),
    'inactive'::public.record_status
  )
  returning id into v_process_id;

  return query select v_process_id, v_process_code;
end;
$$;

revoke all on function public.create_process_draft_with_document_header(jsonb, uuid) from public;
revoke execute on function public.create_process_draft_with_document_header(jsonb, uuid) from anon;
revoke execute on function public.create_process_draft_with_document_header(jsonb, uuid) from authenticated;
grant execute on function public.create_process_draft_with_document_header(jsonb, uuid) to service_role;

commit;
