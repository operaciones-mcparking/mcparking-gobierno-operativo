begin;

do $$
begin
  if to_regclass('public.recovery_whatsapp_live_messages') is null then
    raise exception 'Missing table public.recovery_whatsapp_live_messages';
  end if;

  if to_regclass('public.recovery_incomplete_bookings_import') is null then
    raise exception 'Missing legacy table public.recovery_incomplete_bookings_import';
  end if;

  if to_regclass('public.recovery_incomplete_bookings_v2') is null then
    raise exception 'Missing table public.recovery_incomplete_bookings_v2';
  end if;
end;
$$;

alter table public.recovery_whatsapp_live_messages
  add column if not exists cart_v2_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'recovery_whatsapp_live_messages_cart_v2_id_fkey'
      and conrelid = 'public.recovery_whatsapp_live_messages'::regclass
  ) then
    alter table public.recovery_whatsapp_live_messages
      add constraint recovery_whatsapp_live_messages_cart_v2_id_fkey
      foreign key (cart_v2_id)
      references public.recovery_incomplete_bookings_v2(id)
      on delete set null
      on update no action;
  end if;
end;
$$;

create index if not exists recovery_whatsapp_live_messages_cart_v2_message_at_idx
  on public.recovery_whatsapp_live_messages(cart_v2_id, message_at);

comment on column public.recovery_whatsapp_live_messages.cart_v2_id is
  'Recovery V2 cart identity. Used in parallel with legacy cart_id during /recuperacion migration.';

do $$
declare
  v_ambiguous_legacy_live integer;
  v_ambiguous_v2_live integer;
  v_unmapped_live integer;
begin
  with legacy_duplicate_booking as (
    select booking_id
    from public.recovery_incomplete_bookings_import
    where booking_id is not null
    group by booking_id
    having count(*) > 1
  )
  select count(*)
  into v_ambiguous_legacy_live
  from public.recovery_whatsapp_live_messages as live
  join public.recovery_incomplete_bookings_import as legacy
    on legacy.id = live.cart_id
  join legacy_duplicate_booking as duplicate_booking
    on duplicate_booking.booking_id = legacy.booking_id
  where live.cart_id is not null;

  if v_ambiguous_legacy_live > 0 then
    raise exception 'Ambiguous legacy booking_id for live messages: %', v_ambiguous_legacy_live;
  end if;

  with live_legacy as (
    select distinct legacy.booking_id
    from public.recovery_whatsapp_live_messages as live
    join public.recovery_incomplete_bookings_import as legacy
      on legacy.id = live.cart_id
    where live.cart_id is not null
  ),
  v2_duplicate_booking as (
    select v2.booking_id
    from public.recovery_incomplete_bookings_v2 as v2
    join live_legacy using (booking_id)
    where v2.booking_id is not null
    group by v2.booking_id
    having count(*) > 1
  )
  select count(*)
  into v_ambiguous_v2_live
  from v2_duplicate_booking;

  if v_ambiguous_v2_live > 0 then
    raise exception 'Ambiguous V2 booking_id for live messages: %', v_ambiguous_v2_live;
  end if;

  select count(*)
  into v_unmapped_live
  from public.recovery_whatsapp_live_messages as live
  join public.recovery_incomplete_bookings_import as legacy
    on legacy.id = live.cart_id
  left join public.recovery_incomplete_bookings_v2 as v2
    on v2.booking_id = legacy.booking_id
  where live.cart_id is not null
    and v2.id is null;

  if v_unmapped_live > 0 then
    raise exception 'Unmapped live messages to V2 carts: %', v_unmapped_live;
  end if;
end;
$$;

update public.recovery_whatsapp_live_messages as live
set
  cart_v2_id = v2.id,
  updated_at = now()
from public.recovery_incomplete_bookings_import as legacy
join public.recovery_incomplete_bookings_v2 as v2
  on v2.booking_id = legacy.booking_id
where live.cart_id = legacy.id
  and live.cart_v2_id is null;

do $$
declare
  v_missing_v2_identity integer;
begin
  select count(*)
  into v_missing_v2_identity
  from public.recovery_whatsapp_live_messages
  where cart_id is not null
    and cart_v2_id is null;

  if v_missing_v2_identity > 0 then
    raise exception 'Live messages with legacy cart_id still missing cart_v2_id: %', v_missing_v2_identity;
  end if;
end;
$$;

commit;
