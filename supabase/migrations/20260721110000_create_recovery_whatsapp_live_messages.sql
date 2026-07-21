-- Live WhatsApp messages for the admin recovery chat drawer.
-- This table stores sensitive customer/operator message text. Use it only for
-- punctual admin-only chat views and n8n synchronization, not reports,
-- exports, aggregate dashboards, or broad search.

create table if not exists public.recovery_whatsapp_live_messages (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid references public.recovery_incomplete_bookings_import(id) on delete set null,
  phone_normalized text,
  email_normalized text,
  direction text not null,
  source text not null,
  message_text text not null,
  message_at timestamptz not null default now(),
  sent_by uuid,
  sent_by_email text,
  whatsapp_message_id text,
  whatsapp_status text,
  n8n_execution_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recovery_whatsapp_live_messages_direction_check
    check (direction in ('inbound', 'outbound')),
  constraint recovery_whatsapp_live_messages_source_check
    check (source in ('recovery_web', 'web_operator', 'n8n_inbound', 'n8n_outbound', 'n8n_system')),
  constraint recovery_whatsapp_live_messages_status_check
    check (
      whatsapp_status is null
      or whatsapp_status in ('pending', 'sent', 'delivered', 'read', 'failed', 'received')
    ),
  constraint recovery_whatsapp_live_messages_text_check
    check (length(trim(message_text)) > 0)
);

create index if not exists recovery_whatsapp_live_messages_cart_message_at_idx
  on public.recovery_whatsapp_live_messages(cart_id, message_at);

create index if not exists recovery_whatsapp_live_messages_phone_message_at_idx
  on public.recovery_whatsapp_live_messages(phone_normalized, message_at);

create index if not exists recovery_whatsapp_live_messages_whatsapp_message_id_idx
  on public.recovery_whatsapp_live_messages(whatsapp_message_id)
  where whatsapp_message_id is not null;

create index if not exists recovery_whatsapp_live_messages_created_at_idx
  on public.recovery_whatsapp_live_messages(created_at);

alter table public.recovery_whatsapp_live_messages enable row level security;

drop policy if exists recovery_whatsapp_live_messages_admin_all
  on public.recovery_whatsapp_live_messages;

create policy recovery_whatsapp_live_messages_admin_all
  on public.recovery_whatsapp_live_messages
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

revoke all on table public.recovery_whatsapp_live_messages from anon;
grant select, insert, update, delete on table public.recovery_whatsapp_live_messages to authenticated;

comment on table public.recovery_whatsapp_live_messages is
  'Sensitive live WhatsApp messages for admin recovery chat drawer and n8n synchronization. Contains message text; do not expose in reports, exports, aggregate dashboards, or broad search.';

comment on column public.recovery_whatsapp_live_messages.message_text is
  'Sensitive message text. Only show in the admin recovery Chat real drawer.';

comment on column public.recovery_whatsapp_live_messages.phone_normalized is
  'Normalized phone used only for scoped chat matching and n8n synchronization; do not expose in aggregates.';

comment on column public.recovery_whatsapp_live_messages.error_message is
  'Short operational error message for delivery troubleshooting. Do not store raw provider payloads.';
