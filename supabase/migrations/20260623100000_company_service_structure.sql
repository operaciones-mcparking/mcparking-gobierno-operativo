create table if not exists public.company_relationships (
  id uuid primary key default gen_random_uuid(),
  provider_company_id uuid not null references public.companies(id) on delete cascade,
  client_company_id uuid not null references public.companies(id) on delete cascade,
  relationship_type text not null default 'service_client',
  description text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider_company_id <> client_company_id),
  check (relationship_type in ('service_client', 'internal_unit', 'partner')),
  unique (provider_company_id, client_company_id, relationship_type)
);

create table if not exists public.process_clients (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.processes(id) on delete cascade,
  client_company_id uuid not null references public.companies(id) on delete cascade,
  notes text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (process_id, client_company_id)
);

create index if not exists idx_company_relationships_provider
  on public.company_relationships(provider_company_id);

create index if not exists idx_company_relationships_client
  on public.company_relationships(client_company_id);

create index if not exists idx_process_clients_process
  on public.process_clients(process_id);

create index if not exists idx_process_clients_client
  on public.process_clients(client_company_id);

drop trigger if exists set_company_relationships_updated_at on public.company_relationships;
create trigger set_company_relationships_updated_at
  before update on public.company_relationships
  for each row execute function public.set_updated_at();

drop trigger if exists set_process_clients_updated_at on public.process_clients;
create trigger set_process_clients_updated_at
  before update on public.process_clients
  for each row execute function public.set_updated_at();

create or replace view public.v_company_service_network as
select
  provider.id as provider_company_id,
  provider.name as provider_company_name,
  client.id as client_company_id,
  client.name as client_company_name,
  cr.relationship_type,
  cr.description as relationship_description,
  cr.status as relationship_status,
  count(distinct pc.process_id) as process_count,
  string_agg(distinct p.name, ', ' order by p.name) as processes
from public.company_relationships cr
join public.companies provider on provider.id = cr.provider_company_id
join public.companies client on client.id = cr.client_company_id
left join public.process_clients pc
  on pc.client_company_id = client.id
  and pc.status = 'active'::public.record_status
left join public.processes p on p.id = pc.process_id
group by
  provider.id,
  provider.name,
  client.id,
  client.name,
  cr.relationship_type,
  cr.description,
  cr.status;
