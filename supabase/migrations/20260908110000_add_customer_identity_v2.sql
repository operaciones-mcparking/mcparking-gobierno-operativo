begin;

alter table public.customer_profiles
  add column merged_into_profile_id uuid
  references public.customer_profiles(id);

alter table public.customer_profiles
  add constraint customer_profiles_merge_target_check
  check (
    (status = 'merged' and merged_into_profile_id is not null and id <> merged_into_profile_id)
    or (status <> 'merged' and merged_into_profile_id is null)
  );

create or replace function public.customer_window_resolve_identity_batch(
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  v_profile_was_created boolean;
  v_review_match_rule text;
  v_reused_review_rows integer := 0;
  v_resolver_version constant text := 'customer_identity_v2';
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'p_limit must be between 1 and 5000' using errcode = '22023';
  end if;

  -- Keep the existing lock key so v1 transactions and v2 callers cannot overlap.
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

    select coalesce(pg_catalog.array_agg(distinct link.profile_id), array[]::uuid[])
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
      and pg_catalog.cardinality(v_linked_profiles) <= 1
    then
      if pg_catalog.cardinality(v_linked_profiles) = 1 then
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
      v_profile_id := null;
      v_profile_was_created := false;
      v_review_match_rule := null;

      if v_booking.source = 'MCP_EAP'
        and v_booking.source_customer_id is not null
        and v_booking.email_normalized is not null
        and v_booking.phone_normalized is not null
        and pg_catalog.cardinality(v_linked_profiles) = 0
      then
        select profile.id,
          case
            when exists (
              select 1
              from public.customer_identity_links phone_link
              where phone_link.profile_id = profile.id
                and phone_link.source = 'MCP_EAP'
                and phone_link.identity_type = 'phone'
                and phone_link.identity_value_normalized = v_booking.phone_normalized
                and phone_link.status in ('candidate', 'conflict')
            ) then 'exact_review_profile'
            else 'source_customer_id_email_review'
          end
        into v_profile_id, v_review_match_rule
        from public.customer_profiles profile
        where profile.status = 'active'
          and profile.needs_review is true
          and exists (
            select 1
            from public.customer_booking_profile_links booking_link
            where booking_link.profile_id = profile.id
              and booking_link.source = 'MCP_EAP'
              and booking_link.status in ('candidate', 'conflict')
          )
          and exists (
            select 1
            from public.customer_identity_links source_link
            where source_link.profile_id = profile.id
              and source_link.source = 'MCP_EAP'
              and source_link.identity_type = 'source_customer_id'
              and source_link.identity_value_normalized = v_booking.source_customer_id
              and source_link.status in ('candidate', 'conflict')
          )
          and exists (
            select 1
            from public.customer_identity_links email_link
            where email_link.profile_id = profile.id
              and email_link.source = 'MCP_EAP'
              and email_link.identity_type = 'email'
              and email_link.identity_value_normalized = v_booking.email_normalized
              and email_link.status in ('candidate', 'conflict')
          )
          and exists (
            select 1
            from public.customer_identity_links review_phone
            where review_phone.profile_id = profile.id
              and review_phone.source = 'MCP_EAP'
              and review_phone.identity_type = 'phone'
              and review_phone.status in ('candidate', 'conflict')
          )
        order by
          case when exists (
            select 1
            from public.customer_identity_links exact_phone
            where exact_phone.profile_id = profile.id
              and exact_phone.source = 'MCP_EAP'
              and exact_phone.identity_type = 'phone'
              and exact_phone.identity_value_normalized = v_booking.phone_normalized
              and exact_phone.status in ('candidate', 'conflict')
          ) then 0 else 1 end,
          profile.created_at,
          profile.id
        limit 1
        for update of profile;
      end if;

      if v_profile_id is null then
        insert into public.customer_profiles (
          resolver_version, identity_confidence, needs_review
        ) values (
          v_resolver_version,
          case when v_booking.phone_normalized is not null or v_booking.email_normalized is not null then 'MEDIUM' else 'SUPPORT' end,
          true
        ) returning id into v_profile_id;
        v_profile_was_created := true;
        v_review_match_rule := 'new_review_profile';
      else
        v_reused_review_rows := v_reused_review_rows + 1;
        update public.customer_profiles
        set needs_review = true, updated_at = pg_catalog.clock_timestamp()
        where id = v_profile_id;
      end if;

      insert into public.customer_booking_profile_links (
        profile_id, source, source_row_id, confidence, status, resolver_version, evidence
      ) values (
        v_profile_id, v_booking.source, v_booking.source_row_id,
        case when v_booking.phone_normalized is not null or v_booking.email_normalized is not null then 'MEDIUM' else 'SUPPORT' end,
        case when v_conflict or pg_catalog.cardinality(v_linked_profiles) > 1 then 'conflict' else 'candidate' end,
        v_resolver_version,
        pg_catalog.jsonb_build_object(
          'contradictorySignals', v_conflict,
          'linkedProfileCount', pg_catalog.cardinality(v_linked_profiles),
          'matchedBySourceCustomerId', v_review_match_rule in ('exact_review_profile', 'source_customer_id_email_review'),
          'matchedByEmail', v_review_match_rule in ('exact_review_profile', 'source_customer_id_email_review'),
          'phoneVariant', v_review_match_rule = 'source_customer_id_email_review',
          'reusedReviewProfile', not v_profile_was_created,
          'reviewMatchRule', v_review_match_rule
        )
      ) on conflict (source, source_row_id) do nothing;

      if v_booking.phone_normalized is not null then
        insert into public.customer_identity_links (
          profile_id, identity_type, identity_value_normalized, source, confidence, status, evidence,
          first_seen_at, last_seen_at
        ) values (
          v_profile_id, 'phone', v_booking.phone_normalized, v_booking.source, 'MEDIUM',
          case when v_conflict then 'conflict' else 'candidate' end,
          pg_catalog.jsonb_build_object('sourceRowId', v_booking.source_row_id), v_booking.observed_at, v_booking.observed_at
        )
        on conflict (profile_id, identity_type, identity_value_normalized, source)
        do update set
          last_seen_at = greatest(customer_identity_links.last_seen_at, excluded.last_seen_at),
          updated_at = pg_catalog.clock_timestamp();
      end if;

      if v_booking.email_normalized is not null then
        insert into public.customer_identity_links (
          profile_id, identity_type, identity_value_normalized, source, confidence, status, evidence,
          first_seen_at, last_seen_at
        ) values (
          v_profile_id, 'email', v_booking.email_normalized, v_booking.source, 'MEDIUM',
          case when v_conflict then 'conflict' else 'candidate' end,
          pg_catalog.jsonb_build_object('sourceRowId', v_booking.source_row_id), v_booking.observed_at, v_booking.observed_at
        )
        on conflict (profile_id, identity_type, identity_value_normalized, source)
        do update set
          last_seen_at = greatest(customer_identity_links.last_seen_at, excluded.last_seen_at),
          updated_at = pg_catalog.clock_timestamp();
      end if;

      insert into public.customer_identity_resolution_events (
        profile_id, event_type, source, source_row_id, resolver_version, reason_code, evidence
      ) values (
        v_profile_id,
        case when v_conflict or pg_catalog.cardinality(v_linked_profiles) > 1 then 'conflict' else 'candidate' end,
        v_booking.source, v_booking.source_row_id, v_resolver_version,
        case
          when v_review_match_rule = 'exact_review_profile' then 'review_profile_reused_exact'
          when v_review_match_rule = 'source_customer_id_email_review' then 'review_profile_reused_source_customer_email'
          when v_conflict then 'contradictory_phone_email'
          when pg_catalog.cardinality(v_linked_profiles) > 1 then 'signals_link_multiple_profiles'
          when v_booking.phone_normalized is null or v_booking.email_normalized is null then 'insufficient_high_signals'
          else 'requires_review'
        end,
        pg_catalog.jsonb_build_object(
          'contradictorySignals', v_conflict,
          'phoneContradictory', v_emails_for_phone > 1,
          'emailContradictory', v_phones_for_email > 1,
          'emailsForPhone', v_emails_for_phone,
          'phonesForEmail', v_phones_for_email,
          'phoneBookingCount', v_phone_booking_count,
          'emailBookingCount', v_email_booking_count,
          'matchedBySourceCustomerId', v_review_match_rule in ('exact_review_profile', 'source_customer_id_email_review'),
          'matchedByEmail', v_review_match_rule in ('exact_review_profile', 'source_customer_id_email_review'),
          'phoneVariant', v_review_match_rule = 'source_customer_id_email_review',
          'reusedReviewProfile', not v_profile_was_created,
          'reviewMatchRule', v_review_match_rule
        )
      );
      v_conflict_rows := v_conflict_rows + case when v_conflict or pg_catalog.cardinality(v_linked_profiles) > 1 then 1 else 0 end;
    end if;

    if v_booking.plate_normalized is not null then
      insert into public.customer_identity_links (
        profile_id, identity_type, identity_value_normalized, source, confidence, status, evidence,
        first_seen_at, last_seen_at
      ) values (
        v_profile_id, 'plate', v_booking.plate_normalized, v_booking.source, 'SUPPORT', 'candidate',
        pg_catalog.jsonb_build_object('sourceRowId', v_booking.source_row_id), v_booking.observed_at, v_booking.observed_at
      ) on conflict (profile_id, identity_type, identity_value_normalized, source)
      do update set
        last_seen_at = greatest(customer_identity_links.last_seen_at, excluded.last_seen_at),
        updated_at = pg_catalog.clock_timestamp();
    end if;

    if v_booking.source = 'MCP_EAP' and v_booking.source_customer_id is not null then
      insert into public.customer_identity_links (
        profile_id, identity_type, identity_value_normalized, source, confidence, status, evidence,
        first_seen_at, last_seen_at
      ) values (
        v_profile_id, 'source_customer_id', v_booking.source_customer_id, 'MCP_EAP', 'SUPPORT', 'candidate',
        pg_catalog.jsonb_build_object('sourceRowId', v_booking.source_row_id), v_booking.observed_at, v_booking.observed_at
      ) on conflict (profile_id, identity_type, identity_value_normalized, source)
      do update set
        last_seen_at = greatest(customer_identity_links.last_seen_at, excluded.last_seen_at),
        updated_at = pg_catalog.clock_timestamp();
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'processedRows', v_processed,
    'highLinkedRows', v_high_rows,
    'reusedReviewRows', v_reused_review_rows,
    'candidateRows', v_processed - v_high_rows - v_conflict_rows,
    'conflictRows', v_conflict_rows,
    'resolverVersion', v_resolver_version
  );
