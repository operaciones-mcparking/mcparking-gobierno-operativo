"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type {
  CountryContextOption,
  SiteContextOption,
} from "@/components/dashboard/context-selector";

export function ContextStart({
  countries,
  nextPath,
  sites,
}: {
  countries: CountryContextOption[];
  nextPath: string;
  sites: SiteContextOption[];
}) {
  const router = useRouter();
  const [countryId, setCountryId] = useState("");
  const [siteId, setSiteId] = useState("");

  const visibleSites = useMemo(
    () => (countryId ? sites.filter((site) => site.country_id === countryId) : sites),
    [countryId, sites],
  );

  function enterWorkspace() {
    const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
    const [pathname, query = ""] = safeNext.split("?");
    const params = new URLSearchParams(query);

    if (countryId) {
      params.set("country_id", countryId);
    }

    if (siteId) {
      const site = sites.find((item) => item.id === siteId);
      params.set("site_id", siteId);

      if (site?.country_id) {
        params.set("country_id", site.country_id);
      }
    }

    const nextQuery = params.toString();
    router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  }

  return (
    <main className="flex min-h-screen bg-[#f4f7fa] text-ink">
      <section className="relative hidden min-h-screen w-[42%] overflow-hidden bg-navy p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="absolute inset-0 opacity-50">
          <div className="absolute -left-28 top-28 h-72 w-72 rounded-full border border-[#17a2b8]/25" />
          <div className="absolute bottom-20 right-[-120px] h-96 w-96 rounded-full border border-[#8ed8e5]/20" />
          <div className="absolute left-24 top-1/2 h-px w-72 rotate-[-24deg] bg-gradient-to-r from-transparent via-[#8ed8e5]/35 to-transparent" />
          <div className="absolute bottom-40 left-16 size-2 rounded-full bg-[#ffc107] shadow-[0_0_0_8px_rgba(255,193,7,0.12)]" />
          <div className="absolute right-24 top-32 size-2 rounded-full bg-[#8ed8e5] shadow-[0_0_0_8px_rgba(142,216,229,0.12)]" />
        </div>

        <div className="relative">
          <Image
            alt="McParking"
            className="h-16 w-auto"
            height={64}
            priority
            src="/mcparking-logo.svg"
            width={245}
          />
        </div>

        <div className="relative max-w-md">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#8ed8e5]">
            Contexto operativo
          </p>
          <h1 className="mt-4 text-3xl font-medium leading-tight">
            Elige la linea donde vas a trabajar.
          </h1>
          <p className="mt-4 text-sm leading-6 text-[#c8d9e8]">
            Todo lo que revises queda filtrado por pais y sede: procesos, roles, personas,
            sistemas y brechas.
          </p>
        </div>

        <p className="relative text-xs text-[#c8d9e8]">Acceso confirmado</p>
      </section>

      <section className="relative flex flex-1 items-center justify-center overflow-hidden px-5 py-10">
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <div className="login-network login-network-a" />
          <div className="login-network login-network-b" />
          <div className="login-network-line login-network-line-a" />
          <div className="login-network-line login-network-line-b" />
          <div className="login-network-line login-network-line-c" />
          <div className="login-network-node login-network-node-a" />
          <div className="login-network-node login-network-node-b" />
          <div className="login-network-node login-network-node-c" />
          <div className="login-network-node login-network-node-d" />
        </div>

        <div className="relative z-10 w-full max-w-[500px]">
          <div className="mb-8 lg:hidden">
            <div className="mx-auto flex w-fit rounded-xl bg-navy px-5 py-3 shadow-[0_14px_34px_rgba(2,53,116,0.16)]">
              <Image
                alt="McParking"
                className="h-10 w-auto"
                height={64}
                priority
                src="/mcparking-logo.svg"
                width={245}
              />
            </div>
          </div>

          <div className="border-l-4 border-clay pl-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-sea">
              Acceso confirmado
            </p>
            <h2 className="mt-2 text-[2rem] font-medium leading-tight text-navy">
              Seleccionar linea de trabajo
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Esto evita mezclar informacion entre paises, sedes propias y operaciones de
              clientes.
            </p>
          </div>

          <div className="mt-8 space-y-5">
            <label className="block text-sm font-medium text-navy">
              Pais
              <select
                className="mt-2 h-11 w-full rounded-lg border border-[#ccd9e5] bg-white px-3 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#dceff5]"
                onChange={(event) => {
                  setCountryId(event.target.value);
                  setSiteId("");
                }}
                value={countryId}
              >
                <option value="">Selecciona pais</option>
                {countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-navy">
              Sede
              <select
                className="mt-2 h-11 w-full rounded-lg border border-[#ccd9e5] bg-white px-3 text-sm outline-none transition focus:border-sea focus:ring-2 focus:ring-[#dceff5] disabled:bg-slate-100 disabled:text-slate-500"
                disabled={visibleSites.length === 0}
                onChange={(event) => {
                  const nextSiteId = event.target.value;
                  const site = sites.find((item) => item.id === nextSiteId);
                  setSiteId(nextSiteId);

                  if (site?.country_id) {
                    setCountryId(site.country_id);
                  }
                }}
                value={siteId}
              >
                <option value="">Selecciona sede</option>
                {visibleSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="h-11 w-full rounded-lg bg-navy px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[#034982] disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!siteId}
              onClick={enterWorkspace}
              type="button"
            >
              Entrar al sistema
            </button>
          </div>

          <p className="mt-5 text-xs leading-5 text-slate-500">
            Si necesitas acceso a otro pais o sede, debe agregarse en permisos de usuario.
          </p>
        </div>
      </section>
    </main>
  );
}
