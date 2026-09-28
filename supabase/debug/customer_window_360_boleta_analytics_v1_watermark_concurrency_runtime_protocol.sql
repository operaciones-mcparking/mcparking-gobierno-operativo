-- NON-PRODUCTION TWO-SESSION PROTOCOL.
-- Requires migration 20260925160000 in a disposable PostgreSQL database.
-- Do not run against production: the refresh and fixture cleanup perform writes.

-- SESSION A: start the writer and leave the transaction open before COMMIT.
begin;
insert into public.customer_profiles (
  id, status, resolver_version, needs_review
) values (
  '6f000000-0000-4000-8000-000000000001'::uuid,
  'active',
  'customer_identity_v2',
  false
);
select id, updated_at
from public.customer_profiles
where id = '6f000000-0000-4000-8000-000000000001'::uuid;
-- Stop here. Run SESSION B / STEP 1 while this transaction remains open.

-- SESSION B / STEP 1: the uncommitted profile must be invisible.
select public.customer_window_refresh_boleta_analytics_v1_m2m(null, 6);
select watermark_updated_at, watermark_tiebreaker
from public.customer_profile_boleta_analytics_incremental_state
where stream_key = 'customer_profiles';

-- SESSION A: commit only after SESSION B / STEP 1 has completed.
commit;

-- SESSION B / STEP 2: immediate replay must defer the now-visible hot profile.
select public.customer_window_refresh_boleta_analytics_v1_m2m(null, 6);
select
  profile.updated_at > pg_catalog.statement_timestamp() - interval '5 minutes'
    as fixture_is_still_hot,
  (state.watermark_updated_at, state.watermark_tiebreaker::uuid)
    < (profile.updated_at, profile.id) as cursor_has_not_crossed_fixture
from public.customer_profiles profile
cross join public.customer_profile_boleta_analytics_incremental_state state
where profile.id = '6f000000-0000-4000-8000-000000000001'::uuid
  and state.stream_key = 'customer_profiles';

-- SESSION B / STEP 3: after five minutes, repeat the bounded refresh until this is true.
select public.customer_window_refresh_boleta_analytics_v1_m2m(null, 6);
select
  (state.watermark_updated_at, state.watermark_tiebreaker::uuid)
    >= (profile.updated_at, profile.id) as late_commit_was_consumed
from public.customer_profiles profile
cross join public.customer_profile_boleta_analytics_incremental_state state
where profile.id = '6f000000-0000-4000-8000-000000000001'::uuid
  and state.stream_key = 'customer_profiles';

-- SESSION B / CLEANUP: disposable local database only.
delete from public.customer_profiles
where id = '6f000000-0000-4000-8000-000000000001'::uuid;