end;
$function$;

create or replace function public.customer_window_merge_profiles_m2m(
  p_canonical_profile_id uuid,
  p_source_profile_ids uuid[],
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_all_profile_ids uuid[];
  v_booking_count integer := 0;
  v_canonical public.customer_profiles%rowtype;
  v_locked_profile_ids uuid[];
  v_metrics_result jsonb;
  v_signals_result jsonb;
  v_source_profile_ids uuid[];
begin
  if p_canonical_profile_id is null
    or p_source_profile_ids is null
    or pg_catalog.cardinality(p_source_profile_ids) < 1
    or pg_catalog.cardinality(p_source_profile_ids) > 100
  then
    raise exception 'Invalid profile merge request' using errcode = '22023';
  end if;
  if p_reason is null or pg_catalog.length(pg_catalog.btrim(p_reason)) < 5
    or pg_catalog.length(pg_catalog.btrim(p_reason)) > 500
  then
    raise exception 'Invalid profile merge reason' using errcode = '22023';
  end if;

  select pg_catalog.array_agg(distinct source_id order by source_id)
  into v_source_profile_ids
  from pg_catalog.unnest(p_source_profile_ids) source_id;
  if p_canonical_profile_id = any(v_source_profile_ids) then
    raise exception 'Canonical profile cannot be a source profile' using errcode = '22023';
  end if;
  v_all_profile_ids := pg_catalog.array_prepend(p_canonical_profile_id, v_source_profile_ids);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer_window_identity_resolver_v1', 0)
  );

  select pg_catalog.array_agg(locked.id order by locked.id)
  into v_locked_profile_ids
  from (
    select profile.id
    from public.customer_profiles profile
    where profile.id = any(v_all_profile_ids)
    order by profile.id
    for update
  ) locked;
  if coalesce(pg_catalog.cardinality(v_locked_profile_ids), 0) <> pg_catalog.cardinality(v_all_profile_ids) then
    raise exception 'Profile merge target not found' using errcode = 'P0002';
  end if;

  select * into v_canonical
  from public.customer_profiles
  where id = p_canonical_profile_id;
  if v_canonical.status <> 'active' or v_canonical.merged_into_profile_id is not null then
    raise exception 'Canonical profile must be active' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.customer_profiles profile
    where profile.id = any(v_source_profile_ids)
      and profile.status = 'merged'
      and profile.merged_into_profile_id <> p_canonical_profile_id
  ) then
    raise exception 'Source profile was merged into another canonical profile' using errcode = '40001';
  end if;
  if exists (
    select 1
    from public.customer_profiles profile
    where profile.id = any(v_source_profile_ids)
      and profile.status not in ('active', 'merged')
  ) then
    raise exception 'Source profile is not mergeable' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.customer_profiles profile
    where profile.id = any(v_source_profile_ids)
      and profile.status = 'active'
  ) then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'code', 'profiles_already_merged',
      'canonicalProfileId', p_canonical_profile_id,
      'sourceProfileCount', pg_catalog.cardinality(v_source_profile_ids),
      'reassignedBookings', 0
    );
  end if;

  update public.customer_booking_profile_links booking_link
  set profile_id = p_canonical_profile_id,
      status = 'active',
      evidence = booking_link.evidence || pg_catalog.jsonb_build_object(
        'manualMerge', true,
        'previousProfileId', booking_link.profile_id,
        'mergeReason', pg_catalog.btrim(p_reason)
      ),
      updated_at = pg_catalog.clock_timestamp()
  where booking_link.profile_id = any(v_source_profile_ids);
  get diagnostics v_booking_count = row_count;

  insert into public.customer_identity_links (
    profile_id, identity_type, identity_value_normalized, source, confidence, status,
    evidence, first_seen_at, last_seen_at, created_at, updated_at
  )
  select
    p_canonical_profile_id, identity.identity_type, identity.identity_value_normalized,
    identity.source, identity.confidence, identity.status,
    identity.evidence || pg_catalog.jsonb_build_object(
      'mergedFromProfileId', identity.profile_id,
      'mergeReason', pg_catalog.btrim(p_reason)
    ),
    identity.first_seen_at, identity.last_seen_at,
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  from public.customer_identity_links identity
  where identity.profile_id = any(v_source_profile_ids)
  on conflict (profile_id, identity_type, identity_value_normalized, source)
  do update set
    confidence = case
      when customer_identity_links.confidence = 'HIGH' or excluded.confidence = 'HIGH' then 'HIGH'
      when customer_identity_links.confidence = 'MEDIUM' or excluded.confidence = 'MEDIUM' then 'MEDIUM'
      else 'SUPPORT'
    end,
    status = case
      when customer_identity_links.status = 'active' or excluded.status = 'active' then 'active'
      when customer_identity_links.status = 'conflict' or excluded.status = 'conflict' then 'conflict'
      when customer_identity_links.status = 'candidate' or excluded.status = 'candidate' then 'candidate'
      else 'rejected'
    end,
    evidence = customer_identity_links.evidence || excluded.evidence,
    first_seen_at = least(customer_identity_links.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(customer_identity_links.last_seen_at, excluded.last_seen_at),
    updated_at = pg_catalog.clock_timestamp();

  update public.customer_profiles
  set status = 'merged',
      merged_into_profile_id = p_canonical_profile_id,
      needs_review = false,
      updated_at = pg_catalog.clock_timestamp()
  where id = any(v_source_profile_ids)
    and status = 'active';

  update public.customer_profiles
  set status = 'active',
      merged_into_profile_id = null,
      needs_review = false,
      resolver_version = 'customer_identity_v2',
      updated_at = pg_catalog.clock_timestamp()
  where id = p_canonical_profile_id;

  insert into public.customer_identity_resolution_events (
    profile_id, related_profile_id, event_type, resolver_version, reason_code, evidence
  )
  select source_id, p_canonical_profile_id, 'merge', 'customer_identity_v2', 'profiles_merged',
    pg_catalog.jsonb_build_object('reason', pg_catalog.btrim(p_reason))
  from pg_catalog.unnest(v_source_profile_ids) source_id
  where not exists (
    select 1
    from public.customer_identity_resolution_events existing
    where existing.profile_id = source_id
      and existing.related_profile_id = p_canonical_profile_id
      and existing.event_type = 'merge'
      and existing.reason_code = 'profiles_merged'
  );

  insert into public.customer_identity_resolution_events (
    profile_id, related_profile_id, event_type, resolver_version, reason_code, evidence
  )
  select p_canonical_profile_id, source_id, 'manual_override', 'customer_identity_v2', 'booking_reassigned',
    pg_catalog.jsonb_build_object('reason', pg_catalog.btrim(p_reason))
  from pg_catalog.unnest(v_source_profile_ids) source_id
  where not exists (
    select 1
    from public.customer_identity_resolution_events existing
    where existing.profile_id = p_canonical_profile_id
      and existing.related_profile_id = source_id
      and existing.event_type = 'manual_override'
      and existing.reason_code = 'booking_reassigned'
  );

  select public.customer_window_refresh_profile_metrics_m2m(
    v_all_profile_ids,
    pg_catalog.cardinality(v_all_profile_ids)
  ) into v_metrics_result;

  if pg_catalog.to_regprocedure(
    'public.customer_window_refresh_commercial_signals_m2m(uuid[])'
  ) is not null then
    execute 'select public.customer_window_refresh_commercial_signals_m2m($1)'
      into v_signals_result
      using v_all_profile_ids;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'code', 'profiles_merged',
    'canonicalProfileId', p_canonical_profile_id,
    'sourceProfileCount', pg_catalog.cardinality(v_source_profile_ids),
    'reassignedBookings', v_booking_count,
    'metricsRefresh', v_metrics_result,
    'signalsRefresh', v_signals_result
  );
