import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  Building2,
  Database,
  GitBranch,
  LogOut,
  Network,
  PlusCircle,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { ContextSelector } from "@/components/dashboard/context-selector";
import { getOperationalContextOptions } from "@/lib/dashboard/data";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const modules = [
  {
    items: [
      { href: "/estructura", icon: Network, label: "Estructura", helper: "Gobierno operativo" },
      { href: "/empresas", icon: Building2, label: "Empresas", helper: "McParking y clientes" },
      { href: "/roles-personas", icon: Users, label: "Roles y personas", helper: "Diccionario vivo" },
    ],
    label: "Estructura",
  },
  {
    items: [
      { href: "/procesos", icon: GitBranch, label: "Procesos", helper: "Modelo operativo" },
      { href: "/sistemas", icon: Database, label: "Sistemas", helper: "Herramientas" },
    ],
    label: "Operacion",
  },
  {
    items: [{ href: "/brechas", icon: AlertTriangle, label: "Brechas", helper: "Alertas y riesgos" }],
    label: "Control",
  },
];

const flatModules = modules.flatMap((group) => group.items);

function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      alt="McParking Gobierno operativo"
      className={compact ? "h-11 w-auto" : "h-14 w-auto"}
      height={64}
      src="/mcparking-logo.svg"
      width={245}
    />
  );
}

export async function DashboardShell({
  background = "mist",
  children,
  eyebrow,
  title,
  description,
}: {
  background?: "mist" | "white";
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("user_profiles")
        .select("app_role,status")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  const contextOptions = await getOperationalContextOptions();
  const userLabel = user?.email ?? "Usuario interno";
  const isAdmin = profile?.app_role === "admin" && profile.status === "active";

  return (
    <main
      className={`min-h-screen text-ink ${
        background === "white"
          ? "bg-white"
          : "bg-[#f6f8fa]"
      }`}
    >
      <div className="flex min-h-screen">
        <aside className="hidden w-76 shrink-0 border-r border-[#cbd8e3] bg-white/95 shadow-[10px_0_28px_rgba(2,53,116,0.06)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-80 lg:flex-col">
          <div className="bg-navy px-6 py-7">
            <Link className="inline-flex items-center" href="/">
              <BrandLogo />
            </Link>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto p-5">
            {modules.map((group) => (
              <div key={group.label}>
                <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((module) => {
                    const Icon = module.icon;

                    return (
                      <Link
                        className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-[#cbd8e3] hover:bg-[#f6f8fa] hover:text-navy"
                        href={module.href}
                        key={module.href}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#cbd8e3] bg-[#eef4f8] text-sea transition group-hover:border-sea group-hover:bg-white">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block leading-5">{module.label}</span>
                          <span className="block truncate text-xs font-normal text-slate-500">
                            {module.helper}
                          </span>
                        </span>
                        <span className="h-8 w-1 rounded-full bg-transparent transition group-hover:bg-clay" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-[#cbd8e3] bg-[#fbfdfe] p-5">
            {isAdmin ? (
              <Link
                className="flex items-center gap-3 rounded-xl bg-navy px-4 py-3 text-sm font-medium text-white shadow-[0_10px_22px_rgba(2,53,116,0.16)] transition hover:bg-[#034982]"
                href="/admin"
              >
                <PlusCircle className="h-5 w-5 text-clay" />
                <span className="flex-1">Administracion</span>
              </Link>
            ) : null}
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#cbd8e3] bg-white px-3 py-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef4f8] text-sea">
                <Settings className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-navy">MVP interno</p>
                <p className="max-w-40 truncate text-xs text-slate-500">{userLabel}</p>
              </div>
            </div>
            <form action={signOut}>
              <button
                className="mt-3 flex w-full items-center gap-3 rounded-xl border border-[#cbd8e3] bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-[#9bcbdc] hover:text-navy"
                type="submit"
              >
                <LogOut className="h-4 w-4 text-sea" />
                Cerrar sesion
              </button>
            </form>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="border-b border-[#cbd8e3] bg-navy px-4 py-3 lg:hidden">
            <Link className="inline-flex items-center" href="/">
              <BrandLogo compact />
            </Link>
            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {flatModules.map((module) => (
                <Link
                  className="whitespace-nowrap rounded-lg border border-line bg-mist px-3 py-2 text-sm font-semibold text-slate-700"
                  href={module.href}
                  key={module.href}
                >
                  {module.label}
                </Link>
              ))}
              {isAdmin ? (
                <Link
                  className="whitespace-nowrap rounded-lg border border-navy bg-navy px-3 py-2 text-sm font-semibold text-white"
                  href="/admin"
                >
                  Administracion
                </Link>
              ) : null}
            </nav>
          </div>

          <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
            <header className="border-b border-[#cbd8e3] bg-transparent pb-5">
              <div className="border-l-4 border-clay px-5 py-1 sm:px-6">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-sea">
                  {eyebrow}
                </p>
                <h1 className="max-w-4xl text-2xl font-medium leading-tight tracking-tight text-navy sm:text-[1.9rem]">
                  {title}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                  {description}
                </p>
              </div>
              {contextOptions.error ? null : (
                <ContextSelector
                  countries={contextOptions.countries}
                  sites={contextOptions.sites}
                />
              )}
            </header>

            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

export function Panel({
  action,
  children,
  count,
  description,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  count?: string;
  description?: string;
  title: string;
}) {
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-[#d6e1ea] bg-white shadow-[0_8px_22px_rgba(2,53,116,0.04)]">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="px-5 pt-5">
          <h2 className="text-base font-medium tracking-tight text-navy">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
          ) : null}
        </div>
        <div className="mx-5 mt-5 flex flex-wrap items-center gap-2 sm:ml-0">
          {count ? (
            <span className="w-fit rounded-md border border-[#d6e1ea] bg-[#f8fafb] px-2.5 py-1 text-xs font-medium text-slate-600">
              {count}
            </span>
          ) : null}
          {action}
        </div>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  status,
  tone = "neutral",
  value,
  variation,
}: {
  icon: LucideIcon;
  label: string;
  status?: string;
  tone?: "success" | "info" | "warning" | "danger" | "neutral";
  value: number | string;
  variation?: string;
}) {
  const toneClasses = {
    danger: "border-[#ffd4a3] bg-[#fff8ef] text-[#8a4a00]",
    info: "border-[#c9d8e4] bg-[#eef4f8] text-[#023574]",
    neutral: "border-[#d7e3ec] bg-[#f8fbfd] text-slate-600",
    success: "border-[#cfeeda] bg-[#f1fbf4] text-[#22613b]",
    warning: "border-[#ffe699] bg-[#fffaf0] text-[#765900]",
  };

  return (
    <div className="rounded-xl border border-[#d6e1ea] bg-white p-4 shadow-[0_8px_18px_rgba(2,53,116,0.035)] transition hover:border-[#9bcbdc] hover:shadow-[0_12px_24px_rgba(2,53,116,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d6e1ea] bg-[#f3f8fb] text-sea">
          <Icon className="h-4 w-4" />
        </div>
        {status ? (
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${toneClasses[tone]}`}>
            {status}
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-sm leading-5 text-slate-600">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-lg font-medium tracking-tight text-navy">{value}</p>
        {variation ? <p className="text-xs font-semibold text-slate-500">{variation}</p> : null}
      </div>
    </div>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex min-w-16 justify-center rounded px-2 py-1 text-xs font-semibold ${
        active ? "bg-[#ffe6ca] text-[#86510d]" : "bg-[#e4f4ea] text-[#24613d]"
      }`}
    >
      {active ? "Si" : "No"}
    </span>
  );
}
