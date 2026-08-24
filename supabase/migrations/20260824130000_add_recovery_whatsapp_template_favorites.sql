create table if not exists public.recovery_whatsapp_template_favorites (
  user_id uuid not null
    references public.user_profiles(user_id)
    on delete cascade,
  business_key text not null
    check (business_key in ('MPV', 'EAP')),
  template_name text not null,
  language text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, business_key, template_name, language)
);

alter table public.recovery_whatsapp_template_favorites enable row level security;

revoke all on table public.recovery_whatsapp_template_favorites from public, anon, authenticated;
grant select, insert, delete on table public.recovery_whatsapp_template_favorites to authenticated;

drop policy if exists recovery_whatsapp_template_favorites_select_own
  on public.recovery_whatsapp_template_favorites;
create policy recovery_whatsapp_template_favorites_select_own
  on public.recovery_whatsapp_template_favorites
  for select
  to authenticated
  using (
    auth.uid() = user_id
    and public.is_app_admin()
  );

drop policy if exists recovery_whatsapp_template_favorites_insert_own
  on public.recovery_whatsapp_template_favorites;
create policy recovery_whatsapp_template_favorites_insert_own
  on public.recovery_whatsapp_template_favorites
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.is_app_admin()
  );

drop policy if exists recovery_whatsapp_template_favorites_delete_own
  on public.recovery_whatsapp_template_favorites;
create policy recovery_whatsapp_template_favorites_delete_own
  on public.recovery_whatsapp_template_favorites
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    and public.is_app_admin()
  );