end;
$function$;

create or replace function public.customer_window_preview_identity_consolidation_m2m()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with conflict_rows as materialized (
  select
    link.profile_id,
    link.source,
    link.source_row_id,
    booking.source_customer_id::text as source_customer_id,
    booking.email_normalized,
    booking.phone_normalized
  from public.customer_booking_profile_links link
  join public.customer_source_bookings_mcp_eap booking
    on link.source = 'MCP_EAP' and link.source_row_id = booking.source_row_id
  where link.status = 'conflict'
  union all
  select
    link.profile_id,
    link.source,
    link.source_row_id,
    null::text,
    booking.email_normalized,
    booking.phone_normalized
  from public.customer_booking_profile_links link
  join public.customer_source_bookings_okp booking
    on link.source = 'OKP' and link.source_row_id = booking.source_row_id
  where link.status = 'conflict'
),
exact_groups as (
  select source, source_customer_id, email_normalized, phone_normalized,
    count(distinct profile_id)::bigint as profiles,
    count(*)::bigint as bookings
  from conflict_rows
  where source = 'MCP_EAP' and source_customer_id is not null
    and email_normalized is not null and phone_normalized is not null
  group by source, source_customer_id, email_normalized, phone_normalized
  having count(distinct profile_id) > 1
),
source_email_phone_variant_groups as (
  select source_customer_id, email_normalized,
    count(distinct profile_id)::bigint as profiles,
    count(*)::bigint as bookings
  from conflict_rows
  where source = 'MCP_EAP' and source_customer_id is not null
    and email_normalized is not null
  group by source_customer_id, email_normalized
  having count(distinct profile_id) > 1 and count(distinct phone_normalized) > 1
),
ambiguous_email_groups as (
  select email_normalized,
    count(distinct profile_id)::bigint as profiles,
    count(*)::bigint as bookings
  from conflict_rows
  where email_normalized is not null
  group by email_normalized
  having count(distinct profile_id) > 1
    and (
      count(distinct source || ':' || coalesce(source_customer_id, '')) > 1
      or count(distinct phone_normalized) > 1
    )
),
ambiguous_phone_groups as (
  select phone_normalized,
    count(distinct profile_id)::bigint as profiles,
    count(*)::bigint as bookings
  from conflict_rows
  where phone_normalized is not null
  group by phone_normalized
  having count(distinct profile_id) > 1 and count(distinct email_normalized) > 1
),
categories as (
  select 1 as ordinal, 'A'::text as category, 'exact_source_customer_email_phone'::text as rule,
    count(*)::bigint as groups, coalesce(sum(profiles), 0)::bigint as profiles,
    coalesce(sum(profiles - 1), 0)::bigint as potential_excess_profiles,
    coalesce(sum(bookings), 0)::bigint as bookings,
    'HIGH'::text as confidence, true as auto_merge_candidate
  from exact_groups
  union all
  select 2, 'B', 'mcp_source_customer_email_phone_variant', count(*)::bigint,
    coalesce(sum(profiles), 0)::bigint, coalesce(sum(profiles - 1), 0)::bigint,
    coalesce(sum(bookings), 0)::bigint, 'MEDIUM', false
  from source_email_phone_variant_groups
  union all
  select 3, 'C', 'ambiguous_email_multiple_customer_or_phone', count(*)::bigint,
    coalesce(sum(profiles), 0)::bigint, coalesce(sum(profiles - 1), 0)::bigint,
    coalesce(sum(bookings), 0)::bigint, 'REVIEW', false
  from ambiguous_email_groups
  union all
  select 4, 'D', 'ambiguous_phone_multiple_emails', count(*)::bigint,
    coalesce(sum(profiles), 0)::bigint, coalesce(sum(profiles - 1), 0)::bigint,
    coalesce(sum(bookings), 0)::bigint, 'REVIEW', false
  from ambiguous_phone_groups
)
select pg_catalog.jsonb_build_object(
  'ok', true,
  'code', 'identity_consolidation_preview',
  'resolverVersion', 'customer_identity_v2',
  'containsPii', false,
  'categories', pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'category', category,
      'rule', rule,
      'groups', groups,
      'profiles', profiles,
      'potentialExcessProfiles', potential_excess_profiles,
      'bookings', bookings,
      'confidence', confidence,
      'autoMergeCandidate', auto_merge_candidate
    ) order by ordinal
  )
)
from categories;
$function$;

revoke all on function public.customer_window_resolve_identity_batch(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_merge_profiles_m2m(uuid, uuid[], text)
  from public, anon, authenticated, service_role;
revoke all on function public.customer_window_preview_identity_consolidation_m2m()
  from public, anon, authenticated, service_role;

grant execute on function public.customer_window_resolve_identity_batch(integer)
  to service_role;
grant execute on function public.customer_window_merge_profiles_m2m(uuid, uuid[], text)
  to service_role;
grant execute on function public.customer_window_preview_identity_consolidation_m2m()
  to service_role;

comment on function public.customer_window_resolve_identity_batch(integer) is
  'Identity v2 reuses compatible MCP/EAP review profiles while preserving conflicts for manual resolution.';
comment on function public.customer_window_merge_profiles_m2m(uuid, uuid[], text) is
  'Transactional, idempotent manual profile merge with append-only audit events and no physical deletes.';
comment on function public.customer_window_preview_identity_consolidation_m2m() is
  'Read-only aggregate preview of conflict consolidation categories without identity values.';

commit;
