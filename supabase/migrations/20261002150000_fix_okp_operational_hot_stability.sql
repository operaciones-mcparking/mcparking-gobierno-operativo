begin;

create or replace function public.customer_window_v2_list_operational_global_v1(
  p_from date,
  p_to date,
  p_family text,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with input_guard as materialized (
  select case
    when p_from is null or p_to is null or p_from > p_to then public.customer_window_global_review_v1_invalid('period')
    when p_family not in ('OKP', 'MCP_EAP') then public.customer_window_global_review_v1_invalid('family')
    when p_page is null or p_page < 1 or p_page_size is null or p_page_size < 1 or p_page_size > 100
      then public.customer_window_global_review_v1_invalid('pagination')
    when p_family = 'MCP_EAP' and (
      select count(*)
      from public.customer_related_review_snapshots snapshot
      where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
        and snapshot.status = 'active'
    ) <> 1 then public.customer_window_global_review_v1_invalid('snapshot_authority')
    else true end as valid
), active_snapshot as materialized (
  select snapshot.snapshot_id, snapshot.captured_at
  from public.customer_related_review_snapshots snapshot
  where snapshot.rule_key = 'RELATED_REVIEW_MCP_EAP_V1'
    and snapshot.status = 'active'
), source_rows as materialized (
  select b.source, b.source_row_id, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized, l.profile_id, l.status as link_status,
    greatest(
      b.created_at,
      b.updated_at,
      b.source_synced_at,
      coalesce(l.created_at, '-infinity'::timestamptz),
      coalesce(l.updated_at, '-infinity'::timestamptz)
    ) <= pg_catalog.now() - interval '30 minutes' as is_stable
  from input_guard guard
  join public.customer_source_bookings_okp b on guard.valid and p_family = 'OKP'
  left join public.customer_booking_profile_links l
    on l.source = 'OKP' and l.source_row_id = b.source_row_id
  where b.source_created_at >= p_from::timestamp without time zone
    and b.source_created_at < (p_to + 1)::timestamp without time zone
    and ((b.status_raw = 'PAGADA' and b.is_confirmed is true and b.is_paid is true)
      or (b.status_raw = 'REEMPLAZADA' and b.is_confirmed is true))

  union all

  select b.source, b.source_row_id, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized, l.profile_id, l.status,
    greatest(
      b.created_at,
      b.updated_at,
      b.source_synced_at,
      coalesce(l.created_at, '-infinity'::timestamptz),
      coalesce(l.updated_at, '-infinity'::timestamptz)
    ) <= snapshot.captured_at - interval '30 minutes' as is_stable
  from input_guard guard
  join public.customer_source_bookings_mcp_eap b on guard.valid and p_family = 'MCP_EAP'
  cross join active_snapshot snapshot
  left join public.customer_booking_profile_links l
    on l.source = 'MCP_EAP' and l.source_row_id = b.source_row_id
  where b.booking_status in (1, 8)
    and b.source_created_at >= p_from::timestamp without time zone
    and b.source_created_at < (p_to + 1)::timestamp without time zone
), classified as materialized (
  select row.*,
    case row.link_status when 'active' then 'confirmed_customer' else 'global_review' end representation_type
  from source_rows row
  join public.customer_profiles profile on profile.id = row.profile_id
    and profile.status = 'active' and profile.merged_into_profile_id is null
  where row.is_stable
    and (row.link_status = 'active'
      or (row.link_status in ('candidate', 'conflict') and profile.needs_review is true
        and not exists (
          select 1 from public.customer_booking_profile_links active_link
          where active_link.profile_id = row.profile_id and active_link.status = 'active'
        )))
), reconciliation as materialized (
  select
    count(*)::bigint as valid_reservations,
    count(*) filter (where is_stable)::bigint as stable_reservations,
    count(*) filter (where not is_stable)::bigint as hot_pending_reservations,
    (select count(*) from classified where representation_type = 'confirmed_customer')::bigint
      as represented_confirmed_reservations,
    (select count(*) from classified where representation_type = 'global_review')::bigint
      as represented_review_reservations
  from source_rows
), period_representations as materialized (
  select representation_type, profile_id,
    representation_type || ':' || profile_id::text as representation_key,
    count(*)::bigint reservations_in_period,
    max(source_created_at) last_booking_at_in_period
  from classified
  group by representation_type, profile_id
), paged as materialized (
  select * from period_representations
  order by last_booking_at_in_period desc, representation_key
  limit p_page_size offset (p_page::bigint - 1) * p_page_size
), history as materialized (
  select paged.representation_key, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized
  from paged
  join public.customer_booking_profile_links l on l.profile_id = paged.profile_id
    and ((paged.representation_type = 'confirmed_customer' and l.status = 'active')
      or (paged.representation_type = 'global_review' and l.status in ('candidate', 'conflict')))
  join public.customer_source_bookings_okp b
    on p_family = 'OKP' and l.source = 'OKP' and b.source = l.source and b.source_row_id = l.source_row_id
  where ((b.status_raw = 'PAGADA' and b.is_confirmed is true and b.is_paid is true)
      or (b.status_raw = 'REEMPLAZADA' and b.is_confirmed is true))

  union all

  select paged.representation_key, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized
  from paged
  join public.customer_booking_profile_links l on l.profile_id = paged.profile_id
    and ((paged.representation_type = 'confirmed_customer' and l.status = 'active')
      or (paged.representation_type = 'global_review' and l.status in ('candidate', 'conflict')))
  join public.customer_source_bookings_mcp_eap b
    on p_family = 'MCP_EAP' and l.source = 'MCP_EAP' and b.source = l.source and b.source_row_id = l.source_row_id
  where b.booking_status in (1, 8)
), review_history_all as materialized (
  select paged.representation_key, b.source, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized
  from paged
  join public.customer_booking_profile_links l on paged.representation_type = 'global_review'
    and l.profile_id = paged.profile_id and l.source = 'OKP'
    and l.status in ('candidate', 'conflict')
  join public.customer_source_bookings_okp b
    on b.source = l.source and b.source_row_id = l.source_row_id
  where ((b.status_raw = 'PAGADA' and b.is_confirmed is true and b.is_paid is true)
      or (b.status_raw = 'REEMPLAZADA' and b.is_confirmed is true))

  union all

  select paged.representation_key, b.source, b.source_created_at, b.is_pack,
    b.email_normalized, b.phone_normalized
  from paged
  join public.customer_booking_profile_links l on paged.representation_type = 'global_review'
    and l.profile_id = paged.profile_id and l.source = 'MCP_EAP'
    and l.status in ('candidate', 'conflict')
  join public.customer_source_bookings_mcp_eap b
    on b.source = l.source and b.source_row_id = l.source_row_id
  where b.booking_status in (1, 8)
), history_counts as materialized (
  select representation_key, count(*)::bigint source_reservations,
    count(*) filter (where is_pack is false)::bigint boleta_reservations,
    count(*) filter (where is_pack is true)::bigint pack_reservations,
    min(source_created_at) first_purchase_at,
    max(source_created_at) last_purchase_at
  from history group by representation_key
), review_history_counts as materialized (
  select representation_key, count(*)::bigint total_reservations,
    min(source_created_at) first_purchase_at,
    max(source_created_at) last_purchase_at,
    bool_or(source = 'MCP_EAP') has_mcp_eap,
    bool_or(source = 'OKP') has_okp
  from review_history_all group by representation_key
), contact_history as materialized (
  select history.representation_key, history.email_normalized, history.phone_normalized
  from history join paged using (representation_key)
  where paged.representation_type = 'confirmed_customer'
  union all
  select representation_key, email_normalized, phone_normalized
  from review_history_all
), observed_contacts as materialized (
  select history.representation_key, contact.type, contact.value
  from contact_history history
  cross join lateral (values
    ('email'::text, nullif(history.email_normalized, '')),
    ('phone'::text, nullif(history.phone_normalized, ''))
  ) contact(type, value)
  where contact.value is not null
  group by history.representation_key, contact.type, contact.value
), contacts as materialized (
  select representation_key,
    count(*) filter (where type = 'email')::bigint email_count,
    count(*) filter (where type = 'phone')::bigint phone_count,
    case when count(*) filter (where type = 'email') = 1 then max(value) filter (where type = 'email') end single_email,
    case when count(*) filter (where type = 'phone') = 1 then max(value) filter (where type = 'phone') end single_phone
  from observed_contacts group by representation_key
), direct_contacts as materialized (
  select paged.representation_key,
    count(distinct identity.identity_value_normalized) filter (where identity.identity_type = 'email')::bigint email_count,
    count(distinct identity.identity_value_normalized) filter (where identity.identity_type = 'phone')::bigint phone_count,
    case when count(distinct identity.identity_value_normalized) filter (where identity.identity_type = 'email') = 1
      then max(identity.identity_value_normalized) filter (where identity.identity_type = 'email') end single_email,
    case when count(distinct identity.identity_value_normalized) filter (where identity.identity_type = 'phone') = 1
      then max(identity.identity_value_normalized) filter (where identity.identity_type = 'phone') end single_phone
  from paged join public.customer_identity_links identity on paged.representation_type = 'confirmed_customer'
    and identity.profile_id = paged.profile_id and identity.status = 'active'
    and identity.identity_type in ('email', 'phone')
  group by paged.representation_key
)
select pg_catalog.jsonb_build_object(
  'family', p_family,
  'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'authoritySnapshotId', null,
    'representationType', paged.representation_type,
    'representationId', paged.profile_id,
    'representationKey', paged.representation_key,
    'customerId', case when paged.representation_type = 'confirmed_customer' then paged.profile_id end,
    'reviewProfileId', case when paged.representation_type = 'global_review' then paged.profile_id end,
    'relatedGroupId', null,
    'totalReservations', case paged.representation_type when 'confirmed_customer'
      then coalesce(metrics.total_reservations, counts.source_reservations)
      else review_counts.total_reservations end,
    'firstPurchaseAt', case paged.representation_type when 'confirmed_customer'
      then coalesce(metrics.first_purchase_at, counts.first_purchase_at)
      else review_counts.first_purchase_at end,
    'lastPurchaseAt', case paged.representation_type when 'confirmed_customer'
      then coalesce(metrics.last_purchase_at, counts.last_purchase_at)
      else review_counts.last_purchase_at end,
    'metricScope', case paged.representation_type when 'confirmed_customer' then 'all_confirmed_sources' else 'global_review_profile' end,
    'reservationsInPeriod', paged.reservations_in_period,
    'lastBookingAtInPeriod', paged.last_booking_at_in_period,
    'sourceReservations', counts.source_reservations,
    'boletaReservations', counts.boleta_reservations,
    'packReservations', counts.pack_reservations,
    'commercialTrajectory', case when paged.representation_type = 'global_review'
      then case when review_counts.has_mcp_eap and review_counts.has_okp then 'ACTIVITY_CROSS_SOURCE'
        when review_counts.has_okp then 'ACTIVITY_OKP' else 'ACTIVITY_MCP_EAP' end
      else coalesce(metrics.brand_behavior, case p_family when 'OKP' then 'ONLY_OKP' else 'ONLY_MCP_EAP' end) end,
    'trajectoryScope', case paged.representation_type when 'confirmed_customer' then 'confirmed_identity' else 'review_profile' end,
    'contactSummary', pg_catalog.jsonb_build_object(
      'semantics', case paged.representation_type when 'confirmed_customer' then 'direct' else 'observed' end,
      'emailCount', coalesce(direct.email_count, observed.email_count, 0),
      'phoneCount', coalesce(direct.phone_count, observed.phone_count, 0),
      'singleEmail', coalesce(direct.single_email, observed.single_email),
      'singlePhone', coalesce(direct.single_phone, observed.single_phone)
    )
  ) order by paged.last_booking_at_in_period desc, paged.representation_key) from paged
    join history_counts counts using (representation_key)
    left join review_history_counts review_counts using (representation_key)
    left join contacts observed using (representation_key)
    left join direct_contacts direct using (representation_key)
    left join public.customer_profile_metrics metrics on paged.representation_type = 'confirmed_customer'
      and metrics.customer_id = paged.profile_id), '[]'::jsonb),
  'total', (select count(*)::bigint from period_representations),
  'page', p_page,
  'pageSize', p_page_size,
  'validReservations', reconciliation.valid_reservations,
  'stableReservations', reconciliation.stable_reservations,
  'representedConfirmedReservations', reconciliation.represented_confirmed_reservations,
  'representedReviewReservations', reconciliation.represented_review_reservations,
  'hotPendingReservations', reconciliation.hot_pending_reservations,
  'unrepresentedStableReservations', reconciliation.stable_reservations
    - reconciliation.represented_confirmed_reservations
    - reconciliation.represented_review_reservations
)
from reconciliation;
$function$;

alter function public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer)
  owner to postgres;
revoke all on function public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_window_v2_list_operational_global_v1(date,date,text,integer,integer)
  to service_role;

commit;
