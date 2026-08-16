-- Complete the Process Master V1 contract with separated flow fields.
-- Additive-only. Historical combined fields remain unchanged.
--
-- PRECHECK (read-only):
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'processes'
--   and column_name in ('supplier_origin', 'process_inputs', 'process_outputs', 'client_destination')
-- order by column_name;
-- Expected before first application: zero rows.
--
-- POSTCHECK (read-only):
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'processes'
--   and column_name in ('supplier_origin', 'process_inputs', 'process_outputs', 'client_destination')
-- order by column_name;
-- Expected: four nullable text columns. Existing process row counts and historical
-- inputs_providers / outputs_clients values must remain unchanged.

begin;

alter table public.processes
  add column if not exists supplier_origin text,
  add column if not exists process_inputs text,
  add column if not exists process_outputs text,
  add column if not exists client_destination text;

create or replace function public.create_process_draft_with_document_header(
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
    client_destination,
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
    process_code,
    process_end,
    process_inputs,
    process_outputs,
    process_start,
    process_type,
    scope,
    status,
    supplier_origin
  )
  values (
    nullif(p_process->>'area_id', '')::uuid,
    null,
    nullif(p_process->>'client_destination', ''),
    (p_process->>'company_id')::uuid,
    nullif(p_process->>'country_id', '')::uuid,
    coalesce(nullif(p_process->>'criticality', ''), 'medium')::public.criticality_level,
    null,
    'draft'::public.documentation_status,
    nullif(p_process->>'effective_date', '')::date,
    null,
    null,
    false,
    false,
    btrim(p_process->>'name'),
    nullif(p_process->>'purpose', ''),
    (p_process->>'company_id')::uuid,
    nullif(p_process->>'operating_site_id', '')::uuid,
    null,
    (p_process->>'company_id')::uuid,
    p_owner_role_id,
    nullif(p_process->>'owner_site_id', '')::uuid,
    v_process_code,
    nullif(p_process->>'process_end', ''),
    nullif(p_process->>'process_inputs', ''),
    nullif(p_process->>'process_outputs', ''),
    nullif(p_process->>'process_start', ''),
    coalesce(nullif(p_process->>'process_type', ''), 'operational'),
    nullif(p_process->>'scope', ''),
    'inactive'::public.record_status,
    nullif(p_process->>'supplier_origin', '')
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
