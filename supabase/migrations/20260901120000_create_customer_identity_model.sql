begin;

create table public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active',
  resolver_version text not null,
  identity_confidence text,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_profiles_status_check
    check (status in ('active', 'merged', 'blocked')),
  constraint customer_profiles_confidence_check
    check (identity_confidence is null or identity_confidence in ('HIGH', 'MEDIUM', 'SUPPORT'))
);

create table public.customer_identity_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.customer_profiles(id),
  identity_type text not null,
  identity_value_normalized text not null,
  source text not null,
  confidence text not null,
  status text not null,
  evidence jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_identity_links_type_check
    check (identity_type in ('phone', 'email', 'plate', 'source_customer_id')),
  constraint customer_identity_links_source_check
    check (source in ('OKP', 'MCP_EAP')),
  constraint customer_identity_links_confidence_check
    check (confidence in ('HIGH', 'MEDIUM', 'SUPPORT')),
  constraint customer_identity_links_status_check
    check (status in ('active', 'candidate', 'conflict', 'rejected')),
  constraint customer_identity_links_value_check
    check (length(trim(identity_value_normalized)) > 0),
  constraint customer_identity_links_profile_signal_unique
    unique (profile_id, identity_type, identity_value_normalized, source)
);

create table public.customer_booking_profile_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.customer_profiles(id),
  source text not null,
  source_row_id bigint not null,
  confidence text not null,
  status text not null,
  resolver_version text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_booking_profile_links_source_check
    check (source in ('OKP', 'MCP_EAP')),
  constraint customer_booking_profile_links_source_row_check
    check (source_row_id >= 0),
  constraint customer_booking_profile_links_confidence_check
    check (confidence in ('HIGH', 'MEDIUM', 'SUPPORT')),
  constraint customer_booking_profile_links_status_check
    check (status in ('active', 'candidate', 'conflict')),
  constraint customer_booking_profile_links_source_row_unique
    unique (source, source_row_id)
);

create table public.customer_identity_resolution_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.customer_profiles(id),
  related_profile_id uuid references public.customer_profiles(id),
  event_type text not null,
  source text,
  source_row_id bigint,
  resolver_version text not null,
  reason_code text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint customer_identity_resolution_events_type_check
    check (event_type in ('linked', 'candidate', 'conflict', 'merge', 'split', 'manual_override', 'rejected')),
  constraint customer_identity_resolution_events_source_check
    check (source is null or source in ('OKP', 'MCP_EAP'))
);

create index customer_identity_links_lookup_idx
  on public.customer_identity_links(identity_type, identity_value_normalized, status);

create index customer_identity_links_profile_idx
  on public.customer_identity_links(profile_id, status);

create index customer_booking_profile_links_profile_idx
  on public.customer_booking_profile_links(profile_id, source, source_row_id);

create index customer_identity_resolution_events_profile_created_idx
  on public.customer_identity_resolution_events(profile_id, created_at desc);

create index customer_source_bookings_mcp_eap_customer_id_idx
  on public.customer_source_bookings_mcp_eap(source_customer_id);

alter table public.customer_profiles enable row level security;
alter table public.customer_identity_links enable row level security;
alter table public.customer_booking_profile_links enable row level security;
alter table public.customer_identity_resolution_events enable row level security;

revoke all on table public.customer_profiles from public, anon, authenticated, service_role;
revoke all on table public.customer_identity_links from public, anon, authenticated, service_role;
revoke all on table public.customer_booking_profile_links from public, anon, authenticated, service_role;
revoke all on table public.customer_identity_resolution_events from public, anon, authenticated, service_role;

grant select, insert, update on table public.customer_profiles to service_role;
grant select, insert, update on table public.customer_identity_links to service_role;
grant select, insert, update on table public.customer_booking_profile_links to service_role;
grant select, insert on table public.customer_identity_resolution_events to service_role;

comment on table public.customer_profiles is
  'Private canonical Customer Window profiles. Identity values live in provenance-aware links.';
comment on table public.customer_booking_profile_links is
  'Auditable mapping from immutable source booking identity to a canonical or provisional customer profile.';
comment on table public.customer_identity_resolution_events is
  'Append-only audit history for deterministic and future manual identity decisions.';

commit;
