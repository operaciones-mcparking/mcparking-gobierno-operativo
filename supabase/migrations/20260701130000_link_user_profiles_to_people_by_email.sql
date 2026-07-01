-- Link auth profiles to internal people records when the authenticated email
-- matches exactly one active public.people.email. This only fills
-- user_profiles.person_id when it is currently null.

create or replace function public.ensure_user_profile_from_allowlist()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  current_domain text := split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 2);
  email_rule record;
  domain_rule record;
  selected_app_role public.app_role;
  selected_country_id uuid;
  selected_site_id uuid;
  selected_display_name text;
  matched_person_id uuid;
  matched_people_count integer;
begin
  if current_user_id is null or current_email = '' then
    return false;
  end if;

  select *
    into email_rule
    from public.auth_email_allowlist
    where lower(email) = current_email
      and status = 'active'::public.record_status
    limit 1;

  select *
    into domain_rule
    from public.auth_domain_allowlist
    where lower(domain) = current_domain
      and status = 'active'::public.record_status
    limit 1;

  if email_rule.id is null and domain_rule.id is null then
    return false;
  end if;

  select count(*), min(id)
    into matched_people_count, matched_person_id
    from public.people
    where lower(email) = current_email
      and status = 'active'::public.record_status;

  if matched_people_count <> 1 then
    matched_person_id := null;
  end if;

  selected_app_role := coalesce(email_rule.app_role, domain_rule.app_role, 'viewer'::public.app_role);
  selected_country_id := coalesce(email_rule.default_country_id, domain_rule.default_country_id);
  selected_site_id := coalesce(email_rule.default_site_id, domain_rule.default_site_id);
  selected_display_name := coalesce(email_rule.display_name, split_part(current_email, '@', 1));

  insert into public.user_profiles (
    user_id,
    person_id,
    display_name,
    email,
    app_role,
    default_country_id,
    default_site_id,
    status
  )
  values (
    current_user_id,
    matched_person_id,
    selected_display_name,
    current_email,
    selected_app_role,
    selected_country_id,
    selected_site_id,
    'active'::public.record_status
  )
  on conflict (user_id) do update
    set person_id = coalesce(public.user_profiles.person_id, excluded.person_id),
        display_name = excluded.display_name,
        email = excluded.email,
        app_role = excluded.app_role,
        default_country_id = excluded.default_country_id,
        default_site_id = excluded.default_site_id,
        status = excluded.status;

  if selected_site_id is not null then
    insert into public.user_site_access (
      user_id,
      country_id,
      site_id,
      access_level,
      status
    )
    select
      current_user_id,
      s.country_id,
      s.id,
      case
        when selected_app_role = 'admin'::public.app_role then 'admin'::public.site_access_level
        when selected_app_role = 'manager'::public.app_role then 'editor'::public.site_access_level
        else 'viewer'::public.site_access_level
      end,
      'active'::public.record_status
    from public.sites s
    where s.id = selected_site_id
    on conflict (user_id, site_id) do update
      set access_level = excluded.access_level,
          status = excluded.status;
  end if;

  return true;
end;
$$;

grant execute on function public.ensure_user_profile_from_allowlist() to authenticated;
