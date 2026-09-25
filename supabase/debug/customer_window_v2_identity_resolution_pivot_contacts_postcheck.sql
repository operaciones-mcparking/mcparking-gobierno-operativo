-- READ-ONLY post-install certification for the real contradictory-phone case.
with params as (
  select '521edad56afd5fa741a192a4b9ed507b88467aa16ba3361c52497b3e2865f3bb'::text as group_id
), active_snapshot as (
  select snapshot.snapshot_id
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and snapshot.status = 'active'
), observed_phones as (
  select distinct booking.phone_normalized
  from params
  cross join active_snapshot snapshot
  join public.customer_related_review_members member
    on member.snapshot_id = snapshot.snapshot_id
   and member.group_id = params.group_id
   and member.source = 'MCP_EAP'
  join public.customer_source_bookings_mcp_eap booking
    on booking.source = member.source
   and booking.source_row_id = member.source_row_id
  where nullif(booking.phone_normalized, '') is not null
), direct_email_history as (
  select distinct booking.email_normalized
  from observed_phones pivot
  join public.customer_source_bookings_mcp_eap booking
    on booking.phone_normalized = pivot.phone_normalized
   and booking.source = 'MCP_EAP'
   and booking.booking_status in (1, 8)
  where nullif(booking.email_normalized, '') is not null
), payload as (
  select public.customer_window_v2_get_identity_resolution_detail(params.group_id) as value
  from params
), returned_emails as (
  select
    contact.value ->> 'value' as display_value,
    contact.value ->> 'relation' as relation,
    contact.value ->> 'relationReason' as relation_reason
  from payload
  cross join lateral pg_catalog.jsonb_array_elements(
    payload.value #> '{relatedContacts,emails}') contact(value)
), expected_matches as (
  select history.email_normalized,
    exists (
      select 1
      from returned_emails returned
      where pg_catalog.lower(pg_catalog.btrim(returned.display_value)) = history.email_normalized
        and (
          returned.relation = 'observed_in_group'
          or (returned.relation = 'historically_related'
            and returned.relation_reason = 'same_phone_history')
        )
    ) as returned
  from direct_email_history history
)
select
  (select count(*) from active_snapshot) = 1 as active_snapshot_unique,
  (select count(*) from observed_phones) as observed_phone_count,
  (select count(*) from direct_email_history) as direct_email_history_count,
  (select count(*) from returned_emails
    where relation = 'historically_related'
      and relation_reason = 'same_phone_history') as returned_same_phone_history_count,
  (select count(*) from expected_matches where not returned) as missing_direct_email_count,
  (select count(*) from direct_email_history) > 1
    and not exists (select 1 from expected_matches where not returned)
    and exists (select 1 from returned_emails
      where relation = 'historically_related'
        and relation_reason = 'same_phone_history') as real_case_explained,
  false as contains_pii;
