begin;
create index if not exists customer_source_bookings_okp_valid_created_idx
  on public.customer_source_bookings_okp(source_created_at, source_row_id)
  where (status_raw = 'PAGADA' and is_confirmed is true and is_paid is true)
     or (status_raw = 'REEMPLAZADA' and is_confirmed is true);

create or replace function public.customer_window_resolve_identity_batch(
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_conflict boolean;
  v_conflict_rows integer := 0;
  v_email_booking_count integer := 0;
  v_emails_for_phone integer := 0;
  v_high_rows integer := 0;
  v_linked_profiles uuid[];
  v_phone_booking_count integer := 0;
  v_phones_for_email integer := 0;
  v_processed integer := 0;
  v_profile_id uuid;
  v_resolver_version constant text := 'customer_identity_v1';
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'p_limit must be between 1 and 5000' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_window_identity_resolver_v1', 0)
  );

  for v_booking in
    with okp_pending as materialized (
      select
        'OKP'::text as source,
        booking.source_row_id,
        booking.phone_normalized,
        booking.email_normalized,
        booking.plate_normalized,
        null::text as source_customer_id,
        booking.source_created_at as observed_at
      from public.customer_source_bookings_okp booking
      where (
          (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
          or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
        )
        and not exists (
          select 1 from public.customer_booking_profile_links existing
          where existing.source = 'OKP'
            and existing.source_row_id = booking.source_row_id
        )
      order by booking.source_created_at nulls last, booking.source_row_id
      limit p_limit
    ),
    mcp_pending as materialized (
      select
        'MCP_EAP'::text as source,
        booking.source_row_id,
        booking.phone_normalized,
        booking.email_normalized,
        booking.plate_normalized,
        booking.source_customer_id::text,
        booking.source_created_at as observed_at
      from public.customer_source_bookings_mcp_eap booking
      where booking.booking_status in (1, 8)
        and not exists (
          select 1 from public.customer_booking_profile_links existing
          where existing.source = 'MCP_EAP'
            and existing.source_row_id = booking.source_row_id
        )
      order by booking.source_created_at, booking.source_row_id
      limit p_limit
    ),
    pending as materialized (
      select * from okp_pending
      union all
      select * from mcp_pending
      order by observed_at nulls last, source, source_row_id
      limit p_limit
    ),
    batch_phones as materialized (
      select distinct phone_normalized
      from pending
      where phone_normalized is not null
    ),
    phone_stats as materialized (
      select
        requested.phone_normalized,
        count(distinct matched.email_normalized) filter (where matched.email_normalized is not null)::integer as emails_for_phone,
        count(matched.source_row_id)::integer as phone_booking_count
      from batch_phones requested
      left join lateral (
        select booking.source_row_id, booking.email_normalized
        from public.customer_source_bookings_okp booking
        where booking.phone_normalized = requested.phone_normalized
          and (
            (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
            or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
          )
        union all
        select booking.source_row_id, booking.email_normalized
        from public.customer_source_bookings_mcp_eap booking
        where booking.phone_normalized = requested.phone_normalized
          and booking.booking_status in (1, 8)
      ) matched on true
      group by requested.phone_normalized
    ),
    batch_emails as materialized (
      select distinct email_normalized
      from pending
      where email_normalized is not null
    ),
    email_stats as materialized (
      select
        requested.email_normalized,
        count(distinct matched.phone_normalized) filter (where matched.phone_normalized is not null)::integer as phones_for_email,
        count(matched.source_row_id)::integer as email_booking_count
      from batch_emails requested
      left join lateral (
        select booking.source_row_id, booking.phone_normalized
        from public.customer_source_bookings_okp booking
        where booking.email_normalized = requested.email_normalized
          and (
            (booking.status_raw = 'PAGADA' and booking.is_confirmed is true and booking.is_paid is true)
            or (booking.status_raw = 'REEMPLAZADA' and booking.is_confirmed is true)
          )
        union all
        select booking.source_row_id, booking.phone_normalized
        from public.customer_source_bookings_mcp_eap booking
        where booking.email_normalized = requested.email_normalized
          and booking.booking_status in (1, 8)
      ) matched on true
      group by requested.email_normalized
    )
    select
      pending.*,
      coalesce(phone_stats.emails_for_phone, 0) as emails_for_phone,
      coalesce(email_stats.phones_for_email, 0) as phones_for_email,
      coalesce(phone_stats.phone_booking_count, 0) as phone_booking_count,
      coalesce(email_stats.email_booking_count, 0) as email_booking_count
    from pending
    left join phone_stats using (phone_normalized)
    left join email_stats using (email_normalized)
    order by pending.observed_at nulls last, pending.source, pending.source_row_id
  loop
    v_processed := v_processed + 1;

    v_emails_for_phone := v_booking.emails_for_phone;
    v_phones_for_email := v_booking.phones_for_email;
    v_phone_booking_count := v_booking.phone_booking_count;
    v_email_booking_count := v_booking.email_booking_count;
    v_conflict :=
      (
        v_booking.phone_normalized is not null
        and v_emails_for_phone > case when v_booking.email_normalized is null then 0 else 1 end
      )
      or
      (
        v_booking.email_normalized is not null
        and v_phones_for_email > case when v_booking.phone_normalized is null then 0 else 1 end
      );
    select coalesce(array_agg(distinct link.profile_id), array[]::uuid[])
    into v_linked_profiles
    from public.customer_identity_links link
    join public.customer_profiles profile on profile.id = link.profile_id
    where profile.status = 'active'
      and link.status = 'active'
      and (
        (link.identity_type = 'phone' and link.identity_value_normalized = v_booking.phone_normalized)
        or (link.identity_type = 'email' and link.identity_value_normalized = v_booking.email_normalized)
      );

    if v_booking.phone_normalized is not null
      and v_booking.email_normalized is not null
      and not v_conflict
      and cardinality(v_linked_profiles) <= 1
    then
      if cardinality(v_linked_profiles) = 1 then
        v_profile_id := v_linked_profiles[1];
      else
        insert into public.customer_profiles (
          resolver_version, identity_confidence, needs_review
        ) values (
          v_resolver_version, 'HIGH', false
        ) returning id into v_profile_id;
      end if;

      insert into public.customer_booking_profile_links (
        profile_id, source, source_row_id, confidence, status, resolver_version, evidence
      ) values (
        v_profile_id, v_booking.source, v_booking.source_row_id, 'HIGH', 'active', v_resolver_version,
        pg_catalog.jsonb_build_object('rule', 'exact_phone_and_email_without_contradiction')
      ) on conflict (source, source_row_id) do nothing;

      insert into public.customer_identity_links (
        profile_id, identity_type, identity_value_normalized, source, confidence, status,
        evidence, first_seen_at, last_seen_at
      ) values
        (v_profile_id, 'phone', v_booking.phone_normalized, v_booking.source, 'HIGH', 'active',
          pg_catalog.jsonb_build_object('sourceRowId', v_booking.source_row_id), v_booking.observed_at, v_booking.observed_at),
        (v_profile_id, 'email', v_booking.email_normalized, v_booking.source, 'HIGH', 'active',
          pg_catalog.jsonb_build_object('sourceRowId', v_booking.source_row_id), v_booking.observed_at, v_booking.observed_at)
      on conflict (profile_id, identity_type, identity_value_normalized, source)
      do update set
        last_seen_at = greatest(customer_identity_links.last_seen_at, excluded.last_seen_at),
        updated_at = pg_catalog.clock_timestamp();

      insert into public.customer_identity_resolution_events (
        profile_id, event_type, source, source_row_id, resolver_version, reason_code, evidence
      ) values (
        v_profile_id, 'linked', v_booking.source, v_booking.source_row_id,
        v_resolver_version, 'exact_phone_and_email', '{}'::jsonb
      );
      v_high_rows := v_high_rows + 1;
    else
      insert into public.customer_profiles (
        resolver_version, identity_confidence, needs_review
      ) values (
        v_resolver_version,
        case when v_booking.phone_normalized is not null or v_booking.email_normalized is not null then 'MEDIUM' else 'SUPPORT' end,
        true
      ) returning id into v_profile_id;

      insert into public.customer_booking_profile_links (
        profile_id, source, source_row_id, confidence, status, resolver_version, evidence
      ) values (
        v_profile_id, v_booking.source, v_booking.source_row_id,
        case when v_booking.phone_normalized is not null or v_booking.email_normalized is not null then 'MEDIUM' else 'SUPPORT' end,
        case when v_conflict or cardinality(v_linked_profiles) > 1 then 'conflict' else 'candidate' end,
        v_resolver_version,
        pg_catalog.jsonb_build_object('contradictorySignals', v_conflict, 'linkedProfileCount', cardinality(v_linked_profiles))
      ) on conflict (source, source_row_id) do nothing;

      if v_booking.phone_normalized is not null then
        insert into public.customer_identity_links (
          profile_id, identity_type, identity_value_normalized, source, confidence, status, evidence,
          first_seen_at, last_seen_at
        ) values (
          v_profile_id, 'phone', v_booking.phone_normalized, v_booking.source, 'MEDIUM',
          case when v_conflict then 'conflict' else 'candidate' end,
          pg_catalog.jsonb_build_object('sourceRowId', v_booking.source_row_id), v_booking.observed_at, v_booking.observed_at
        );
      end if;

      if v_booking.email_normalized is not null then
        insert into public.customer_identity_links (
          profile_id, identity_type, identity_value_normalized, source, confidence, status, evidence,
          first_seen_at, last_seen_at
        ) values (
          v_profile_id, 'email', v_booking.email_normalized, v_booking.source, 'MEDIUM',
          case when v_conflict then 'conflict' else 'candidate' end,
          pg_catalog.jsonb_build_object('sourceRowId', v_booking.source_row_id), v_booking.observed_at, v_booking.observed_at
        );
      end if;

      insert into public.customer_identity_resolution_events (
        profile_id, event_type, source, source_row_id, resolver_version, reason_code, evidence
      ) values (
        v_profile_id,
        case when v_conflict or cardinality(v_linked_profiles) > 1 then 'conflict' else 'candidate' end,
        v_booking.source, v_booking.source_row_id, v_resolver_version,
        case
          when v_conflict then 'contradictory_phone_email'
          when cardinality(v_linked_profiles) > 1 then 'signals_link_multiple_profiles'
          when v_booking.phone_normalized is null or v_booking.email_normalized is null then 'insufficient_high_signals'
          else 'requires_review'
        end,
        case when v_conflict then
          pg_catalog.jsonb_build_object(
            'contradictorySignals', true,
            'phoneContradictory', v_emails_for_phone > 1,
            'emailContradictory', v_phones_for_email > 1,
            'emailsForPhone', v_emails_for_phone,
            'phonesForEmail', v_phones_for_email,
            'phoneBookingCount', v_phone_booking_count,
            'emailBookingCount', v_email_booking_count
          )
        else '{}'::jsonb end
      );
      v_conflict_rows := v_conflict_rows + case when v_conflict or cardinality(v_linked_profiles) > 1 then 1 else 0 end;
    end if;

    if v_booking.plate_normalized is not null then
      insert into public.customer_identity_links (
        profile_id, identity_type, identity_value_normalized, source, confidence, status, evidence,
        first_seen_at, last_seen_at
      ) values (
        v_profile_id, 'plate', v_booking.plate_normalized, v_booking.source, 'SUPPORT', 'candidate',
        pg_catalog.jsonb_build_object('sourceRowId', v_booking.source_row_id), v_booking.observed_at, v_booking.observed_at
      ) on conflict (profile_id, identity_type, identity_value_normalized, source) do nothing;
    end if;

    if v_booking.source = 'MCP_EAP' and v_booking.source_customer_id is not null then
      insert into public.customer_identity_links (
        profile_id, identity_type, identity_value_normalized, source, confidence, status, evidence,
        first_seen_at, last_seen_at
      ) values (
        v_profile_id, 'source_customer_id', v_booking.source_customer_id, 'MCP_EAP', 'SUPPORT', 'candidate',
        pg_catalog.jsonb_build_object('sourceRowId', v_booking.source_row_id), v_booking.observed_at, v_booking.observed_at
      ) on conflict (profile_id, identity_type, identity_value_normalized, source) do nothing;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'processedRows', v_processed,
    'highLinkedRows', v_high_rows,
    'candidateRows', v_processed - v_high_rows - v_conflict_rows,
    'conflictRows', v_conflict_rows,
    'resolverVersion', v_resolver_version
  );
end;
$$;

revoke all on function public.customer_window_resolve_identity_batch(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_window_resolve_identity_batch(integer)
  to service_role;

comment on function public.customer_window_resolve_identity_batch(integer) is
  'Incrementally links valid source bookings. Only an unambiguous exact phone+email pair auto-links; all other evidence remains provisional.';

commit;
