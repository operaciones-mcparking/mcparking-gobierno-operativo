-- Harden Recovery V2 /recuperacion compatibility function ACLs.
-- This migration only removes direct anon EXECUTE from the compat functions
-- created by 20261007140000_create_recovery_v2_recuperacion_compat.sql.

begin;

revoke execute on function public.recovery_v2_compat_normalize_phone(text)
  from anon;
revoke execute on function public.recovery_v2_compat_normalize_phone(text)
  from public;
grant execute on function public.recovery_v2_compat_normalize_phone(text)
  to authenticated, service_role;

revoke execute on function public.recovery_v2_compat_normalize_email(text)
  from anon;
revoke execute on function public.recovery_v2_compat_normalize_email(text)
  from public;
grant execute on function public.recovery_v2_compat_normalize_email(text)
  to authenticated, service_role;

revoke execute on function public.recovery_v2_compat_safe_jsonb(text)
  from anon;
revoke execute on function public.recovery_v2_compat_safe_jsonb(text)
  from public;
grant execute on function public.recovery_v2_compat_safe_jsonb(text)
  to authenticated, service_role;

revoke execute on function public.recovery_v2_compat_parse_date(text)
  from anon;
revoke execute on function public.recovery_v2_compat_parse_date(text)
  from public;
grant execute on function public.recovery_v2_compat_parse_date(text)
  to authenticated, service_role;

revoke execute on function public.recovery_v2_compat_parse_hour(text)
  from anon;
revoke execute on function public.recovery_v2_compat_parse_hour(text)
  from public;
grant execute on function public.recovery_v2_compat_parse_hour(text)
  to authenticated, service_role;

revoke execute on function public.recovery_v2_compat_santiago_wall_time(date, text)
  from anon;
revoke execute on function public.recovery_v2_compat_santiago_wall_time(date, text)
  from public;
grant execute on function public.recovery_v2_compat_santiago_wall_time(date, text)
  to authenticated, service_role;

revoke execute on function public.recovery_v2_compat_quoted_amount(jsonb)
  from anon;
revoke execute on function public.recovery_v2_compat_quoted_amount(jsonb)
  from public;
grant execute on function public.recovery_v2_compat_quoted_amount(jsonb)
  to authenticated, service_role;

revoke execute on function public.recovery_list_conversation_sessions_v2_compat(integer, integer, text, text)
  from anon;
revoke execute on function public.recovery_list_conversation_sessions_v2_compat(integer, integer, text, text)
  from public;
grant execute on function public.recovery_list_conversation_sessions_v2_compat(integer, integer, text, text)
  to authenticated, service_role;

revoke execute on function public.recovery_v2_compat_shadow_summary(timestamp with time zone, timestamp with time zone)
  from anon;
revoke execute on function public.recovery_v2_compat_shadow_summary(timestamp with time zone, timestamp with time zone)
  from public;
grant execute on function public.recovery_v2_compat_shadow_summary(timestamp with time zone, timestamp with time zone)
  to authenticated, service_role;

commit;
