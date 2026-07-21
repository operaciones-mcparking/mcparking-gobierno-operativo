-- Performance indexes for /recuperacion dashboard queries.
-- These indexes support recent recovery attribution, audit WhatsApp enrichment,
-- and on-demand chat lookup without exposing or modifying sensitive data.

create index if not exists idx_recovery_incomplete_form_datetime_id
  on public.recovery_incomplete_bookings_import (form_datetime, id)
  where form_datetime is not null;

create index if not exists idx_recovery_incomplete_phone_form_datetime
  on public.recovery_incomplete_bookings_import (phone_normalized, form_datetime)
  where phone_normalized is not null
    and form_datetime is not null;

create index if not exists idx_recovery_incomplete_email_form_datetime
  on public.recovery_incomplete_bookings_import (email_normalized, form_datetime)
  where email_normalized is not null
    and form_datetime is not null;

create index if not exists idx_recovery_incomplete_updated_at_source
  on public.recovery_incomplete_bookings_import (updated_at_source)
  where updated_at_source is not null;

create index if not exists idx_recovery_bookings_phone_created_at
  on public.recovery_bookings_import (phone_normalized, booking_created_at)
  where phone_normalized is not null
    and booking_created_at is not null
    and is_valid_purchase = true;

create index if not exists idx_recovery_bookings_email_created_at
  on public.recovery_bookings_import (email_normalized, booking_created_at)
  where email_normalized is not null
    and booking_created_at is not null
    and is_valid_purchase = true;

create index if not exists idx_recovery_bookings_created_at_valid
  on public.recovery_bookings_import (booking_created_at)
  where booking_created_at is not null
    and is_valid_purchase = true;

create index if not exists idx_recovery_tracking_client_phone_sent_at
  on public.recovery_whatsapp_tracking_import (client_phone_normalized, sent_at)
  where client_phone_normalized is not null
    and sent_at is not null;

create index if not exists idx_recovery_tracking_message_id_created_at
  on public.recovery_whatsapp_tracking_import (message_id, created_at desc)
  where message_id is not null;

create index if not exists idx_recovery_message_memory_wa_message_at
  on public.recovery_whatsapp_message_memory_import (wa_id_normalized, message_at)
  where wa_id_normalized is not null
    and message_at is not null;

create index if not exists idx_recovery_message_memory_inbound_wa_message_at
  on public.recovery_whatsapp_message_memory_import (wa_id_normalized, message_at)
  where message_bound_type = 'inbound'
    and wa_id_normalized is not null
    and message_at is not null;

create index if not exists idx_recovery_message_memory_raw_wa_message_at
  on public.recovery_whatsapp_message_memory_raw_import (wa_id_normalized, message_at)
  where wa_id_normalized is not null
    and message_at is not null;

create index if not exists idx_recovery_message_memory_raw_bound_wa_message_at
  on public.recovery_whatsapp_message_memory_raw_import (message_bound_type, wa_id_normalized, message_at)
  where wa_id_normalized is not null
    and message_at is not null;
