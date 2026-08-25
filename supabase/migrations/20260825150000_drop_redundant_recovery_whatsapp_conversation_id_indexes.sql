begin;

drop index if exists public.recovery_whatsapp_message_memory_conversation_id_idx;
drop index if exists public.recovery_whatsapp_message_memory_raw_conversation_id_idx;

commit;
