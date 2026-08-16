begin;

do $$
begin
  if to_regclass('public.process_role_profiles') is null then
    raise exception 'Missing table public.process_role_profiles';
  end if;

  if exists (
    select 1
    from (values ('id'), ('process_id'), ('role_id'), ('created_at')) as required(column_name)
    where not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'process_role_profiles'
        and column_name = required.column_name
    )
  ) then
    raise exception 'Missing required columns on public.process_role_profiles';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.process_role_profiles'::regclass
      and conname = 'process_role_profiles_pkey'
      and contype = 'p'
  ) then
    raise exception 'Missing primary key process_role_profiles_pkey';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.process_role_profiles'::regclass
      and conname = 'process_role_profiles_process_id_fkey'
      and contype = 'f'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.process_role_profiles'::regclass
      and conname = 'process_role_profiles_role_id_fkey'
      and contype = 'f'
  ) then
    raise exception 'Missing expected process_role_profiles foreign keys';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.process_role_profiles'::regclass
      and conname = 'process_role_profiles_process_id_role_id_key'
      and contype = 'u'
  ) then
    raise exception 'Missing constraint process_role_profiles_process_id_role_id_key';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'process_role_profiles'
      and column_name = 'sort_order'
  ) then
    raise exception 'Unexpected column public.process_role_profiles.sort_order already exists';
  end if;
end
$$;

alter table public.process_role_profiles
  add column sort_order integer;

with ordered_profiles as (
  select
    id,
    row_number() over (
      partition by process_id
      order by created_at, id
    ) - 1 as sort_order
  from public.process_role_profiles
)
update public.process_role_profiles as profile
set sort_order = ordered.sort_order
from ordered_profiles as ordered
where ordered.id = profile.id;

do $$
begin
  if exists (
    select 1
    from public.process_role_profiles
    where sort_order is null or sort_order < 0
  ) then
    raise exception 'Invalid process_role_profiles.sort_order after backfill';
  end if;
end
$$;

alter table public.process_role_profiles
  alter column sort_order set not null,
  add constraint process_role_profiles_sort_order_nonnegative
    check (sort_order >= 0),
  drop constraint process_role_profiles_process_id_role_id_key;

create index idx_process_role_profiles_process_sort_order
  on public.process_role_profiles(process_id, sort_order);

commit;