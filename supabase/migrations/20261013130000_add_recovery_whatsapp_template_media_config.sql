begin;

create table if not exists public.recovery_whatsapp_template_media_config (
  business_key text not null check (business_key in ('MPV', 'EAP')),
  template_name text not null check (length(trim(template_name)) > 0),
  language text not null check (length(trim(language)) > 0),
  component_type text not null check (component_type in ('HEADER')),
  media_format text not null check (media_format in ('IMAGE', 'VIDEO', 'DOCUMENT')),
  media_source text not null check (media_source in ('google_drive', 'https_url', 'meta_media_id')),
  drive_file_id text,
  media_url text,
  media_id text,
  label text,
  validation_status text not null default 'valid' check (validation_status in ('valid', 'invalid')),
  validation_error text,
  validated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_key, template_name, language, component_type),
  constraint recovery_whatsapp_template_media_config_reference_check check (
    (media_source = 'google_drive' and drive_file_id is not null and media_url is not null and media_id is null)
    or (media_source = 'https_url' and media_url is not null and media_id is null)
    or (media_source = 'meta_media_id' and media_id is not null)
  )
);

create index if not exists recovery_whatsapp_template_media_config_lookup_idx
  on public.recovery_whatsapp_template_media_config (business_key, template_name, language);

alter table public.recovery_whatsapp_template_media_config enable row level security;

revoke all on table public.recovery_whatsapp_template_media_config from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.recovery_whatsapp_template_media_config to authenticated, service_role;

drop policy if exists recovery_whatsapp_template_media_config_admin_select
  on public.recovery_whatsapp_template_media_config;
create policy recovery_whatsapp_template_media_config_admin_select
  on public.recovery_whatsapp_template_media_config
  for select
  to authenticated
  using (public.is_app_admin());

drop policy if exists recovery_whatsapp_template_media_config_admin_insert
  on public.recovery_whatsapp_template_media_config;
create policy recovery_whatsapp_template_media_config_admin_insert
  on public.recovery_whatsapp_template_media_config
  for insert
  to authenticated
  with check (public.is_app_admin());

drop policy if exists recovery_whatsapp_template_media_config_admin_update
  on public.recovery_whatsapp_template_media_config;
create policy recovery_whatsapp_template_media_config_admin_update
  on public.recovery_whatsapp_template_media_config
  for update
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists recovery_whatsapp_template_media_config_admin_delete
  on public.recovery_whatsapp_template_media_config;
create policy recovery_whatsapp_template_media_config_admin_delete
  on public.recovery_whatsapp_template_media_config
  for delete
  to authenticated
  using (public.is_app_admin());

comment on table public.recovery_whatsapp_template_media_config is
  'Persistent approved media association for /recuperacion WhatsApp template HEADER components.';

commit;
