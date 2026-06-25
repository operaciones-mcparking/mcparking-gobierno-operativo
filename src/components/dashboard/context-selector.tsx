"use client";

import { MapPin } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type CountryContextOption = {
  id: string;
  code: string | null;
  name: string;
};

export type SiteContextOption = {
  id: string;
  city: string | null;
  company_name: string | null;
  country_id: string | null;
  name: string;
  site_type: string | null;
};

export function ContextSelector({
  countries,
  sites,
}: {
  countries: CountryContextOption[];
  sites: SiteContextOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCountryId = searchParams.get("country_id") ?? "";
  const selectedSiteId = searchParams.get("site_id") ?? "";
  const visibleSites = selectedCountryId
    ? sites.filter((site) => site.country_id === selectedCountryId)
    : sites;
  const selectedSite = sites.find((site) => site.id === selectedSiteId);

  function updateContext(next: { countryId?: string; siteId?: string }) {
    const params = new URLSearchParams(searchParams.toString());

    if (next.countryId !== undefined) {
      if (next.countryId) {
        params.set("country_id", next.countryId);
      } else {
        params.delete("country_id");
      }
      params.delete("site_id");
    }

    if (next.siteId !== undefined) {
      const site = sites.find((item) => item.id === next.siteId);

      if (next.siteId) {
        params.set("site_id", next.siteId);
      } else {
        params.delete("site_id");
      }

      if (site?.country_id) {
        params.set("country_id", site.country_id);
      }
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#d6e1ea] bg-white px-4 py-3 shadow-[0_8px_18px_rgba(2,53,116,0.03)] lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#d6e1ea] bg-[#f3f8fb] text-sea">
          <MapPin className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-navy">Contexto operativo</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            {selectedSite
              ? `${selectedSite.company_name ?? "Empresa"} / ${selectedSite.name}`
              : "Elige país y sede para trabajar sobre una línea operacional."}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[520px]">
        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Pais
          <select
            className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]"
            onChange={(event) => updateContext({ countryId: event.target.value })}
            value={selectedCountryId}
          >
            <option value="">Todos los paises</option>
            {countries.map((country) => (
              <option key={country.id} value={country.id}>
                {country.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
          Sede
          <select
            className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-navy outline-none transition focus:border-sea focus:ring-2 focus:ring-[#e6edf3]"
            onChange={(event) => updateContext({ siteId: event.target.value })}
            value={selectedSiteId}
          >
            <option value="">Todas las sedes</option>
            {visibleSites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
