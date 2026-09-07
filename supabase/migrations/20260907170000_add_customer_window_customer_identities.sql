begin;

create or replace function public.customer_window_get_customer_identities(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with customer_exists as (
  select 1
  from public.customer_profiles profile
  where profile.id = p_customer_id
    and profile.status = 'active'
),
confirmed as (
  select
    coalesce(array_agg(distinct link.identity_value_normalized order by link.identity_value_normalized)
      filter (where link.identity_type = 'email'), array[]::text[]) as emails,
    coalesce(array_agg(distinct link.identity_value_normalized order by link.identity_value_normalized)
      filter (where link.identity_type = 'phone'), array[]::text[]) as phones,
    coalesce(array_agg(distinct link.identity_value_normalized order by link.identity_value_normalized)
      filter (where link.identity_type = 'plate'), array[]::text[]) as plates
  from public.customer_identity_links link
  where link.profile_id = p_customer_id
    and link.status = 'active'
    and link.identity_type in ('email', 'phone', 'plate')
),
pending_plate_values as (
  select distinct
    link.identity_value_normalized as value,
    link.confidence
  from public.customer_identity_links link
  where link.profile_id = p_customer_id
    and link.status = 'candidate'
    and link.identity_type = 'plate'
),
pending_plates as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('value', pending.value, 'confidence', pending.confidence)
      order by pending.value, pending.confidence
    ),
    '[]'::jsonb
  ) as values
  from pending_plate_values pending
),
pending_counts as (
  select
    count(distinct link.identity_value_normalized) filter (where link.identity_type = 'email')::integer as emails,
    count(distinct link.identity_value_normalized) filter (where link.identity_type = 'phone')::integer as phones,
    count(distinct link.identity_value_normalized) filter (where link.identity_type = 'plate')::integer as plates
  from public.customer_identity_links link
  where link.profile_id = p_customer_id
    and link.status = 'candidate'
),
conflict_counts as (
  select
    count(distinct link.identity_value_normalized) filter (where link.identity_type = 'email')::integer as emails,
    count(distinct link.identity_value_normalized) filter (where link.identity_type = 'phone')::integer as phones,
    count(distinct link.identity_value_normalized) filter (where link.identity_type = 'plate')::integer as plates
  from public.customer_identity_links link
  where link.profile_id = p_customer_id
    and link.status = 'conflict'
)
select case
  when not exists (select 1 from customer_exists) then
    jsonb_build_object('ok', false, 'code', 'customer_not_found')
  else
    jsonb_build_object(
      'ok', true,
      'code', 'customer_identities_found',
      'customerId', p_customer_id,
      'confirmed', jsonb_build_object(
        'emails', confirmed.emails,
        'phones', confirmed.phones,
        'plates', confirmed.plates
      ),
      'pending', jsonb_build_object('plates', pending_plates.values),
      'pendingCounts', jsonb_build_object(
        'emails', pending_counts.emails,
        'phones', pending_counts.phones,
        'plates', pending_counts.plates
      ),
      'conflictCounts', jsonb_build_object(
        'emails', conflict_counts.emails,
        'phones', conflict_counts.phones,
        'plates', conflict_counts.plates
      )
    )
end
from confirmed
cross join pending_plates
cross join pending_counts
cross join conflict_counts;
$function$;

revoke all on function public.customer_window_get_customer_identities(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_window_get_customer_identities(uuid)
  to service_role;

comment on function public.customer_window_get_customer_identities(uuid) is
  'Returns confirmed identity values, candidate plates, and non-value conflict counts for one active Customer Window profile.';

commit;
