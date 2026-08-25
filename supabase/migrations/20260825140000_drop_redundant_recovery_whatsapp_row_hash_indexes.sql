begin;

drop index if exists public.recovery_whatsapp_message_memory_row_hash_idx;
drop index if exists public.recovery_whatsapp_message_memory_raw_row_hash_idx;

commit;
