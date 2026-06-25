alter table public.systems
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists country_id uuid references public.countries(id) on delete set null,
  add column if not exists site_id uuid references public.sites(id) on delete set null;

create index if not exists systems_company_id_idx on public.systems(company_id);
create index if not exists systems_country_id_idx on public.systems(country_id);
create index if not exists systems_site_id_idx on public.systems(site_id);

update public.systems s
set company_id = a.company_id,
    country_id = c.country_id,
    site_id = site.id
from public.roles r
join public.areas a on a.id = r.area_id
join public.companies c on c.id = a.company_id
left join lateral (
  select st.id
  from public.sites st
  where st.company_id = a.company_id
    and (c.country_id is null or st.country_id = c.country_id)
    and st.status = 'active'::public.record_status
  order by st.name
  limit 1
) site on true
where s.owner_role_id = r.id
  and s.company_id is null;
