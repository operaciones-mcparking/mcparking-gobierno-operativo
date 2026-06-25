update public.sites s
set site_type = 'client_site'::public.site_type
from public.companies c
where c.id = s.company_id
  and c.company_type = 'client'::public.company_type
  and s.site_type <> 'client_site'::public.site_type;

update public.processes p
set owner_site_id = null
from public.sites s
join public.companies c on c.id = s.company_id
where p.owner_site_id = s.id
  and c.company_type = 'client'::public.company_type
  and s.site_type = 'client_site'::public.site_type;
